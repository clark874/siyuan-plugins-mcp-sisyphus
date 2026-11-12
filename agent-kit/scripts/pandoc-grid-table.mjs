/** @param {string} markdown */
function tableLines(markdown) {
    const lines = markdown.split(/\r\n?|\n/).map(line => {
        const quote = line.match(/^(?:[ \t]*>[ \t]?)*/)[0];
        return { text: line.slice(quote.length), depth: quote.split('>').length - 1, code: false };
    });
    for (let i = 0; i < lines.length; i += 1) {
        const { text, depth } = lines[i];
        const marker = text.match(/^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/)?.[0];
        const line = text.slice(marker?.length ?? 0);
        const opening = line.match(/^[ \t]*(`{3,}|~{3,})/);
        if (opening) {
            const indent = marker?.length ?? text.search(/[^ \t]/);
            const minIndent = marker || indent >= 4 ? indent : 0;
            const fence = opening[1];
            const closingFence = new RegExp(`^[ \\t]*${fence[0]}{${fence.length},}[ \\t]*$`);
            // 只有确实闭合的围栏才排除。未闭合的围栏不能遮住后面的表格。
            for (let j = i + 1; j < lines.length; j += 1) {
                const candidate = lines[j];
                const indent = candidate.text.search(/[^ \t]/);
                if (candidate.depth < depth || (indent >= 0 && indent < minIndent)) break;
                if (candidate.depth === depth && indent - minIndent < 4 && closingFence.test(candidate.text)) {
                    for (let k = i; k <= j; k += 1) lines[k].code = true;
                    i = j;
                    break;
                }
            }
        }
    }
    return lines;
}

/** 代码围栏中的示例不会作为待入库表格。 */
export function findUnsupportedTable(markdown) {
    const lines = tableLines(markdown);
    for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].code) continue;
        const text = lines[i].text.replace(/^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/, '').replace(/`+[^`]*`+/g, '');
        if (/<table\b/i.test(text)) return { line: i + 1, kind: 'HTML 表格' };
        const next = lines[i + 1];
        if (/^[ \t]*\+(?::?[-=]+:?\+)+[ \t]*$/.test(text)
            && next?.depth === lines[i].depth && !next.code && /^[ \t]*\|.*\|[ \t]*$/.test(next.text)) {
            return { line: i + 1, kind: 'Pandoc 网格表格' };
        }
    }
    return null;
}

/** 保留既有的网格表定位入口。 */
export function findPandocGridTableLine(markdown) {
    const found = findUnsupportedTable(markdown);
    return found?.kind === 'Pandoc 网格表格' ? found.line : null;
}

function tableCells(line) {
    let text = line.trim();
    if (text.startsWith('|')) text = text.slice(1);
    if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
    const cells = [];
    let value = '', fence = 0;
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (char === '\\' && i + 1 < text.length) { value += char + text[++i]; continue; }
        if (char === '`') {
            let run = 1;
            while (text[i + run] === '`') run += 1;
            if (!fence) fence = run;
            else if (run === fence) fence = 0;
            value += '`'.repeat(run);
            i += run - 1;
        } else if (char === '|' && !fence) { cells.push(value.trim()); value = ''; }
        else value += char;
    }
    cells.push(value.trim());
    return cells;
}

/** 按 GFM 管道表读取表头和数据行，保留单元格边界。 */
export function readMarkdownTables(markdown) {
    const lines = tableLines(markdown);
    const tables = [];
    for (let i = 0; i + 1 < lines.length; i += 1) {
        if (lines[i].code || lines[i + 1].code || !lines[i].text.includes('|') || !lines[i + 1].text.includes('|')) continue;
        const separator = tableCells(lines[i + 1].text);
        if (!separator.every(cell => /^:?-+:?$/.test(cell))) continue;
        const header = tableCells(lines[i].text);
        if (header.length !== separator.length) throw Error(`第 ${i + 1} 行表头与分隔行列数不一致`);
        const rows = [header];
        let end = i + 2;
        while (end < lines.length && !lines[end].code && lines[end].depth === lines[i].depth
            && lines[end].text.includes('|') && !/^\s*\{:/u.test(lines[end].text)) {
            const cells = tableCells(lines[end].text);
            if (cells.length > header.length) throw Error(`第 ${end + 1} 行表格单元格超过表头列数`);
            rows.push(cells.concat(Array(header.length - cells.length).fill('')));
            end += 1;
        }
        tables.push(rows);
        i = end - 1;
    }
    return tables;
}

function normalizedCell(cell) {
    const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    return cell.normalize('NFKC').replace(/\{:[^}]*\}/gu, '')
        .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/giu, (raw, name) => {
            if (!name.startsWith('#')) return entities[name.toLowerCase()] ?? raw;
            const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
            return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : raw;
        })
        .replace(/<br\s*\/?>/giu, ' ')
        .replace(/(\*{1,3}|_{1,3})(?=\S)([\s\S]*?\S)\1/gu, '$2')
        .replace(/\\([\\`*{}\[\]()#+.!_>|<~-])/gu, '$1')
        .replace(/[\u200b\u2060\ufeff]/gu, '').replace(/\s+/gu, ' ').trim();
}

/** 表数、行列以及全部单元格必须与规范输入一致。 */
export function assertMarkdownTablesMatch(source, stored) {
    const expected = readMarkdownTables(source);
    const actual = readMarkdownTables(stored);
    if (expected.length !== actual.length) throw Error(`表格回读数量不符：预期 ${expected.length}，实际 ${actual.length}`);
    for (let table = 0; table < expected.length; table += 1) {
        const a = expected[table], b = actual[table];
        if (a.length !== b.length || a.some((row, i) => row.length !== b[i]?.length)) {
            throw Error(`第 ${table + 1} 张表回读行列不符`);
        }
        for (let row = 0; row < a.length; row += 1) {
            for (let column = 0; column < a[row].length; column += 1) {
                if (normalizedCell(a[row][column]) !== normalizedCell(b[row][column])) {
                    throw Error(`第 ${table + 1} 张表第 ${row + 1} 行第 ${column + 1} 列回读不符`);
                }
            }
        }
    }
    return expected.length;
}

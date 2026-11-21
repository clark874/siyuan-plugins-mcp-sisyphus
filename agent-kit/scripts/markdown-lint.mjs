import { findUnsupportedTable, readMarkdownTables, tableLines } from './pandoc-grid-table.mjs';

const VALID_BLOCK_ID = /^\d{14}-[a-z0-9]{7}$/u;

function maskInlineCode(text) {
    // 保留每个占位的长度，使诊断继续对应原始文字位置。
    return text.replace(/(?<!`)(`+)(?!`).*?(?<!`)\1(?!`)/gu, code => ' '.repeat(code.length));
}

function escaped(text, index) {
    let slashes = 0;
    while (index > 0 && text[--index] === '\\') slashes += 1;
    return slashes % 2 === 1;
}

/** 检查输入文稿，不替换原文字。行、列从 1 起算，列按 Unicode 字符计。 */
export function lintMarkdown(markdown) {
    const lines = tableLines(markdown);
    const diagnostics = [];
    const add = (index, offset, rule, hint, severity = 'warning') => {
        const text = lines[index].source;
        diagnostics.push({ line: index + 1, column: [...text.slice(0, offset)].length + 1, rule,
            snippet: text.slice(Math.max(0, offset - 70), offset + 100), hint, severity });
    };
    const incompatible = findUnsupportedTable(markdown, lines);
    if (incompatible) {
        add(incompatible.line - 1, incompatible.index,
            incompatible.kind === 'Pandoc 网格表格' ? 'pandoc_grid_table' : 'html_table_unsupported',
            `检测到${incompatible.kind}。请对照原件核对并转换为规范 Markdown 管道表。`, 'error');
    }
    try { readMarkdownTables(markdown, lines); }
    catch (error) {
        if (!error.diagnostic) throw error;
        diagnostics.push(error.diagnostic);
    }

    let displayMath;
    for (let index = 0; index < lines.length; index += 1) {
        const { source, code } = lines[index];
        if (code) continue;
        const text = maskInlineCode(source);
        if (displayMath && !lines[index].text.trim() && !displayMath.separated) {
            displayMath.separated = true;
            add(displayMath.index, displayMath.offset, 'math_display_crosses_paragraph', '块公式内出现空行。请让一对 $$ 包住同一段公式。');
        }
        let inlineMath;
        for (const match of text.matchAll(/\$+/gu)) {
            const offset = match.index;
            if (escaped(text, offset)) continue;
            if (match[0] === '$$') {
                displayMath = displayMath ? undefined : { index, offset, separated: false };
            } else if (!displayMath && match[0] === '$') {
                if (inlineMath !== undefined && offset > 0 && /\S/u.test(text[offset - 1])) inlineMath = undefined;
                else if (inlineMath === undefined && /\S/u.test(text[offset + 1] ?? '')) inlineMath = offset;
            }
        }
        if (inlineMath !== undefined) {
            add(index, inlineMath, 'math_inline_unclosed', '行内公式缺少结束的 $。表示字面美元符号时可写成 \\$。');
        }
        for (const attr of text.matchAll(/\{:\s*([^{}]*)\}/gu)) {
            if (escaped(text, attr.index)) continue;
            // 思源原生表格允许每个单元格保有样式属性。
            if (text.slice(0, attr.index).trim() && !/^style\s*=/u.test(attr[1])) {
                add(index, attr.index, 'attribute_inline', '此位置的属性可能无法绑定到块。请把块属性放到内容后的独立行，或用属性接口写入。');
            }
            const alias = /\balias\s*=\s*(["'])(.*?)\1/u.exec(attr[1]);
            const comma = alias?.[2].indexOf(',') ?? -1;
            if (comma !== -1) {
                add(index, attr.index + attr[0].indexOf(alias[0]) + alias[0].indexOf(alias[1]) + 1 + comma,
                    'alias_comma', '英文逗号会把 alias 拆成多个别名。请核对是否确实需要分隔。');
            }
        }
        for (const match of text.matchAll(/\(\((\d{14}(?:-[\w-]*)?)(?=\s|\)\))/gu)) {
            if (!escaped(text, match.index) && !VALID_BLOCK_ID.test(match[1])) {
                add(index, match.index + 2, 'invalid_block_id', '块 ID 应为 14 位数字、连字符及 7 位小写字母或数字。');
            }
        }
        for (const match of text.matchAll(/\b\d{14}-[a-z0-9]+\b/giu)) {
            if (text.slice(Math.max(0, match.index - 2), match.index) !== '((' && !VALID_BLOCK_ID.test(match[0])) {
                add(index, match.index, 'invalid_block_id', '块 ID 应为 14 位数字、连字符及 7 位小写字母或数字。');
            }
        }
    }
    if (displayMath) add(displayMath.index, displayMath.offset, 'math_display_unclosed', '块公式缺少结束的 $$。');
    return diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);
}

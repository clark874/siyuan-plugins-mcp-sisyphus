import { createHash } from 'node:crypto';
import { literatureSourceMarkdown } from './literature-source.mjs';
import { roleAttribute, roleHashAttribute } from './tag-literature-roles.mjs';
import { writeLiteratureRecord } from './finalize-literature-ingest.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
const roles = new Set(['body', 'abstract', 'references', 'metadata', 'caption', 'unknown']);
const preservedRoles = new Set(['references', 'metadata']);

/** 属性和块顺序以实时 Kramdown 为准，SQL 仅补充类型和可核验正文。 */
export async function readTranslationSource(call, documentId) {
    for (let attempt = 0; ; attempt += 1) {
        try { return await readIndexedSource(call, documentId); }
        catch (error) {
            if (error.code !== 'literature_index_pending' || attempt === 4) throw error;
            await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
        }
    }
}

async function readIndexedSource(call, documentId) {
    const { kramdown } = await call('block', { action: 'get_kramdown', id: documentId });
    const indexed = new Map();
    let cursor = '';
    do {
        const result = await call('search', { action: 'query_sql', maxRows: 400, stmt:
            `SELECT id,type,subtype,content AS roleContent,markdown AS blockMarkdown FROM blocks WHERE root_id='${documentId}' AND id>'${cursor}' ORDER BY id LIMIT 400` });
        if (!Array.isArray(result.data) || result.truncated || result.kernelTruncated) throw Error('翻译块信息未完整返回');
        for (const row of result.data) indexed.set(row.id, { ...row, content: row.roleContent, markdown: row.blockMarkdown });
        cursor = result.data.length === 400 ? result.data.at(-1).id : '';
    } while (cursor);
    const blocks = [];
    for (const marker of kramdown.matchAll(/\{:[^\r\n]*?\}/gu)) {
        const attrs = Object.fromEntries([...marker[0].matchAll(/([^\s=]+)="((?:\\.|[^"\\])*)"/gu)].map(m => [m[1], m[2]]));
        const row = indexed.get(attrs.id);
        if (!row || row.type === 'd') continue;
        if (blocks.some(block => block.id === row.id)) throw Error('原文块顺序不唯一');
        const role = attrs[roleAttribute];
        if (role && !roles.has(role)) throw Error('文献角色无法识别，请先核对入库标记');
        if (attrs[roleHashAttribute] && sha(row.content) !== attrs[roleHashAttribute]) {
            throw Error('文献角色指纹已过期，请核对标记后再翻译');
        }
        blocks.push({ ...row, role, roleDigest: attrs[roleHashAttribute], marker: marker.index });
    }
    if (!blocks.length || [...indexed.values()].some(row => row.type !== 'd' && !blocks.some(block => block.id === row.id))) {
        throw Object.assign(Error('实时文献块与索引未对齐，请稍后重试'), { code: 'literature_index_pending' });
    }
    const original = literatureSourceMarkdown(kramdown);
    // 入库校验行不属于论文正文，规范化时已去除，配对也排除同一块。
    const cover = blocks[0];
    if (cover && /^原始MD SHA-256：[a-f0-9]{64}$/u.test(cover.content)
        && kramdown.startsWith(cover.markdown)) blocks.shift();
    const digest = sha(JSON.stringify([original, blocks.map(({ id, type, subtype, role, content }) => [id, type, subtype, role, content])]));
    const contentDigest = sha(JSON.stringify([original, blocks.map(({ id, type, subtype, content }) => [id, type, subtype, content])]));
    return { documentId, kramdown, original, blocks, digest, contentDigest };
}

/** 行内代码占位保留列表和引用缩进，恢复后保持原文的 Markdown 结构。 */
export function prepareTranslation(source) {
    const preserved = [];
    for (const block of source.blocks) {
        if (!preservedRoles.has(block.role)) continue;
        // 容器自身没有可独立替换的正文，内部叶块分别处理。
        if (['l', 'i', 'b', 's'].includes(block.type)) continue;
        const text = block.markdown;
        const start = text ? source.kramdown.lastIndexOf(text, block.marker - text.length) : -1;
        if (start < 0 || source.kramdown.slice(start + text.length, block.marker).trim()) {
            throw Error('无法精确定位保留原文的内容块：' + block.id);
        }
        const token = 'SISYPHUS_KEEP_' + block.id;
        if (source.original.includes(token)) throw Error('原文含有翻译占位标识');
        preserved.push({ start, end: start + text.length, text, token, role: block.role });
    }
    preserved.sort((a, b) => a.start - b.start);
    if (preserved.some((item, index) => index && item.start < preserved[index - 1].end)) throw Error('保留原文的块范围重叠');
    let masked = source.kramdown;
    for (const item of [...preserved].reverse()) {
        masked = masked.slice(0, item.start) + '`' + item.token + '`' + masked.slice(item.end);
    }
    return {
        text: literatureSourceMarkdown(masked), preservedCount: preserved.length,
        restore(translated) {
            for (const item of preserved) {
                const pattern = new RegExp('`' + item.token + '`', 'g');
                if ([...translated.matchAll(pattern)].length !== 1) throw Error('翻译器改变了保留原文的占位块');
                translated = translated.replace(pattern, () => item.text);
            }
            if (translated.includes('SISYPHUS_KEEP_')) throw Error('译文仍含未恢复的占位块');
            return translated;
        },
    };
}

export async function inheritTranslationRoles(call, source, translationId, marker) {
    if ((await readTranslationSource(call, source.documentId)).digest !== source.digest) throw Error('翻译期间原文角色已变化');
    const target = await readTranslationSource(call, translationId);
    const blocks = target.blocks.filter(block => block.content !== marker);
    if (source.blocks.length !== blocks.length || source.blocks.some((block, i) => block.type !== blocks[i].type
        || block.subtype !== blocks[i].subtype || ['c', 'm'].includes(block.type) && block.content !== blocks[i].content)) {
        throw Error('原文与译文块结构不一致，未建立角色继承和对照配对');
    }
    const items = source.blocks.flatMap((block, index) => {
        if (!block.role) return [];
        const current = blocks[index];
        if (current.role && current.role !== block.role) throw Error('译文已有不同角色，请先核对标记');
        if (current.role === block.role && current.roleDigest === sha(current.content)) return [];
        return [{ id: current.id, attrs: { [roleAttribute]: block.role, [roleHashAttribute]: sha(current.content) } }];
    });
    for (const block of target.blocks.filter(block => block.content === marker)) {
        if (block.role !== 'metadata' || block.roleDigest !== sha(block.content)) {
            items.push({ id: block.id, attrs: { [roleAttribute]: 'metadata', [roleHashAttribute]: sha(block.content) } });
        }
    }
    let targetDigest = target.digest;
    for (let start = 0; start < items.length; start += 100) {
        await writeLiteratureRecord(call, 'block', { action: 'set_attrs', items: items.slice(start, start + 100) }, async () => {
            if ((await readTranslationSource(call, source.documentId)).digest !== source.digest
                || (await readTranslationSource(call, translationId)).digest !== targetDigest) throw Error('角色继承期间文档已变化');
        });
        targetDigest = (await readTranslationSource(call, translationId)).digest;
    }
    const verified = await readTranslationSource(call, translationId);
    if (verified.contentDigest !== target.contentDigest
        || (await readTranslationSource(call, source.documentId)).digest !== source.digest) throw Error('角色继承期间文档已变化');
    if (items.some(item => !verified.blocks.some(block => block.id === item.id && block.role === item.attrs[roleAttribute]))) {
        throw Error('译文角色继承未通过回读');
    }
    return items.length;
}

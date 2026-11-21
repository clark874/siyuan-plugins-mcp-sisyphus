import type { SiYuanClient } from '../api/client';
import { querySQLWithMeta } from '../api/search';
import type { ToolCategory } from './config';
import type { PermissionManager } from './permissions';

type MarkdownFragment = { blockIndex: number; markdown: string };

export function markdownWriteFragments(category: ToolCategory, action: string, args: Record<string, unknown>): MarkdownFragment[] {
    const outputs: MarkdownFragment[] = [];
    const append = (text: unknown, blockIndex: number) => {
        if (typeof text === 'string') outputs.push({ markdown: text, blockIndex });
    };
    if (category === 'fs' && action === 'write' || category === 'document' && action === 'create') {
        append(args.markdown, 0);
    } else if (['fs', 'block'].includes(category) && action === 'replace') {
        const edits = Array.isArray(args.edit) ? args.edit : [args.edit];
        edits.forEach((edit, index) => append(edit?.new, index));
    } else if (category === 'block' && ['insert', 'prepend', 'append', 'update'].includes(action)) {
        const items = Array.isArray(args.items) ? args.items : Array.isArray(args.blocks) ? args.blocks : [args];
        items.forEach((item, index) => { if (item?.dataType === 'markdown') append(item.data, index); });
    } else if (category === 'fs' && action === 'write_atoms' && Array.isArray(args.atoms)) {
        args.atoms.forEach((atom, index) => append(atom?.markdown, index));
    }
    return outputs;
}

/** 未找到和未授权使用同一状态，避免以引用校验探测受限笔记本。 */
export async function inspectWriteReferences(client: SiYuanClient, permissions: PermissionManager, fragments: MarkdownFragment[]) {
    const references = new Map<string, { id: string; blockIndex: number; line: number }[]>();
    const maxReferences = 150;
    let checkedPartial = false;
    scan: for (const { markdown, blockIndex } of fragments) {
        let fence: string | undefined;
        for (const [lineIndex, line] of markdown.split(/\r\n?|\n/u).entries()) {
            const marker = line.match(/^\s*(?:>\s*)*(?:[-+*]\s+)?(`{3,}|~{3,})/u)?.[1];
            if (marker) {
                if (!fence) fence = marker;
                else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
                continue;
            }
            if (fence) continue;
            const text = line.replace(/`+[^`]*`+/gu, '').replace(/\{:[^}]*\}/gu, '');
            for (const match of text.matchAll(/(?<![\w-])(\d{14}-[a-z0-9]{7})(?![\w-])/gu)) {
                const id = match[1];
                if (!references.has(id)) {
                    if (references.size >= maxReferences) { checkedPartial = true; break scan; }
                    references.set(id, []);
                }
                const positions = references.get(id)!;
                if (positions.length < 5) positions.push({ id, blockIndex, line: lineIndex + 1 });
                else checkedPartial = true;
            }
        }
    }
    if (references.size === 0) return {};
    try {
        await permissions.reload();
        const readable = new Set<string>();
        const ids = [...references.keys()];
        for (let start = 0; start < ids.length; start += 50) {
            const values = ids.slice(start, start + 50).map(id => `'${id}'`).join(',');
            const result = await querySQLWithMeta(client, `SELECT id, box FROM blocks WHERE id IN (${values}) LIMIT 50`);
            if (result.kernelTruncated) throw new Error('索引回读不完整');
            for (const row of result.rows as { id?: string; box?: string }[]) {
                if (row.id && row.box && permissions.canRead(row.box)) readable.add(row.id);
            }
        }
        return {
            deadRefs: [...references].filter(([id]) => !readable.has(id)).flatMap(([, positions]) =>
                positions.map(position => ({ ...position, status: 'missing_or_unreadable' }))),
            referenceCheck: {
                status: checkedPartial ? 'partial' : 'checked',
                checkedIds: ids.length,
                hint: '只验证此刻可读的索引。请核对待创建的前向引用和刚写入但尚未索引的块，写后回读 refs。',
            },
        };
    } catch {
        return {
            referenceCheck: { status: 'unavailable', hint: '块索引未能完成核对。写后请回读引用，确认目标已存在且可读。' },
        };
    }
}

/** 预检只显示变化范围，控制长文重发和响应体积。 */
export function summarizeMarkdownDiff(before: string, after: string) {
    const left = before.split(/\r\n?|\n/u), right = after.split(/\r\n?|\n/u);
    let start = 0, end = 0;
    while (start < Math.min(left.length, right.length) && left[start] === right[start]) start += 1;
    while (end < Math.min(left.length, right.length) - start && left.at(-1 - end) === right.at(-1 - end)) end += 1;
    const part = (lines: string[]) => {
        const count = lines.length - start - end;
        const preview = lines.slice(start, start + Math.min(count, 12)).join('\n');
        return { lines: count, text: preview.slice(0, 1600), truncated: count > 12 || preview.length > 1600 };
    };
    return { line: start + 1, before: part(left), after: part(right) };
}

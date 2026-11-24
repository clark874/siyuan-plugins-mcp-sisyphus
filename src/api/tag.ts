import { SiYuanClient } from './client';
import { querySQLWithMeta } from './search';

const MANUAL = 6;
const RECENT = 16;
const PAGE_SIZE = 500;
const TAG_PREDICATE = "instr(lower(s.type), 'tag') > 0 AND s.type LIKE '%tag%'";
const names = new Intl.Collator('zh-Hans-u-co-pinyin');
const natural = new Intl.Collator('zh-Hans-u-co-pinyin', { numeric: true });
const escaped: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#34;', "'": '&#39;' };
const unescaped = new Map(Object.entries(escaped).map(([char, entity]) => [entity, char]));

type TagNode = {
    name: string;
    label: string;
    type: 'tag';
    depth: number;
    count: number;
    children: TagNode[] | null;
};

type TagListConfig = { conf?: { tag?: { sort?: number }; fileTree?: { maxListCount?: number } } };
type TagListOptions = { sort?: number; ignoreMaxListHint?: boolean; app?: string; excludedNotebooks?: string[] };

const sqlLiteral = (value: string) => "'" + value.replace(/\0/g, '').replace(/'/g, "''") + "'";
const omitNotebooks = (ids: string[]) => ids.length ? ` AND s.box NOT IN (${ids.map(sqlLiteral).join(',')})` : '';
const escapeLabel = (value: string) => value.replace(/[&<>"']/g, (char) => escaped[char]);

function unescapeLabel(value: string): string {
    return value.replace(/&(?:amp|lt|gt|#34|#39|quot|apos|#x22|#x27);/g, (entity) =>
        unescaped.get(entity) ?? (['&quot;', '&#x22;'].includes(entity) ? '"' : "'"));
}

async function readManualOrder(client: SiYuanClient): Promise<Record<string, string[]>> {
    try {
        const order = JSON.parse(await client.readFile('/data/.siyuan/tag-sort.json'));
        // 文件不存在时，getFile 可能以 HTTP 202 附带内核 404 返回。
        if (order?.code === 404) return {};
        if (order?.version !== 1 || !order.groups || typeof order.groups !== 'object' || Array.isArray(order.groups)
            || Object.values(order.groups).some((labels) => !Array.isArray(labels) || labels.some((label) => typeof label !== 'string'))) {
            throw new Error('思源标签手动顺序文件格式无效。');
        }
        return order.groups;
    } catch (error) {
        if (error instanceof Error && /^HTTP error: 404\b/.test(error.message)) return {};
        throw error;
    }
}

function parseTagDates(raw: unknown): Record<string, number> {
    if (typeof raw !== 'string' || !raw) return {};
    try {
        const value: unknown = JSON.parse(raw);
        return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, number> : {};
    } catch {
        return {};
    }
}

export async function listTags(
    client: SiYuanClient,
    options: TagListOptions = {},
): Promise<TagNode[]> {
    // getTag 在管理员会话中会写回全局排序。通过标签索引读取计数和排序所需的元数据。
    const configuration = options.sort === undefined || !options.ignoreMaxListHint
        ? await client.requestRead<TagListConfig>('/api/system/getConf', {}) : undefined;
    const sort = options.sort ?? configuration?.conf?.tag?.sort ?? 0;
    const order = sort === MANUAL ? await readManualOrder(client) : {};
    const counts = new Map<string, number>();
    const dates = new Map<string, number>();
    const predicate = TAG_PREDICATE + omitNotebooks(options.excludedNotebooks ?? []);
    const statement = sort === RECENT
        ? `SELECT s.content AS label, COUNT(*) AS count, COALESCE((SELECT a.value FROM attributes a
            WHERE a.block_id = s.block_id AND a.root_id = s.root_id AND a.box = s.box AND a.path = s.path
            AND a.name = 'custom-sy-tag-created' AND a.type = 'b' LIMIT 1), '') AS dates
            FROM spans s WHERE ${predicate}
            GROUP BY s.content, s.block_id, s.box, s.path ORDER BY s.content, s.block_id, s.box, s.path`
        : `SELECT s.content AS label, COUNT(*) AS count FROM spans s
            WHERE ${predicate} GROUP BY s.content ORDER BY s.content`;
    for (let offset = 0; ; ) {
        const result = await querySQLWithMeta(client, `${statement} LIMIT ${PAGE_SIZE} OFFSET ${offset}`);
        for (const row of result.rows as Array<{ label: string; count: number; dates?: string }>) {
            if (typeof row.label !== 'string') continue;
            const label = unescapeLabel(row.label);
            counts.set(label, (counts.get(label) ?? 0) + Number(row.count));
            if (sort === RECENT) {
                const date = parseTagDates(row.dates)[label];
                if (Number.isFinite(date)) dates.set(label, Math.max(dates.get(label) ?? 0, date));
            }
        }
        offset += result.rows.length;
        if (!result.rows.length || (!result.kernelTruncated && result.rows.length < PAGE_SIZE)) break;
    }

    const roots: TagNode[] = [];
    const nodes = new Map<string, TagNode>();
    const nodeDates = new Map<TagNode, number>();
    const nodeLabels = new Map<TagNode, string>();
    for (const [label, count] of counts) {
        let parent: TagNode | undefined;
        let path = '';
        for (const [depth, name] of label.split('/').entries()) {
            path = depth ? `${path}/${name}` : name;
            let node = nodes.get(path);
            if (!node) {
                node = { name, label: escapeLabel(path), type: 'tag', depth, count: 0, children: null };
                nodes.set(path, node);
                nodeLabels.set(node, path);
                (parent ? parent.children ??= [] : roots).push(node);
            }
            if (sort === RECENT) nodeDates.set(node, Math.max(nodeDates.get(node) ?? 0, dates.get(label) ?? 0));
            parent = node;
        }
        if (parent) parent.count = count;
    }

    function sortSiblings(siblings: TagNode[], parent: string) {
        const ranks = new Map((Object.prototype.hasOwnProperty.call(order, parent) ? order[parent] : []).map((label, i) => [label, i]));
        siblings.sort((a, b) => {
            const left = nodeLabels.get(a)!;
            const right = nodeLabels.get(b)!;
            const direction = [1, 5, 8].includes(sort) ? -1 : 1;
            const first = sort === MANUAL ? (ranks.get(left) ?? Infinity) - (ranks.get(right) ?? Infinity)
                : sort === RECENT ? (nodeDates.get(b) ?? 0) - (nodeDates.get(a) ?? 0)
                : sort === 7 || sort === 8 ? (a.count - b.count) * direction
                : sort === 0 || sort === 1 ? names.compare(a.name, b.name) * direction : 0;
            return first || natural.compare(a.name, b.name) * direction || (left < right ? -1 : left === right ? 0 : 1);
        });
        for (const node of siblings) if (node.children) sortSiblings(node.children, `${nodeLabels.get(node)}/`);
    }

    sortSiblings(roots, '');
    const limit = configuration?.conf?.fileTree?.maxListCount;
    if (options.ignoreMaxListHint || !Number.isSafeInteger(limit) || limit! < 1) return roots;
    function countNodes(node: TagNode): number {
        return 1 + (node.children?.reduce((count, child) => count + countNodes(child), 0) ?? 0);
    }
    let total = 0;
    const cut = roots.findIndex((node) => (total += countNodes(node)) > limit!);
    return cut === -1 ? roots : roots.slice(0, cut + 1);
}

/** 内核搜索接口只有全库模式，受限时先按笔记本限制索引再匹配词。 */
export async function searchReadableTags(client: SiYuanClient, keyword: string, excludedNotebooks: string[]) {
    const words = keyword.trim().split(/\s+/);
    const terms = words.map((word) => {
        const needle = word.replace(/[\\%_]/g, '\\$&');
        return `s.content LIKE ${sqlLiteral('%' + needle + '%')} ESCAPE '\\'`;
    });
    const result = await querySQLWithMeta(client,
        `SELECT DISTINCT s.content AS label FROM spans s WHERE ${TAG_PREDICATE}` +
        omitNotebooks(excludedNotebooks) + ` AND ${terms.join(' AND ')} ORDER BY s.content LIMIT ${PAGE_SIZE}`);
    const tags = result.rows.flatMap((row) => {
        const label = (row as { label?: unknown } | null)?.label;
        return typeof label === 'string' ? [escapeLabel(unescapeLabel(label))] : [];
    });
    return { k: keyword, tags: [...new Set(tags)] };
}

export async function renameTag(client: SiYuanClient, oldLabel: string, newLabel: string): Promise<null> {
    return client.requestWrite<null>('/api/tag/renameTag', { oldLabel, newLabel });
}

export async function removeTag(client: SiYuanClient, label: string): Promise<null> {
    return client.requestWrite<null>('/api/tag/removeTag', { label });
}

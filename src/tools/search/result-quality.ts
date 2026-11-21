import type { SiYuanClient } from '../../api/client';
import { fullTextSearchBlock } from '../../api/search';

type SearchBlock = Record<string, unknown>;
type FulltextRequest = Parameters<typeof fullTextSearchBlock>[1];
type FulltextResponse = Awaited<ReturnType<typeof fullTextSearchBlock>>;

export function splitSearchTokens(query: string): string[] {
    return [...new Set(query.split(/[\s,，。.；;：:、'"“”‘’()（）\[\]{}【】·！!？?]+/u)
        .map(token => token.trim()).filter(token => token.length >= 2 && /[\p{L}\p{N}]/u.test(token)))];
}

const normalized = (text: string) => text.normalize('NFKC').toLowerCase();
const noMarks = (text: string) => text.replace(/<\/?mark>/giu, '');
const textField = (block: SearchBlock, key: string) => typeof block[key] === 'string' ? block[key] as string : '';

export function searchCoverage(query: string, blocks: unknown[], checkTokens = true) {
    const tokens = checkTokens ? splitSearchTokens(query) : [];
    const texts = blocks.filter((block): block is SearchBlock => !!block && typeof block === 'object')
        .map(block => normalized(noMarks(['plainContent', 'content', 'fcontent', 'name', 'alias']
            .map(key => textField(block, key)).join('\n'))));
    const matchedTokens = tokens.filter(token => texts.some(text => text.includes(normalized(token))));
    const strong = tokens.length > 0 && texts.some(text => tokens.every(token => text.includes(normalized(token))));
    return {
        confidence: blocks.length === 0 ? 'none' : strong ? 'strong' : 'weak',
        matchedTokens,
        unmatchedTokens: tokens.filter(token => !matchedTokens.includes(token)),
        tokenCoverageScope: 'returned_results',
        confidenceBasis: 'lexical_token_coverage',
        ...(blocks.length === 0 ? { absenceEstablished: false, negativeResultScope: 'current_query_and_scope' } : {}),
        ...(blocks.length === 0 ? { queryHint: '当前查询未命中，不等于库中不存在。试用单个核心术语、别名或放宽检索范围。' }
            : strong ? {} : { queryHint: '当前结果仅部分覆盖查询词或来自其他召回信号。请按块回读，必要时换核心术语或别名。' }),
    };
}

/** 只在第一窗口的普通关键字查询为空时，用有界的字面词元做一次查询语法回退。 */
export async function keywordSearchWithFallback(
    client: SiYuanClient,
    request: FulltextRequest,
    hasReadableHits: (response: FulltextResponse) => boolean,
    allowFallback = true,
) {
    const initial = await fullTextSearchBlock(client, request);
    const tokens = splitSearchTokens(request.query).filter(token => token.length <= 128).slice(0, 8);
    if (!allowFallback || (request.method ?? 0) !== 0 || (request.page ?? 1) !== 1 || tokens.length < 2 || hasReadableHits(initial)) {
        return { result: initial };
    }
    const fallbackQuery = tokens.map(token => `"${token.replace(/"/g, '""')}"`).join(' OR ');
    try {
        const result = await fullTextSearchBlock(client, { ...request, method: 1, query: fallbackQuery });
        return { result, fallback: { status: 'applied', query: fallbackQuery, methodName: 'query_syntax', tokens } };
    } catch {
        return { result: initial, fallback: { status: 'unavailable', query: fallbackQuery, tokens } };
    }
}

function sourceLocation(block: SearchBlock) {
    return {
        id: textField(block, 'id'),
        box: textField(block, 'box'),
        rootId: textField(block, 'rootId') || textField(block, 'rootID') || textField(block, 'root_id'),
        hpath: textField(block, 'hPath') || textField(block, 'hpath'),
        path: textField(block, 'path'),
        type: textField(block, 'type'),
    };
}

const containerTypes = new Set(['l', 'i', 'b', 's', 'NodeList', 'NodeListItem', 'NodeBlockquote', 'NodeSuperBlock']);
const contentKey = (text: string) => text.replace(/\r\n/gu, '\n').trim();

function documentContentKey(block: SearchBlock, content: string): string | undefined {
    const { rootId, path, box } = sourceLocation(block);
    if (!content || (!rootId && !(box && path))) return undefined;
    return JSON.stringify([rootId || [box, path], content]);
}

export function textDuplicates<T extends SearchBlock>(blocks: T[], verifiedContent: ReadonlyMap<string, string>) {
    const groups = new Map<string, T[]>();
    const order: Array<T | T[]> = [];
    for (const block of blocks) {
        const id = textField(block, 'id');
        const content = contentKey(verifiedContent.get(id) ?? '');
        const key = documentContentKey(block, content);
        // 独立命名、验证或文档标题的块可能承担不同的逻辑地址和证据角色。
        if (!id || !key || ['d', 'NodeDocument'].includes(textField(block, 'type'))
            || ['name', 'alias', 'verificationStatus'].some(key => !!textField(block, key))) {
            order.push(block);
            continue;
        }
        const group = groups.get(key);
        if (group) group.push(block);
        else {
            const created = [block];
            groups.set(key, created);
            order.push(created);
        }
    }
    let duplicatesCollapsed = 0;
    const data = order.map(entry => {
        if (!Array.isArray(entry)) return entry;
        if (entry.length === 1) return entry[0];
        const rank = (item: SearchBlock) => {
            const source = sourceLocation(item);
            const location = source.hpath || source.path;
            return [location ? location.split('/').filter(Boolean).length : Number.MAX_SAFE_INTEGER,
                location ? location.length : Number.MAX_SAFE_INTEGER,
                Number(containerTypes.has(source.type))];
        };
        const ordered = [...entry].sort((left, right) => {
            const a = rank(left), b = rank(right);
            return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
        });
        duplicatesCollapsed += ordered.length - 1;
        const sources = [...new Set(ordered.flatMap(item => Array.isArray(item.sourceResultIds) ? item.sourceResultIds : []))];
        const related = new Map(ordered.flatMap(item => Array.isArray(item.relatedDocuments) ? item.relatedDocuments : [])
            .map(item => [item.id, item]));
        return {
            ...ordered[0],
            duplicateSources: ordered.slice(1).map(sourceLocation),
            ...(sources.length ? { sourceResultIds: sources } : {}),
            ...(related.size ? { relatedDocuments: [...related.values()] } : {}),
        };
    });
    return { data, duplicatesCollapsed };
}

/** 只有响应文本可能重复时才补读完整正文，避免按索引片段前缀误折叠。 */
export function possibleDuplicateIds(blocks: SearchBlock[]): string[] {
    const groups = new Map<string, string[]>();
    for (const block of blocks) {
        const id = textField(block, 'id');
        const content = contentKey(noMarks(textField(block, 'plainContent') || textField(block, 'content')));
        const key = documentContentKey(block, content);
        if (!id || !key) continue;
        const group = groups.get(key) ?? [];
        group.push(id);
        groups.set(key, group);
    }
    return [...new Set([...groups.values()].filter(group => group.length > 1).flat())];
}

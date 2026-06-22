import type { ToolCategory } from './config';
import type { ToolResult } from '@/tools/internal/shared';

interface SlimContext {
    category: ToolCategory;
    action: string;
}

const SUCCESS_KEEP_KEYS = new Set([
    'success',
    'id',
    'ids',
    'name',
    'title',
    'label',
    'oldLabel',
    'newLabel',
    'path',
    'paths',
    'from',
    'to',
    'fromID',
    'toID',
    'fromIDs',
    'toIDs',
    'notebook',
    'permission',
    'avID',
    'blockID',
    'keyID',
    'columnID',
    'rowID',
    'srcIDs',
    'count',
    'changed',
    'editsApplied',
    'replacements',
    'created',
    'updated',
    'removed',
    'overwritten',
    'folded',
    'partial',
    'reason',
    'warning',
    'skippedComplexBlocks',
    'recommendedTools',
]);

const TOP_LEVEL_DROP_KEYS = new Set([
    'action',
    'dataType',
    'previousID',
    'nextID',
    'parentID',
    'prepared',
    'materialized',
    'insertedAfter',
    'semantics',
    'sourceAvID',
    'iconHint',
    'showing',
    'contentLength',
    'returnedTotal',
    'returnedPageCount',
    'returnedHasNextPage',
    'kernelMatchedBlockCount',
    'kernelMatchedRootCount',
    'kernelPageCount',
    'kernelHasNextPage',
    'pagingHint',
    'paginationMode',
    'resolvedArgs',
    'totalRows',
    'matchedBlockCount',
    'matchedRootCount',
    'returnedHasNextPage',
    'returnedPageCount',
    'returnedTotal',
]);

const ITEM_DROP_KEYS = new Set([
    'markdown',
    'content',
    'blockPath',
    'rootID',
    'root_id',
    'parentID',
    'parent_id',
    'box',
    'ial',
    'sort',
    'sortMode',
    'icon',
    'newFlashcardCount',
    'dueFlashcardCount',
    'flashcardCount',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function createTextResult(result: ToolResult, value: unknown): ToolResult {
    const first = result.content[0];
    return {
        ...result,
        content: [{ ...(first ?? { type: 'text' as const }), type: 'text', text: JSON.stringify(value, null, 2) }],
    };
}

function shouldBypassSlimming(ctx: SlimContext): boolean {
    return ctx.action === 'help' || (ctx.category === 'system' && ctx.action === 'conf');
}

function slimError(error: Record<string, unknown>): Record<string, unknown> {
    const allowed = new Set([
        'type',
        'code',
        'message',
        'fields',
        'hint',
        'notebook',
        'current_permission',
        'required_permission',
        'validActions',
        'validTopics',
        'topic',
    ]);
    return Object.fromEntries(Object.entries(error).filter(([key]) => allowed.has(key)));
}

function slimSearchLikeItem(item: Record<string, unknown>): Record<string, unknown> {
    const slimmed: Record<string, unknown> = {};
    for (const key of ['id', 'type', 'subtype', 'hPath', 'path', 'notebookName']) {
        if (item[key] !== undefined) slimmed[key] = item[key];
    }

    if (item.plainContent !== undefined) {
        slimmed.plainContent = item.plainContent;
    } else if (item.excerpt !== undefined) {
        slimmed.excerpt = item.excerpt;
    } else if (item.content !== undefined) {
        slimmed.content = item.content;
    }

    return Object.keys(slimmed).length > 0 ? slimmed : slimGenericItem(item);
}

function slimGenericItem(item: Record<string, unknown>): Record<string, unknown> {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item)) {
        if (ITEM_DROP_KEYS.has(key)) continue;
        next[key] = slimValue(value);
    }
    return next;
}

function looksLikeSearchItem(item: Record<string, unknown>): boolean {
    return item.plainContent !== undefined
        || item.excerpt !== undefined
        || item.rootID !== undefined
        || item.root_id !== undefined
        || item.blockPath !== undefined;
}

function slimValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => {
            if (!isRecord(item)) return slimValue(item);
            return looksLikeSearchItem(item) ? slimSearchLikeItem(item) : slimGenericItem(item);
        });
    }
    if (!isRecord(value)) return value;
    return slimObject(value, { category: 'system', action: 'unknown' });
}

function slimUiRefresh(value: unknown): unknown {
    if (!isRecord(value)) return undefined;
    if ('partialFailure' in value) {
        return { partialFailure: value.partialFailure };
    }
    return undefined;
}

function slimSuccessObject(payload: Record<string, unknown>, ctx: SlimContext): Record<string, unknown> {
    const next: Record<string, unknown> = {};
    for (const key of SUCCESS_KEEP_KEYS) {
        if (payload[key] !== undefined) next[key] = payload[key];
    }

    const uiRefresh = slimUiRefresh(payload.uiRefresh);
    if (uiRefresh !== undefined) next.uiRefresh = uiRefresh;

    return Object.keys(next).length > 0 ? next : payload;
}

function slimObject(payload: Record<string, unknown>, ctx: SlimContext): Record<string, unknown> {
    if (isRecord(payload.error)) {
        return { error: slimError(payload.error) };
    }

    if (payload.success === true) {
        return slimSuccessObject(payload, ctx);
    }

    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
        if (key === 'uiRefresh') {
            const uiRefresh = slimUiRefresh(value);
            if (uiRefresh !== undefined) next.uiRefresh = uiRefresh;
            continue;
        }
        if (TOP_LEVEL_DROP_KEYS.has(key)) continue;
        next[key] = slimValue(value);
    }

    return next;
}

export function slimToolResult(result: ToolResult, ctx: SlimContext): ToolResult {
    if (shouldBypassSlimming(ctx)) return result;

    const first = result.content[0];
    if (!first || first.type !== 'text') return result;

    let parsed: unknown;
    try {
        parsed = JSON.parse(first.text);
    } catch {
        return result;
    }

    const slimmed = Array.isArray(parsed)
        ? parsed.map((item) => (isRecord(item) ? slimGenericItem(item) : slimValue(item)))
        : (isRecord(parsed) ? slimObject(parsed, ctx) : parsed);

    return createTextResult(result, slimmed);
}

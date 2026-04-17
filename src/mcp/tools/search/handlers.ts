import * as searchApi from '../../../api/search';
import type { SearchAction } from '../../config';
import { expandTypeShortcodes, normalizeFullTextSearchResult, resolveSortAlias, resolveTypeRecord, slimSearchBlocks } from '../../normalize';
import {
    SearchAssetsSchema,
    SearchFindReplaceSchema,
    SearchFulltextAssetContentSchema,
    SearchFulltextSchema,
    SearchGetAssetContentSchema,
    SearchGetBacklinksSchema,
    SearchGetBackmentionsSchema,
    SearchListInvalidRefsSchema,
    SearchQuerySqlSchema,
    SearchRefsSchema,
    SearchTagSchema,
} from '../../types';
import { ensurePermissionForDocumentId, ensurePermissionForNotebook, resolveNotebookForPath } from '../context';
import type { ToolActionHandler } from '../define-tool';
import { applyTruncation, createErrorResult, createJsonResult, createPaginatedResult, type ToolResult } from '../shared';
import {
    createPartialMetadata,
    filterBacklinkResultByPermission,
    filterFullTextSearchResultByPermission,
    filterItemsByPermission,
    isPermissionRelatedApiError,
} from './permission-filter';
import { assertReadOnlySql, getBacklinkDocWithFallback, getBackmentionDocWithFallback } from './sql-builder';

const SEARCH_TOOL_NAME = 'search';

type SearchFulltextArgs = ReturnType<(typeof SearchFulltextSchema)['parse']>;
type SearchFulltextAssetContentArgs = ReturnType<(typeof SearchFulltextAssetContentSchema)['parse']>;

function resolveFulltextTypes(parsed: SearchFulltextArgs): unknown {
    let resolvedTypes = parsed.types ? resolveTypeRecord(parsed.types) : parsed.types;
    if (parsed.typeShortcodes && parsed.typeShortcodes.length > 0) {
        const expanded = expandTypeShortcodes(parsed.typeShortcodes);
        resolvedTypes = { ...expanded, ...resolvedTypes };
    }
    return resolvedTypes;
}

function resolveFulltextRequestPageSize(parsed: SearchFulltextArgs): number | undefined {
    return parsed.parentId
        ? Math.min((parsed.pageSize ?? 32) * 3, 128)
        : parsed.pageSize;
}

function normalizeFulltextBlocks(normalized: unknown): Record<string, unknown> {
    const normalizedObj = normalized as Record<string, unknown>;
    if (Array.isArray(normalizedObj.blocks)) {
        normalizedObj.blocks = slimSearchBlocks(normalizedObj.blocks as unknown[]);
    }
    return normalizedObj;
}

function applyFulltextParentIdFilter(normalizedObj: Record<string, unknown>, parentId: string): void {
    if (!Array.isArray(normalizedObj.blocks)) return;
    const pid = parentId;
    normalizedObj.blocks = (normalizedObj.blocks as Array<Record<string, unknown>>).filter((block) =>
        block.rootID === pid || block.root_id === pid || block.parent_id === pid || block.parentID === pid,
    );
    normalizedObj.matchedBlockCount = (normalizedObj.blocks as unknown[]).length;
    normalizedObj.parentIdFilter = pid;
}

function applyFulltextHasTagsFilter(normalizedObj: Record<string, unknown>, hasTags: boolean): void {
    if (!Array.isArray(normalizedObj.blocks)) return;
    normalizedObj.blocks = (normalizedObj.blocks as Array<Record<string, unknown>>).filter((block) => {
        const tagField = typeof block.tag === 'string' ? (block.tag as string).trim() : '';
        const hasTag = tagField.length > 0;
        return hasTags ? hasTag : !hasTag;
    });
    normalizedObj.matchedBlockCount = (normalizedObj.blocks as unknown[]).length;
}

function createFulltextPaginatedResult(normalized: unknown, parsed: SearchFulltextArgs): ToolResult {
    const normalizedObj = normalized as Record<string, unknown>;
    const blocks = Array.isArray(normalizedObj.blocks)
        ? normalizedObj.blocks as unknown[]
        : [];
    const kernelRaw = normalized as Record<string, unknown>;
    const kernelPageCount = typeof kernelRaw.pageCount === 'number'
        ? kernelRaw.pageCount as number
        : 1;
    const page = parsed.page ?? 1;
    const pageSize = parsed.pageSize ?? 32;
    const truncated = applyTruncation(blocks, 20, `Use page/pageSize parameters to paginate. Current page: ${page}.`);
    const matchedBlockCount = typeof kernelRaw.matchedBlockCount === 'number'
        ? kernelRaw.matchedBlockCount as number
        : blocks.length;
    const { blocks: _ignoredBlocks, pageCount: _ignoredPageCount, ...restRaw } = kernelRaw;
    void _ignoredBlocks;
    void _ignoredPageCount;
    return createPaginatedResult(truncated.items, {
        total: matchedBlockCount,
        page,
        pageSize,
        pageCount: kernelPageCount,
        hasNextPage: page < kernelPageCount,
    }, {
        ...restRaw,
        ...(truncated.meta ? truncated.meta : {}),
        ...(parsed.parentId && blocks.length === 0 ? {
            warning: 'No matching blocks were found in the requested document subtree. If the content was just created or updated, SiYuan full-text indexing may still be catching up; retry shortly.',
        } : {}),
    });
}

function createSqlQueryResult(rows: unknown[], removedCount: number): ToolResult {
    const truncated = applyTruncation(rows, 50, 'Add LIMIT and OFFSET to your SQL for pagination.');
    const total = rows.length;
    return createPaginatedResult(truncated.items, {
        total,
        page: 1,
        pageSize: total,
        pageCount: 1,
        hasNextPage: false,
    }, {
        ...createPartialMetadata(removedCount),
        ...(truncated.meta ? truncated.meta : {}),
    });
}

function createFulltextAssetContentResult(typed: Record<string, unknown>, assetContents: unknown[], removedCount: number): ToolResult {
    const truncated = applyTruncation(assetContents, 20, 'Use page/pageSize parameters to paginate asset content results.');
    return createJsonResult({
        ...typed,
        assetContents: truncated.items,
        ...createPartialMetadata(removedCount),
        ...(truncated.meta ? truncated.meta : {}),
    });
}

export const SEARCH_ACTION_HANDLERS: Record<SearchAction, ToolActionHandler> = {
    fulltext: async ({ client, permMgr, rawArgs }) => {
        const parsed = SearchFulltextSchema.parse(rawArgs);
        if (parsed.parentId) {
            const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.parentId, 'read');
            if (denied) return denied;
        }

        const resolvedOrderBy = resolveSortAlias(parsed.sortBy, parsed.orderBy);
        const result = await searchApi.fullTextSearchBlock(client, {
            query: parsed.query,
            method: parsed.method,
            types: resolveFulltextTypes(parsed),
            paths: parsed.paths,
            groupBy: parsed.groupBy,
            orderBy: resolvedOrderBy,
            page: parsed.page,
            pageSize: resolveFulltextRequestPageSize(parsed),
        });
        const filtered = filterFullTextSearchResultByPermission(result, permMgr);
        const normalized = normalizeFullTextSearchResult(filtered, parsed.stripHtml ?? false);
        const normalizedObj = normalizeFulltextBlocks(normalized);
        if (parsed.parentId) {
            applyFulltextParentIdFilter(normalizedObj, parsed.parentId);
        }

        if (parsed.hasTags !== undefined) {
            applyFulltextHasTagsFilter(normalizedObj, parsed.hasTags);
        }

        return createFulltextPaginatedResult(normalized, parsed);
    },
    query_sql: async ({ client, permMgr, rawArgs }) => {
        const parsed = SearchQuerySqlSchema.parse(rawArgs);
        try {
            assertReadOnlySql(parsed.stmt);
        } catch (error) {
            return createErrorResult(
                error,
                { tool: SEARCH_TOOL_NAME, action: 'query_sql', rawArgs },
            );
        }
        const result = await searchApi.querySQL(client, parsed.stmt);
        const rows = Array.isArray(result) ? result : [];
        const filtered = await filterItemsByPermission(client, rows, permMgr);
        return createSqlQueryResult(filtered.items, filtered.removedCount);
    },
    search_tag: async ({ client, rawArgs }) => {
        const parsed = SearchTagSchema.parse(rawArgs);
        const result = await searchApi.searchTag(client, parsed.k);
        const typedResult = result && typeof result === 'object' ? result as Record<string, unknown> : {};
        const tags = Array.isArray(typedResult.tags) ? typedResult.tags : [];
        return createJsonResult({
            ...typedResult,
            ...(parsed.k.trim().length > 0 && tags.length === 0 ? {
                warning: 'No matching tags were found. If the tag was just created, SiYuan tag indexing may still be catching up; verify the markdown uses #tag# syntax and retry shortly.',
            } : {}),
        });
    },
    get_backlinks: async ({ client, permMgr, rawArgs }) => {
        const parsed = SearchGetBacklinksSchema.parse(rawArgs);
        const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
        if (denied) return denied;
        try {
            const result = await getBacklinkDocWithFallback(client, parsed.id, parsed.keyword, parsed.refTreeID);
            const filtered = filterBacklinkResultByPermission(result, permMgr);
            return createJsonResult({
                ...filtered,
                ...(result.sourcePayloadMissing ? { sourcePayloadMissing: true } : {}),
                ...(result.fallbackQuery ? { fallbackQuery: result.fallbackQuery } : {}),
                ...(result.resultConfidence ? { resultConfidence: result.resultConfidence } : {}),
                ...(result.fallbackUsed ? { warning: 'SiYuan returned no backlink payload; SQL fallback results are shown.' } : {}),
            });
        } catch (error) {
            if (isPermissionRelatedApiError(error)) {
                return createJsonResult({
                    backlinks: [],
                    backmentions: [],
                    warning: 'SiYuan rejected part of the backlink query due to restricted notebooks; restricted results were omitted.',
                    partial: true,
                    reason: 'permission_filtered',
                });
            }
            throw error;
        }
    },
    get_backmentions: async ({ client, permMgr, rawArgs }) => {
        const parsed = SearchGetBackmentionsSchema.parse(rawArgs);
        const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
        if (denied) return denied;
        try {
            const result = await getBackmentionDocWithFallback(client, parsed.id, parsed.keyword, parsed.refTreeID);
            const filtered = filterBacklinkResultByPermission(result, permMgr);
            return createJsonResult({
                ...filtered,
                ...(result.sourcePayloadMissing ? { sourcePayloadMissing: true } : {}),
                ...(result.fallbackQuery ? { fallbackQuery: result.fallbackQuery } : {}),
                ...(result.resultConfidence ? { resultConfidence: result.resultConfidence } : {}),
                ...(result.fallbackUsed ? { warning: 'SiYuan returned no backmention payload; SQL fallback results are shown.' } : {}),
            });
        } catch (error) {
            if (isPermissionRelatedApiError(error)) {
                return createJsonResult({
                    backmentions: [],
                    warning: 'SiYuan rejected part of the backmention query due to restricted notebooks; restricted results were omitted.',
                    partial: true,
                    reason: 'permission_filtered',
                });
            }
            throw error;
        }
    },
    search_refs: async ({ client, permMgr, rawArgs }) => {
        const parsed = SearchRefsSchema.parse(rawArgs);
        const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
        if (denied) return denied;
        const result = await searchApi.searchRefBlock(client, parsed);
        const typed = result && typeof result === 'object' ? result as Record<string, unknown> : {};
        const blocks = Array.isArray(typed.blocks) ? typed.blocks : [];
        const filtered = await filterItemsByPermission(client, blocks, permMgr);
        return createJsonResult({
            ...typed,
            blocks: slimSearchBlocks(filtered.items),
            ...createPartialMetadata(filtered.removedCount),
        });
    },
    find_replace: async ({ client, permMgr, rawArgs }) => {
        const parsed = SearchFindReplaceSchema.parse(rawArgs);
        for (const id of parsed.ids) {
            const { denied } = await ensurePermissionForDocumentId(client, permMgr, id, 'write');
            if (denied) return denied;
        }
        if (Array.isArray(parsed.paths)) {
            for (const path of parsed.paths) {
                const notebook = await resolveNotebookForPath(client, path);
                if (!notebook) continue;
                const denied = await ensurePermissionForNotebook(permMgr, notebook, 'write');
                if (denied) return denied;
            }
        }
        await searchApi.findReplace(client, parsed);
        return createJsonResult({
            success: true,
            replaced: true,
            ids: parsed.ids,
            k: parsed.k,
            r: parsed.r,
            ...(parsed.paths ? { paths: parsed.paths } : {}),
        });
    },
    search_assets: async ({ client, rawArgs }) => {
        const parsed = SearchAssetsSchema.parse(rawArgs);
        const result = await searchApi.searchAsset(client, parsed.k, parsed.exts);
        return createJsonResult(result);
    },
    get_asset_content: async ({ client, rawArgs }) => {
        const parsed = SearchGetAssetContentSchema.parse(rawArgs);
        const result = await searchApi.getAssetContent(client, parsed.id, parsed.query, parsed.queryMethod ?? 0);
        return createJsonResult(result);
    },
    fulltext_asset_content: async ({ client, permMgr, rawArgs }) => {
        const parsed = SearchFulltextAssetContentSchema.parse(rawArgs) as SearchFulltextAssetContentArgs;
        const result = await searchApi.fullTextSearchAssetContent(client, parsed);
        const typed = result && typeof result === 'object' ? result as Record<string, unknown> : {};
        const assetContents = Array.isArray(typed.assetContents) ? typed.assetContents : [];
        const filtered = await filterItemsByPermission(client, assetContents, permMgr);
        return createFulltextAssetContentResult(typed, filtered.items, filtered.removedCount);
    },
    list_invalid_refs: async ({ client, permMgr, rawArgs }) => {
        const parsed = SearchListInvalidRefsSchema.parse(rawArgs);
        const result = await searchApi.listInvalidBlockRefs(client, parsed.page, parsed.pageSize);
        const filtered = filterFullTextSearchResultByPermission((result ?? {}) as {
            blocks?: unknown[];
            matchedBlockCount?: number;
            matchedRootCount?: number;
        }, permMgr);
        return createJsonResult(filtered);
    },
};

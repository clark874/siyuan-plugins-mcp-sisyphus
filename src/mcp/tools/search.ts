import type { SiYuanClient } from '../../api/client';
import * as searchApi from '../../api/search';
import type { CategoryToolConfig, SearchAction } from '../config';
import { SEARCH_ACTION_HINTS, SEARCH_GUIDANCE } from '../help';
import { expandTypeShortcodes, normalizeFullTextSearchResult, resolveTypeRecord, resolveSortAlias, slimSearchBlocks } from '../normalize';
import type { PermissionManager } from '../permissions';
import {
    SearchActionSchema,
    SearchAssetsSchema,
    SearchFindReplaceSchema,
    SearchFulltextSchema,
    SearchFulltextAssetContentSchema,
    SearchGetAssetContentSchema,
    SearchGetBacklinksSchema,
    SearchGetBackmentionsSchema,
    SearchListInvalidRefsSchema,
    SearchQuerySqlSchema,
    SearchRefsSchema,
    SearchTagSchema,
} from '../types';
import { createResultResolutionCache, ensurePermissionForDocumentId, ensurePermissionForNotebook, escapeSqlString, resolveNotebookForPath, resolveResultItemContext } from './context';
import { applyTruncation, buildAggregatedTool, createActionSchema, createDisabledActionResult, createErrorResult, createJsonResult, tryHandleHelpAction, type ActionVariant, type ToolResult } from './shared';

export const SEARCH_TOOL_NAME = 'search';

export const SEARCH_VARIANTS: ActionVariant<SearchAction>[] = [
    {
        action: 'fulltext',
        schema: createActionSchema('fulltext', {
            query: { type: 'string', description: 'Search query string' },
            method: { type: 'number', description: 'Search method: 0=keyword (default), 1=query syntax, 2=SQL, 3=regex' },
            types: { type: 'object', additionalProperties: { type: 'boolean' }, description: 'Block type filter. Accepts full names (e.g. {"heading": true}) or shortcodes (e.g. {"h": true, "p": true}). Shortcodes: d=document, h=heading, p=paragraph, l=list, i=listItem, b=blockquote, c=codeBlock, m=mathBlock, t=table, s=superBlock, html=htmlBlock, embed=embedBlock, av=databaseBlock, video, audio, widget.' },
            typeShortcodes: { type: 'array', items: { type: 'string' }, description: 'Alternative shorthand type filter as array: ["h","p"]. Merged with types if both provided.' },
            paths: { type: 'array', items: { type: 'string' }, description: 'Restrict search to specific notebook paths' },
            groupBy: { type: 'number', description: '0=no grouping (default), 1=group by document' },
            orderBy: { type: 'number', description: 'Sort order: 0=type, 1=created ASC, 2=created DESC, 3=updated ASC, 4=updated DESC, 5=content ASC, 6=content DESC, 7=relevance (default)' },
            sortBy: { type: 'string', description: 'Named sort: "relevance", "date", "updated_desc", "updated_asc", "created_desc", "created_asc", "type". Overrides orderBy.' },
            page: { type: 'number', description: 'Page number (1-based), default 1' },
            pageSize: { type: 'number', description: 'Results per page, default 32, max 128' },
            parentId: { type: 'string', description: 'Post-filter: only return blocks within this document subtree (matches root_id or parent_id)' },
            hasTags: { type: 'boolean', description: 'When true, only blocks with tags; when false, only blocks without tags' },
            stripHtml: { type: 'boolean', description: 'When true, add plain-text fields while keeping highlighted HTML content unchanged' },
        }, ['query'], 'Full-text search across all blocks.'),
    },
    {
        action: 'query_sql',
        schema: createActionSchema('query_sql', {
            stmt: { type: 'string', description: 'SQL SELECT statement to execute against the blocks/spans/assets tables' },
        }, ['stmt'], 'Execute a read-only SQL query against the database.'),
    },
    {
        action: 'search_tag',
        schema: createActionSchema('search_tag', {
            k: { type: 'string', description: 'Tag keyword to search for' },
        }, ['k'], 'Search for tags matching a keyword.'),
    },
    {
        action: 'get_backlinks',
        schema: createActionSchema('get_backlinks', {
            id: { type: 'string', description: 'Block or document ID to find backlinks for' },
            keyword: { type: 'string', description: 'Filter backlinks by keyword' },
            refTreeID: { type: 'string', description: 'Optional document tree ID to narrow backlink scope' },
        }, ['id'], 'Find documents/blocks that link to the given block.'),
    },
    {
        action: 'get_backmentions',
        schema: createActionSchema('get_backmentions', {
            id: { type: 'string', description: 'Block or document ID to find backmentions for' },
            keyword: { type: 'string', description: 'Filter backmentions by keyword' },
            refTreeID: { type: 'string', description: 'Optional document tree ID to narrow backmention scope' },
        }, ['id'], 'Find documents/blocks that mention the given block name.'),
    },
    {
        action: 'search_refs',
        schema: createActionSchema('search_refs', {
            id: { type: 'string', description: 'Referenced block or document ID' },
            rootID: { type: 'string', description: 'Optional current root document ID' },
            k: { type: 'string', description: 'Keyword filter' },
            beforeLen: { type: 'number', description: 'Context length before the reference, default 512' },
            isSquareBrackets: { type: 'boolean', description: 'Search in square-bracket reference mode' },
            isDatabase: { type: 'boolean', description: 'Whether the reference target is a database' },
            reqId: { type: 'string', description: 'Optional passthrough request ID' },
        }, ['id'], 'Search blocks that reference a given block or document.'),
    },
    {
        action: 'find_replace',
        schema: createActionSchema('find_replace', {
            k: { type: 'string', description: 'Find keyword' },
            r: { type: 'string', description: 'Replacement text; use empty string to delete matches' },
            ids: { type: 'array', items: { type: 'string' }, description: 'Document or block IDs to mutate' },
            paths: { type: 'array', items: { type: 'string' }, description: 'Optional path scope list' },
            types: { type: 'object', additionalProperties: { type: 'boolean' }, description: 'Optional block type filter' },
            method: { type: 'number', description: 'Search method: 0=keyword, 1=query syntax, 2=SQL, 3=regex' },
            orderBy: { type: 'number', description: 'Sort order' },
            groupBy: { type: 'number', description: 'Grouping mode' },
            replaceTypes: { type: 'object', additionalProperties: { type: 'boolean' }, description: 'Replace target kinds such as text, code, docTitle, blockRef' },
        }, ['k', 'r', 'ids'], 'Find and replace text in documents or blocks.'),
    },
    {
        action: 'search_assets',
        schema: createActionSchema('search_assets', {
            k: { type: 'string', description: 'Asset filename keyword' },
            exts: { type: 'array', items: { type: 'string' }, description: 'Optional extension filters' },
        }, ['k'], 'Search asset files by filename.'),
    },
    {
        action: 'get_asset_content',
        schema: createActionSchema('get_asset_content', {
            id: { type: 'string', description: 'Asset content ID' },
            query: { type: 'string', description: 'Matched query text' },
            queryMethod: { type: 'number', description: 'Query method: 0=keyword, 1=query syntax, 2=SQL, 3=regex' },
        }, ['id', 'query'], 'Get a specific asset-content record.'),
    },
    {
        action: 'fulltext_asset_content',
        schema: createActionSchema('fulltext_asset_content', {
            query: { type: 'string', description: 'Search query string' },
            types: { type: 'object', additionalProperties: { type: 'boolean' }, description: 'Asset type filter' },
            method: { type: 'number', description: 'Search method: 0=keyword, 1=query syntax, 2=SQL, 3=regex' },
            orderBy: { type: 'number', description: 'Sort order: 0=relevance DESC, 1=relevance ASC, 2=updated ASC, 3=updated DESC' },
            page: { type: 'number', description: 'Page number (1-based)' },
            pageSize: { type: 'number', description: 'Results per page' },
        }, ['query'], 'Full-text search indexed asset contents.'),
    },
    {
        action: 'list_invalid_refs',
        schema: createActionSchema('list_invalid_refs', {
            page: { type: 'number', description: 'Page number (1-based)' },
            pageSize: { type: 'number', description: 'Results per page' },
        }, [], 'List invalid block references.'),
    },
];

export function listSearchTools(config: CategoryToolConfig<SearchAction>) {
    return buildAggregatedTool(
        SEARCH_TOOL_NAME,
        '🔍 Grouped search and query operations.',
        config,
        SEARCH_VARIANTS,
        {
            guidance: SEARCH_GUIDANCE,
            actionHints: SEARCH_ACTION_HINTS,
        },
    );
}

function getNotebookIdFromItem(item: unknown): string | undefined {
    if (!item || typeof item !== 'object') return undefined;
    const typedItem = item as Record<string, unknown>;
    const candidates = [typedItem.notebook, typedItem.box, typedItem.boxID, typedItem.notebookId];
    return candidates.find((value): value is string => typeof value === 'string' && value.length > 0);
}

function filterReadableItems(items: unknown[], permMgr: PermissionManager): { items: unknown[]; removedCount: number } {
    const filteredItems = items.filter((item) => {
        const notebookId = getNotebookIdFromItem(item);
        return !notebookId || permMgr.canRead(notebookId);
    });
    return {
        items: filteredItems,
        removedCount: items.length - filteredItems.length,
    };
}

function createPartialMetadata(removedCount: number): {
    partial?: boolean;
    filteredOutCount?: number;
    reason?: 'permission_filtered';
} {
    return removedCount > 0
        ? {
            partial: true,
            filteredOutCount: removedCount,
            reason: 'permission_filtered',
        }
        : {};
}

function escapeSqlLike(value: string): string {
    return value
        .replace(/\0/g, '')
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_')
        .replace(/'/g, "''");
}

function hasBacklinkPayload(result: unknown): result is { backlinks?: unknown[]; backmentions?: unknown[] } {
    return !!result && typeof result === 'object';
}

async function getBlockLabel(client: SiYuanClient, id: string): Promise<string | undefined> {
    const rows = await searchApi.querySQL(
        client,
        `SELECT content, name FROM blocks WHERE id = '${escapeSqlString(id)}' LIMIT 1`,
    );
    const row = Array.isArray(rows) && rows[0] && typeof rows[0] === 'object'
        ? rows[0] as Record<string, unknown>
        : null;
    if (!row) return undefined;

    const label = [row.content, row.name].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
    return label?.trim();
}

async function queryFallbackBacklinkRows(
    client: SiYuanClient,
    id: string,
    keyword?: string,
    refTreeID?: string,
): Promise<unknown[]> {
    const escapedId = escapeSqlString(id);
    const filters = [
        "s.type = 'textmark block-ref'",
        `instr(s.markdown, '${escapedId}') > 0`,
    ];
    if (refTreeID) {
        filters.push(`s.root_id = '${escapeSqlString(refTreeID)}'`);
    }
    if (keyword && keyword.trim()) {
        filters.push(`b.content LIKE '%${escapeSqlLike(keyword.trim())}%' ESCAPE '\\'`);
    }

    return searchApi.querySQL(
        client,
        `
        SELECT
            s.block_id AS id,
            s.root_id,
            s.box,
            s.path,
            b.hpath,
            b.type,
            b.content,
            b.markdown
        FROM spans s
        LEFT JOIN blocks b ON b.id = s.block_id
        WHERE ${filters.join(' AND ')}
        ORDER BY b.updated DESC
        LIMIT 200
        `.trim(),
    );
}

async function queryFallbackBackmentionRows(
    client: SiYuanClient,
    id: string,
    keyword?: string,
    refTreeID?: string,
): Promise<unknown[]> {
    const label = await getBlockLabel(client, id);
    if (!label) return [];

    const filters = [
        `id != '${escapeSqlString(id)}'`,
        `instr(content, '${escapeSqlString(label)}') > 0`,
    ];
    if (refTreeID) {
        filters.push(`root_id = '${escapeSqlString(refTreeID)}'`);
    }
    if (keyword && keyword.trim()) {
        filters.push(`instr(content, '${escapeSqlString(keyword.trim())}') > 0`);
    }

    return searchApi.querySQL(
        client,
        `
        SELECT
            id,
            root_id,
            box,
            path,
            hpath,
            type,
            content,
            markdown
        FROM blocks
        WHERE ${filters.join(' AND ')}
        ORDER BY updated DESC
        LIMIT 200
        `.trim(),
    );
}

async function getBacklinkDocWithFallback(
    client: SiYuanClient,
    id: string,
    keyword?: string,
    refTreeID?: string,
): Promise<{ backlinks: unknown[]; backmentions: unknown[]; fallbackUsed?: boolean; sourcePayloadMissing?: boolean; fallbackQuery?: 'sql'; resultConfidence?: 'fallback' }> {
    const result = await searchApi.getBacklinkDoc(client, id, keyword, refTreeID);
    if (hasBacklinkPayload(result) && (Array.isArray(result.backlinks) || Array.isArray(result.backmentions))) {
        return {
            backlinks: Array.isArray(result.backlinks) ? result.backlinks : [],
            backmentions: Array.isArray(result.backmentions) ? result.backmentions : [],
        };
    }

    const [backlinks, backmentions] = await Promise.all([
        queryFallbackBacklinkRows(client, id, keyword, refTreeID),
        queryFallbackBackmentionRows(client, id, keyword, refTreeID),
    ]);
    return {
        backlinks,
        backmentions,
        fallbackUsed: true,
        sourcePayloadMissing: true,
        fallbackQuery: 'sql',
        resultConfidence: 'fallback',
    };
}

async function getBackmentionDocWithFallback(
    client: SiYuanClient,
    id: string,
    keyword?: string,
    refTreeID?: string,
): Promise<{ backmentions: unknown[]; fallbackUsed?: boolean; sourcePayloadMissing?: boolean; fallbackQuery?: 'sql'; resultConfidence?: 'fallback' }> {
    const result = await searchApi.getBackmentionDoc(client, id, keyword, refTreeID);
    if (result && typeof result === 'object' && Array.isArray((result as { backmentions?: unknown[] }).backmentions)) {
        return { backmentions: (result as { backmentions: unknown[] }).backmentions };
    }

    const backmentions = await queryFallbackBackmentionRows(client, id, keyword, refTreeID);
    return {
        backmentions,
        fallbackUsed: true,
        sourcePayloadMissing: true,
        fallbackQuery: 'sql',
        resultConfidence: 'fallback',
    };
}

export async function filterItemsByPermission(
    client: SiYuanClient,
    items: unknown[],
    permMgr: PermissionManager,
): Promise<{ items: unknown[]; removedCount: number }> {
    const cache = createResultResolutionCache();
    const filteredItems: unknown[] = [];
    let removedCount = 0;

    for (const item of items) {
        const context = await resolveResultItemContext(client, item, cache);
        if (!context?.notebook || !permMgr.canRead(context.notebook)) {
            removedCount += 1;
            continue;
        }
        filteredItems.push(item);
    }

    return { items: filteredItems, removedCount };
}

export async function filterItemsByPermissionAndPath(
    client: SiYuanClient,
    items: unknown[],
    permMgr: PermissionManager,
    scopePath?: string,
): Promise<{ items: unknown[]; permissionFilteredOutCount: number; pathFilteredOutCount: number }> {
    const cache = createResultResolutionCache();
    const filteredItems: unknown[] = [];
    let permissionFilteredOutCount = 0;
    let pathFilteredOutCount = 0;

    const normalizedScopePath = typeof scopePath === 'string' && scopePath.length > 0 ? (scopePath.startsWith('/') ? scopePath : `/${scopePath}`) : undefined;

    for (const item of items) {
        const context = await resolveResultItemContext(client, item, cache);
        if (!context?.notebook || !permMgr.canRead(context.notebook)) {
            permissionFilteredOutCount += 1;
            continue;
        }
        if (normalizedScopePath) {
            if (!context.path || !(context.path === normalizedScopePath || context.path.startsWith(`${normalizedScopePath}/`))) {
                pathFilteredOutCount += 1;
                continue;
            }
        }
        filteredItems.push(item);
    }

    return { items: filteredItems, permissionFilteredOutCount, pathFilteredOutCount };
}

export function filterFullTextSearchResultByPermission<T extends {
    blocks?: unknown[];
    matchedBlockCount?: number;
    matchedRootCount?: number;
}>(result: T, permMgr: PermissionManager): T & { filteredOutBlockCount?: number } {
    if (!Array.isArray(result.blocks)) return result;

    const { items: blocks, removedCount } = filterReadableItems(result.blocks, permMgr);
    const uniqueRoots = new Set<string>();
    for (const block of blocks) {
        if (!block || typeof block !== 'object') continue;
        const typedBlock = block as Record<string, unknown>;
        const rootId = [typedBlock.rootID, typedBlock.rootId, typedBlock.root_id, typedBlock.id, typedBlock.path]
            .find((value): value is string => typeof value === 'string' && value.length > 0);
        if (rootId) uniqueRoots.add(rootId);
    }

    return {
        ...result,
        blocks,
        matchedBlockCount: blocks.length,
        matchedRootCount: uniqueRoots.size,
        ...(removedCount > 0 ? { filteredOutBlockCount: removedCount } : {}),
    };
}

export function filterBacklinkResultByPermission<T extends {
    backlinks?: unknown[];
    backmentions?: unknown[];
}>(result: T, permMgr: PermissionManager): T & { filteredOutCount?: number } {
    const backlinks = Array.isArray(result.backlinks) ? filterReadableItems(result.backlinks, permMgr) : undefined;
    const backmentions = Array.isArray(result.backmentions) ? filterReadableItems(result.backmentions, permMgr) : undefined;
    const removedCount = (backlinks?.removedCount ?? 0) + (backmentions?.removedCount ?? 0);

    return {
        ...result,
        ...(backlinks ? { backlinks: backlinks.items } : {}),
        ...(backmentions ? { backmentions: backmentions.items } : {}),
        ...createPartialMetadata(removedCount),
    };
}

function isPermissionRelatedApiError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return /permission[_\s-]?denied|has permission|read access is required|write access is required/i.test(error.message);
}

export async function callSearchTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<SearchAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    const rawArgs = args ?? {};
    const action = typeof rawArgs.action === 'string' ? rawArgs.action : undefined;

    const helpResult = tryHandleHelpAction(SEARCH_TOOL_NAME, rawArgs, config, SEARCH_VARIANTS);
    if (helpResult) return helpResult;

    try {
        const parsedAction = SearchActionSchema.parse(rawArgs.action);
        if (!config.enabled || !config.actions[parsedAction]) {
            return createDisabledActionResult(SEARCH_TOOL_NAME, parsedAction);
        }

        switch (parsedAction) {
            case 'fulltext': {
                const parsed = SearchFulltextSchema.parse(rawArgs);

                // Resolve type shortcodes in both types and typeShortcodes
                let resolvedTypes = parsed.types ? resolveTypeRecord(parsed.types) : parsed.types;
                if (parsed.typeShortcodes && parsed.typeShortcodes.length > 0) {
                    const expanded = expandTypeShortcodes(parsed.typeShortcodes);
                    resolvedTypes = { ...expanded, ...resolvedTypes };
                }

                // Resolve sortBy → orderBy
                const resolvedOrderBy = resolveSortAlias(parsed.sortBy, parsed.orderBy);

                // Permission check for parentId
                if (parsed.parentId) {
                    const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.parentId, 'read');
                    if (denied) return denied;
                }

                // When parentId is set, request more results to compensate post-filter loss
                const requestPageSize = parsed.parentId
                    ? Math.min((parsed.pageSize ?? 32) * 3, 128)
                    : parsed.pageSize;

                const result = await searchApi.fullTextSearchBlock(client, {
                    query: parsed.query,
                    method: parsed.method,
                    types: resolvedTypes,
                    paths: parsed.paths,
                    groupBy: parsed.groupBy,
                    orderBy: resolvedOrderBy,
                    page: parsed.page,
                    pageSize: requestPageSize,
                });
                const filtered = filterFullTextSearchResultByPermission(result, permMgr);
                const normalized = normalizeFullTextSearchResult(filtered, parsed.stripHtml ?? false);
                const normalizedObj = normalized as Record<string, unknown>;
                if (Array.isArray(normalizedObj.blocks)) {
                    normalizedObj.blocks = slimSearchBlocks(normalizedObj.blocks as unknown[]);
                }

                // Post-filter: parentId
                if (parsed.parentId && Array.isArray(normalizedObj.blocks)) {
                    const pid = parsed.parentId;
                    normalizedObj.blocks = (normalizedObj.blocks as Array<Record<string, unknown>>).filter((block) =>
                        block.rootID === pid || block.root_id === pid || block.parent_id === pid || block.parentID === pid,
                    );
                    normalizedObj.matchedBlockCount = (normalizedObj.blocks as unknown[]).length;
                    normalizedObj.parentIdFilter = pid;
                }

                // Post-filter: hasTags
                if (parsed.hasTags !== undefined && Array.isArray(normalizedObj.blocks)) {
                    normalizedObj.blocks = (normalizedObj.blocks as Array<Record<string, unknown>>).filter((block) => {
                        const tagField = typeof block.tag === 'string' ? (block.tag as string).trim() : '';
                        const hasTag = tagField.length > 0;
                        return parsed.hasTags ? hasTag : !hasTag;
                    });
                    normalizedObj.matchedBlockCount = (normalizedObj.blocks as unknown[]).length;
                }

                const blocks = Array.isArray(normalizedObj.blocks)
                    ? normalizedObj.blocks as unknown[]
                    : [];
                const pageCount = typeof (normalized as Record<string, unknown>).pageCount === 'number'
                    ? (normalized as Record<string, unknown>).pageCount as number
                    : 1;
                const truncated = applyTruncation(blocks, 20, 'Use page/pageSize parameters to paginate. Current page: ' + (parsed.page ?? 1) + '.');
                return createJsonResult({
                    ...(normalized as Record<string, unknown>),
                    blocks: truncated.items,
                    ...(truncated.meta ? truncated.meta : {}),
                    ...(pageCount > 1 ? { pageCount, paginationHint: `${pageCount} pages available. Use page (1-based) and pageSize to navigate.` } : {}),
                });
            }
            case 'query_sql': {
                const parsed = SearchQuerySqlSchema.parse(rawArgs);
                const trimmed = parsed.stmt.trim();
                const firstWord = trimmed.split(/\s+/)[0]?.toUpperCase();
                if (firstWord !== 'SELECT' && firstWord !== 'WITH') {
                    return createErrorResult(
                        new Error('Only SELECT and WITH (CTE) statements are allowed. Mutation queries (INSERT, UPDATE, DELETE, DROP, ALTER, CREATE) are forbidden.'),
                        { tool: SEARCH_TOOL_NAME, action: 'query_sql', rawArgs },
                    );
                }
                const result = await searchApi.querySQL(client, parsed.stmt);
                const rows = Array.isArray(result) ? result : [];
                const filtered = await filterItemsByPermission(client, rows, permMgr);
                const truncated = applyTruncation(filtered.items, 50, 'Add LIMIT and OFFSET to your SQL for pagination.');
                return createJsonResult({
                    rows: truncated.items,
                    rowCount: filtered.items.length,
                    ...createPartialMetadata(filtered.removedCount),
                    ...(truncated.meta ? truncated.meta : {}),
                });
            }
            case 'search_tag': {
                const parsed = SearchTagSchema.parse(rawArgs);
                const result = await searchApi.searchTag(client, parsed.k);
                return createJsonResult(result);
            }
            case 'get_backlinks': {
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
            }
            case 'get_backmentions': {
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
            }
            case 'search_refs': {
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
            }
            case 'find_replace': {
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
            }
            case 'search_assets': {
                const parsed = SearchAssetsSchema.parse(rawArgs);
                const result = await searchApi.searchAsset(client, parsed.k, parsed.exts);
                return createJsonResult(result);
            }
            case 'get_asset_content': {
                const parsed = SearchGetAssetContentSchema.parse(rawArgs);
                const result = await searchApi.getAssetContent(client, parsed.id, parsed.query, parsed.queryMethod ?? 0);
                return createJsonResult(result);
            }
            case 'fulltext_asset_content': {
                const parsed = SearchFulltextAssetContentSchema.parse(rawArgs);
                const result = await searchApi.fullTextSearchAssetContent(client, parsed);
                const typed = result && typeof result === 'object' ? result as Record<string, unknown> : {};
                const assetContents = Array.isArray(typed.assetContents) ? typed.assetContents : [];
                const filtered = await filterItemsByPermission(client, assetContents, permMgr);
                const truncated = applyTruncation(filtered.items, 20, 'Use page/pageSize parameters to paginate asset content results.');
                return createJsonResult({
                    ...typed,
                    assetContents: truncated.items,
                    ...createPartialMetadata(filtered.removedCount),
                    ...(truncated.meta ? truncated.meta : {}),
                });
            }
            case 'list_invalid_refs': {
                const parsed = SearchListInvalidRefsSchema.parse(rawArgs);
                const result = await searchApi.listInvalidBlockRefs(client, parsed.page, parsed.pageSize);
                const filtered = filterFullTextSearchResultByPermission((result ?? {}) as {
                    blocks?: unknown[];
                    matchedBlockCount?: number;
                    matchedRootCount?: number;
                }, permMgr);
                return createJsonResult(filtered);
            }
            default: {
                const _exhaustive: never = parsedAction;
                return createErrorResult(new Error(`Unknown action: ${_exhaustive}`), { tool: SEARCH_TOOL_NAME, action, rawArgs });
            }
        }
    } catch (error) {
        return createErrorResult(error, { tool: SEARCH_TOOL_NAME, action, rawArgs });
    }
}

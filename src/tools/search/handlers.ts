import * as searchApi from '../../api/search';
import type { SearchAction } from '../../core/config';
import {
    expandTypeShortcodes,
    getAssetContentSortName,
    getFulltextSortName,
    getSearchMethodName,
    normalizeSearchBlocksForAi,
    resolveAssetContentSortAlias,
    resolveSearchMethod,
    resolveSortAlias,
    resolveTypeRecord,
} from '../../core/normalize';
import {
    SearchAssetsSchema,
    SearchFindReplaceSchema,
    SearchFulltextAssetContentSchema,
    SearchFulltextSchema,
    SearchGetBacklinksSchema,
    SearchListInvalidRefsSchema,
    SearchKnowledgeSchema,
    SearchSemanticSchema,
    SearchQuerySqlSchema,
    SearchRefsSchema,
} from '../../core/types';
import { ensurePermissionForDocumentId, ensurePermissionForNotebook, escapeSqlString, resolveNotebookForPath } from '../internal/context';
import type { ToolActionHandler } from '../internal/define-tool';
import { enrichItemsWithNotebookNames } from '../internal/helpers/notebook-names';
import { applyTruncation, createErrorResult, createJsonResult, createPaginatedResult, type ToolResult, type TruncationMeta } from '../internal/shared';
import {
    createPartialMetadata,
    filterBacklinkResultByPermission,
    filterFullTextSearchResultByPermission,
    filterItemsByPermission,
    hasRestrictedNotebookPermissions,
    isPermissionRelatedApiError,
} from './permission-filter';
import { assertReadOnlySql, getBacklinkDocWithFallback, getBackmentionDocWithFallback } from './sql-builder';

const SEARCH_TOOL_NAME = 'search';

type SearchFulltextArgs = ReturnType<(typeof SearchFulltextSchema)['parse']>;
type SearchFulltextAssetContentArgs = ReturnType<(typeof SearchFulltextAssetContentSchema)['parse']>;
type SearchFindReplaceArgs = ReturnType<(typeof SearchFindReplaceSchema)['parse']>;
type SearchKnowledgeArgs = ReturnType<(typeof SearchKnowledgeSchema)['parse']>;
type SearchSemanticArgs = ReturnType<(typeof SearchSemanticSchema)['parse']>;
type SearchMethodArgs = {
    method?: number;
    methodName?: string;
};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function resolveAliasString(primary: string | undefined, alias: string | undefined): string | undefined {
    return isNonEmptyString(alias) ? alias : primary;
}

function buildResolvedArgs(values: Record<string, unknown>): { resolvedArgs?: Record<string, unknown> } {
    const filteredEntries = Object.entries(values).filter(([, value]) => value !== undefined);
    if (filteredEntries.length === 0) return {};
    return { resolvedArgs: Object.fromEntries(filteredEntries) };
}

function buildTruncationSummary(itemCount: number, meta?: TruncationMeta): { showing: number; truncated: boolean; hint?: string } {
    return meta
        ? {
            showing: meta.showing,
            truncated: meta.truncated,
            hint: meta.hint,
        }
        : {
            showing: itemCount,
            truncated: false,
        };
}

function normalizeReferencedBlocks(items: unknown[] | undefined): unknown[] {
    if (!Array.isArray(items)) return [];
    return normalizeSearchBlocksForAi(items);
}

function resolveFulltextTypes(parsed: SearchFulltextArgs): Record<string, boolean> | undefined {
    let resolvedTypes = parsed.types ? resolveTypeRecord(parsed.types) : parsed.types;
    if (parsed.typeShortcodes && parsed.typeShortcodes.length > 0) {
        const expanded = expandTypeShortcodes(parsed.typeShortcodes);
        resolvedTypes = { ...expanded, ...resolvedTypes };
    }
    return resolvedTypes as Record<string, boolean> | undefined;
}

function resolveFulltextRequestPageSize(parsed: SearchFulltextArgs): number | undefined {
    return parsed.parentId
        ? Math.min((parsed.pageSize ?? 32) * 3, 128)
        : parsed.pageSize;
}

function readStringField(row: Record<string, unknown>, ...keys: string[]): string {
    for (const key of keys) {
        const value = row[key];
        if (typeof value === 'string') return value;
    }
    return '';
}

function sqlStringList(values: string[]): string {
    return values.map((value) => `'${escapeSqlString(value)}'`).join(', ');
}

async function knowledgeSearch(
    client: Parameters<ToolActionHandler>[0]['client'],
    permMgr: Parameters<ToolActionHandler>[0]['permMgr'],
    parsed: SearchKnowledgeArgs,
): Promise<ToolResult> {
    const pageSize = parsed.pageSize ?? 10;
    const candidateSize = parsed.candidateSize ?? Math.min(Math.max(pageSize * 3, 20), 100);
    const semantic = await searchApi.semanticSearchBlock(client, {
        query: parsed.query,
        page: 1,
        pageSize: candidateSize,
        ...(parsed.notebooks ? { boxes: parsed.notebooks } : {}),
        ...(parsed.paths ? { paths: parsed.paths } : {}),
        ...(parsed.types ? { types: parsed.types } : {}),
        ...(parsed.subTypes ? { subTypes: parsed.subTypes } : {}),
    });
    const filteredSemantic = filterFullTextSearchResultByPermission(semantic, permMgr) as unknown as Record<string, unknown>;
    const semanticBlocks = Array.isArray(filteredSemantic.blocks)
        ? filteredSemantic.blocks.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        : [];
    const semanticIds = semanticBlocks.map((item) => readStringField(item, 'id')).filter(Boolean);
    const permissionFilteredCount = typeof filteredSemantic.filteredOutBlockCount === 'number'
        ? filteredSemantic.filteredOutBlockCount as number
        : 0;
    if (semanticIds.length === 0) {
        return createJsonResult({
            query: parsed.query,
            data: [],
            semanticCandidateCount: 0,
            deduplicatedCount: 0,
            permissionFilteredCount,
            dataEgress: true,
            externalCost: true,
            hint: 'Semantic discovery produced no readable candidates. Verify the embedding index and broaden the query or scope.',
        });
    }

    const referenceRows = await searchApi.querySQL(
        client,
        `SELECT block_id, def_block_id FROM refs WHERE block_id IN (${sqlStringList(semanticIds)}) LIMIT 500`,
    ) as Array<Record<string, unknown>>;
    const referencedTargets = new Map<string, string[]>();
    for (const row of referenceRows) {
        const blockId = readStringField(row, 'block_id');
        const targetId = readStringField(row, 'def_block_id');
        if (!blockId || !targetId) continue;
        const targets = referencedTargets.get(blockId) ?? [];
        if (!targets.includes(targetId)) targets.push(targetId);
        referencedTargets.set(blockId, targets);
    }

    const allBlockIds = [...new Set([...semanticIds, ...referenceRows.map((row) => readStringField(row, 'def_block_id')).filter(Boolean)])];
    const blockRowsRaw = await searchApi.querySQL(
        client,
        `SELECT id, root_id, box, path, hpath, type, subtype, name, alias, content, markdown FROM blocks WHERE id IN (${sqlStringList(allBlockIds)}) LIMIT 500`,
    );
    const blockRowsPermission = await filterItemsByPermission(client, blockRowsRaw, permMgr);
    const blockRows = blockRowsPermission.items.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
    const blockById = new Map(blockRows.map((row) => [readStringField(row, 'id'), row]));
    for (const semanticBlock of semanticBlocks) {
        const id = readStringField(semanticBlock, 'id');
        if (!blockById.has(id)) blockById.set(id, semanticBlock);
    }

    type AccumulatedCandidate = {
        targetId: string;
        semanticRank: number;
        sourceResultIds: string[];
        collapsedReferenceCount: number;
    };
    const accumulated = new Map<string, AccumulatedCandidate>();
    semanticBlocks.forEach((semanticBlock, index) => {
        const sourceId = readStringField(semanticBlock, 'id');
        const sourceMeta = blockById.get(sourceId) ?? semanticBlock;
        const sourceHasName = readStringField(sourceMeta, 'name').trim().length > 0;
        const rawTargets = sourceHasName
            ? [sourceId]
            : (referencedTargets.get(sourceId)?.length ? referencedTargets.get(sourceId)! : [sourceId]);
        // A readable reference can point at a block in a restricted notebook.
        // Only expand targets whose block metadata survived permission filtering;
        // otherwise the target ID itself would become an ownership side channel.
        const targets = rawTargets.filter((targetId) => blockById.has(targetId));
        for (const targetId of targets) {
            const current = accumulated.get(targetId) ?? {
                targetId,
                semanticRank: index + 1,
                sourceResultIds: [],
                collapsedReferenceCount: 0,
            };
            if (!current.sourceResultIds.includes(sourceId)) current.sourceResultIds.push(sourceId);
            if (targetId !== sourceId) current.collapsedReferenceCount += 1;
            current.semanticRank = Math.min(current.semanticRank, index + 1);
            accumulated.set(targetId, current);
        }
    });

    const ordered = [...accumulated.values()].sort((left, right) => {
        const leftNamed = readStringField(blockById.get(left.targetId) ?? {}, 'name').trim().length > 0;
        const rightNamed = readStringField(blockById.get(right.targetId) ?? {}, 'name').trim().length > 0;
        if (leftNamed !== rightNamed) return leftNamed ? -1 : 1;
        return left.semanticRank - right.semanticRank;
    });
    const targetIds = ordered.map((item) => item.targetId);
    const relatedByTarget = new Map<string, Array<{ id: string; hpath: string; title: string }>>();
    if ((parsed.includeRelatedDocuments ?? true) && targetIds.length > 0) {
        const relatedRowsRaw = await searchApi.querySQL(client, [
            'SELECT r.def_block_id AS target_id, src.root_id AS source_root_id, src.box AS box,',
            'root.hpath AS source_hpath, root.content AS source_title',
            'FROM refs r JOIN blocks src ON src.id = r.block_id JOIN blocks root ON root.id = src.root_id',
            `WHERE r.def_block_id IN (${sqlStringList(targetIds)})`,
            'GROUP BY r.def_block_id, src.root_id, src.box, root.hpath, root.content LIMIT 500',
        ].join(' '));
        const relatedRowsPermission = await filterItemsByPermission(client, relatedRowsRaw, permMgr);
        for (const rowValue of relatedRowsPermission.items) {
            if (!rowValue || typeof rowValue !== 'object') continue;
            const row = rowValue as Record<string, unknown>;
            const targetId = readStringField(row, 'target_id');
            const sourceRootId = readStringField(row, 'source_root_id');
            if (!targetId || !sourceRootId) continue;
            const items = relatedByTarget.get(targetId) ?? [];
            if (!items.some((item) => item.id === sourceRootId)) {
                items.push({
                    id: sourceRootId,
                    hpath: readStringField(row, 'source_hpath'),
                    title: readStringField(row, 'source_title'),
                });
            }
            relatedByTarget.set(targetId, items);
        }
    }

    const data = ordered.slice(0, pageSize).map((item, index) => {
        const row = blockById.get(item.targetId) ?? {};
        if (!item.sourceResultIds.includes(item.targetId) && semanticIds.includes(item.targetId)) {
            item.sourceResultIds.push(item.targetId);
        }
        return {
            id: item.targetId,
            rootId: readStringField(row, 'root_id', 'rootID'),
            box: readStringField(row, 'box', 'notebook'),
            hpath: readStringField(row, 'hpath', 'hPath'),
            type: readStringField(row, 'type'),
            name: readStringField(row, 'name'),
            alias: readStringField(row, 'alias'),
            content: readStringField(row, 'content', 'markdown'),
            semanticRank: item.semanticRank,
            deduplicatedRank: index + 1,
            collapsedReferenceCount: item.collapsedReferenceCount,
            sourceResultIds: item.sourceResultIds,
            relatedDocuments: relatedByTarget.get(item.targetId) ?? [],
        };
    });
    return createJsonResult({
        query: parsed.query,
        data,
        semanticCandidateCount: semanticBlocks.length,
        deduplicatedCount: ordered.length,
        showing: data.length,
        truncated: ordered.length > data.length,
        permissionFilteredCount: permissionFilteredCount + blockRowsPermission.removedCount,
        dataEgress: true,
        externalCost: true,
        retrievalProtocol: ['semantic_discovery', 'reference_collapse', 'named_atom_confirmation', 'related_document_expansion'],
        hint: 'Semantic results are candidates, not evidence. Read the returned block by stable ID and verify its source/verification attributes before reuse.',
    });
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

function resolveSearchMethodMeta(parsed: SearchMethodArgs): { method?: number; methodName?: string } {
    const method = resolveSearchMethod(parsed.methodName, parsed.method);
    return {
        ...(method !== undefined ? { method } : {}),
        ...(method !== undefined ? { methodName: getSearchMethodName(method) } : {}),
    };
}

function createFulltextPaginatedResult(
    normalizedObj: Record<string, unknown>,
    parsed: SearchFulltextArgs,
    kernelMeta: { matchedBlockCount?: number; matchedRootCount?: number; pageCount?: number },
    resolvedArgs?: Record<string, unknown>,
): ToolResult {
    const blocks = Array.isArray(normalizedObj.blocks)
        ? normalizedObj.blocks as unknown[]
        : [];
    const page = parsed.page ?? 1;
    const pageSize = parsed.pageSize ?? 32;
    const truncated = applyTruncation(blocks, 20, `Use page/pageSize parameters to paginate. Current page: ${page}.`);
    const returnedTotal = blocks.length;
    const kernelPageCount = typeof kernelMeta.pageCount === 'number' ? kernelMeta.pageCount : 1;
    const permissionFilteredCount = typeof normalizedObj.filteredOutBlockCount === 'number'
        ? normalizedObj.filteredOutBlockCount as number
        : 0;
    const postFiltered = permissionFilteredCount > 0 || !!parsed.parentId || parsed.hasTags !== undefined;
    const total = postFiltered
        ? returnedTotal
        : (typeof kernelMeta.matchedBlockCount === 'number' ? kernelMeta.matchedBlockCount : returnedTotal);
    const pagination = {
        total,
        page,
        pageSize,
        pageCount: postFiltered ? 1 : kernelPageCount,
        hasNextPage: postFiltered ? false : page < kernelPageCount,
    };
    const { blocks: _ignoredBlocks, pageCount: _ignoredPageCount, ...restRaw } = normalizedObj;
    void _ignoredBlocks;
    void _ignoredPageCount;

    return createPaginatedResult(truncated.items, pagination, {
        ...restRaw,
        ...createPartialMetadata(permissionFilteredCount),
        ...buildTruncationSummary(returnedTotal, truncated.meta),
        returnedTotal,
        returnedPageCount: 1,
        returnedHasNextPage: false,
        ...(kernelMeta.matchedBlockCount !== undefined ? { kernelMatchedBlockCount: kernelMeta.matchedBlockCount } : {}),
        ...(kernelMeta.matchedRootCount !== undefined ? { kernelMatchedRootCount: kernelMeta.matchedRootCount } : {}),
        kernelPageCount,
        kernelHasNextPage: page < kernelPageCount,
        ...(postFiltered ? {
            paginationMode: 'post_filtered_window',
            pagingHint: 'kernel* pagination fields describe the raw SiYuan search page before permission and parent/tag post-filtering.',
        } : {}),
        ...(parsed.parentId && returnedTotal === 0 ? {
            warning: 'No matching blocks were found in the requested document subtree. If the content was just created or updated, SiYuan full-text indexing may still be catching up; retry shortly.',
        } : {}),
        ...(resolvedArgs ? { resolvedArgs } : {}),
    });
}

function createSqlQueryResult(
    rows: unknown[],
    permission: {
        removedCount: number;
        permissionDeniedCount: number;
        unresolvedContextFilteredCount: number;
        unattributedRowsIncluded: number;
    },
    maxRows: number,
    resolvedArgs?: Record<string, unknown>,
): ToolResult {
    const truncated = applyTruncation(rows, maxRows, 'Add LIMIT and OFFSET to your SQL for pagination, or increase maxRows up to 1000.');
    const total = rows.length;
    return createJsonResult({
        data: truncated.items,
        total,
        totalRows: total,
        ...buildTruncationSummary(total, truncated.meta),
        ...createPartialMetadata(permission.removedCount),
        ...(permission.permissionDeniedCount > 0 ? { permissionDeniedCount: permission.permissionDeniedCount } : {}),
        ...(permission.unresolvedContextFilteredCount > 0 ? {
            unresolvedContextFilteredCount: permission.unresolvedContextFilteredCount,
            warning: 'Rows without notebook provenance were omitted because one or more notebooks are restricted. Include box/path/root_id in row-level queries, or run a scope-aware aggregate query.',
        } : {}),
        ...(permission.unattributedRowsIncluded > 0 ? {
            unattributedRowsIncluded: permission.unattributedRowsIncluded,
            permissionScope: 'all_notebooks_readable',
        } : {}),
        ...(resolvedArgs ? { resolvedArgs } : {}),
    });
}

function createFulltextAssetContentResult(
    typed: Record<string, unknown>,
    assetContents: unknown[],
    removedCount: number,
    resolvedArgs?: Record<string, unknown>,
): ToolResult {
    const truncated = applyTruncation(assetContents, 20, 'Use page/pageSize parameters to paginate asset content results.');
    const total = assetContents.length;
    return createJsonResult({
        ...typed,
        assetContents: truncated.items,
        data: truncated.items,
        total,
        ...buildTruncationSummary(total, truncated.meta),
        ...createPartialMetadata(removedCount),
        ...(resolvedArgs ? { resolvedArgs } : {}),
    });
}

export const SEARCH_ACTION_HANDLERS: Record<SearchAction, ToolActionHandler> = {
    fulltext: async ({ client, permMgr, rawArgs }) => {
        const parsed = SearchFulltextSchema.parse(rawArgs);
        if (parsed.parentId) {
            const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.parentId, 'read');
            if (denied) return denied;
        }

        const resolvedMethod = resolveSearchMethodMeta(parsed);
        const resolvedOrderBy = resolveSortAlias(parsed.sortBy, parsed.orderBy);
        const result = await searchApi.fullTextSearchBlock(client, {
            query: parsed.query,
            method: resolvedMethod.method,
            types: resolveFulltextTypes(parsed),
            paths: parsed.paths,
            groupBy: parsed.groupBy,
            orderBy: resolvedOrderBy,
            page: parsed.page,
            pageSize: resolveFulltextRequestPageSize(parsed),
        });
        const filtered = filterFullTextSearchResultByPermission(result, permMgr);
        const filteredObj = filtered as unknown as Record<string, unknown>;
        const normalizedObj: Record<string, unknown> = {
            ...filteredObj,
            blocks: normalizeReferencedBlocks(Array.isArray(filteredObj.blocks) ? filteredObj.blocks : []),
        };
        if (parsed.parentId) {
            applyFulltextParentIdFilter(normalizedObj, parsed.parentId);
        }

        if (parsed.hasTags !== undefined) {
            applyFulltextHasTagsFilter(normalizedObj, parsed.hasTags);
        }

        if (Array.isArray(normalizedObj.blocks)) {
            normalizedObj.blocks = await enrichItemsWithNotebookNames(client, normalizedObj.blocks);
        }

        const shouldExposeResolvedArgs = parsed.methodName !== undefined || parsed.sortBy !== undefined;
        const resolvedArgs = shouldExposeResolvedArgs
            ? buildResolvedArgs({
                query: parsed.query,
                ...resolvedMethod,
                ...(resolvedOrderBy !== undefined ? { orderBy: resolvedOrderBy } : {}),
                ...(resolvedOrderBy !== undefined ? { sortBy: getFulltextSortName(resolvedOrderBy) } : {}),
            }).resolvedArgs
            : undefined;

        return createFulltextPaginatedResult(normalizedObj, parsed, {
            matchedBlockCount: typeof result.matchedBlockCount === 'number' ? result.matchedBlockCount : undefined,
            matchedRootCount: typeof result.matchedRootCount === 'number' ? result.matchedRootCount : undefined,
            pageCount: typeof (result as unknown as Record<string, unknown>).pageCount === 'number'
                ? (result as unknown as Record<string, unknown>).pageCount as number
                : undefined,
        }, resolvedArgs);
    },
    semantic: async ({ client, permMgr, rawArgs }) => {
        const parsed = SearchSemanticSchema.parse(rawArgs) as SearchSemanticArgs;
        const resolvedTypes = resolveFulltextTypes(parsed as unknown as SearchFulltextArgs);
        const result = await searchApi.semanticSearchBlock(client, {
            query: parsed.query,
            paths: parsed.paths,
            types: resolvedTypes,
            subTypes: parsed.subTypes,
            page: parsed.page,
            pageSize: parsed.pageSize,
        });
        const filtered = filterFullTextSearchResultByPermission(result, permMgr) as unknown as Record<string, unknown>;
        const blocks = normalizeReferencedBlocks(Array.isArray(filtered.blocks) ? filtered.blocks : []);
        const page = parsed.page ?? 1;
        const pageSize = parsed.pageSize ?? 32;
        const pageCount = typeof filtered.pageCount === 'number' ? filtered.pageCount : 1;
        const permissionFilteredCount = typeof filtered.filteredOutBlockCount === 'number'
            ? filtered.filteredOutBlockCount
            : 0;
        const { blocks: _blocks, ...metadata } = filtered;
        void _blocks;
        return createPaginatedResult(blocks, {
            total: blocks.length,
            page,
            pageSize,
            pageCount,
            hasNextPage: page < pageCount,
        }, {
            ...metadata,
            ...createPartialMetadata(permissionFilteredCount),
            kernelMatchedBlockCount: typeof result.matchedBlockCount === 'number' ? result.matchedBlockCount : blocks.length,
            kernelMatchedRootCount: typeof result.matchedRootCount === 'number' ? result.matchedRootCount : undefined,
            dataEgress: true,
            externalCost: true,
            hint: blocks.length === 0
                ? 'No semantic candidates were returned. Verify that the SiYuan 3.8 embedding model is enabled and the index has been built.'
                : 'Semantic hits are candidates rather than evidence. Read the stable block ID and verify its source attributes before reuse.',
        });
    },
    knowledge: async ({ client, permMgr, rawArgs }) => {
        const parsed = SearchKnowledgeSchema.parse(rawArgs);
        return knowledgeSearch(client, permMgr, parsed);
    },
    query_sql: async ({ client, permMgr, rawArgs }) => {
        const parsed = SearchQuerySqlSchema.parse(rawArgs);
        const stmt = resolveAliasString(parsed.stmt, parsed.sql);
        try {
            assertReadOnlySql(stmt ?? '');
        } catch (error) {
            return createErrorResult(
                error,
                { tool: SEARCH_TOOL_NAME, action: 'query_sql', rawArgs },
            );
        }
        await permMgr.reload();
        if (hasRestrictedNotebookPermissions(permMgr)) {
            return createErrorResult(
                new Error('Raw SQL queries are unavailable while any notebook has permission "none" because arbitrary SELECT expressions can hide or forge row provenance. Grant read access to every notebook, or use a scope-aware search/database action.'),
                { tool: SEARCH_TOOL_NAME, action: 'query_sql', rawArgs },
            );
        }
        const result = await searchApi.querySQL(client, stmt ?? '');
        const rows = Array.isArray(result) ? result : [];
        const filtered = await filterItemsByPermission(client, rows, permMgr);
        const resolvedArgs = parsed.sql !== undefined
            ? buildResolvedArgs({ stmt }).resolvedArgs
            : undefined;
        return createSqlQueryResult(filtered.items, filtered, parsed.maxRows ?? 200, resolvedArgs);
    },
    get_backlinks: async ({ client, permMgr, rawArgs }) => {
        const parsed = SearchGetBacklinksSchema.parse(rawArgs);
        const scopeRootId = resolveAliasString(parsed.refTreeID, parsed.scopeRootId);
        const mode = parsed.mode ?? 'both';
        const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
        if (denied) return denied;
        try {
            const linkResult = mode !== 'mentions'
                ? await getBacklinkDocWithFallback(client, parsed.id, parsed.keyword, scopeRootId)
                : {};
            const mentionResult = mode !== 'links'
                ? await getBackmentionDocWithFallback(client, parsed.id, parsed.keyword, scopeRootId)
                : {};
            const result = { ...(linkResult as Record<string, unknown>), ...(mentionResult as Record<string, unknown>) };
            const filtered = filterBacklinkResultByPermission(result, permMgr);
            return createJsonResult({
                ...filtered,
                mode,
                backlinks: mode !== 'mentions' ? normalizeReferencedBlocks(Array.isArray(filtered.backlinks) ? filtered.backlinks : []) : [],
                backmentions: mode !== 'links' ? normalizeReferencedBlocks(Array.isArray(filtered.backmentions) ? filtered.backmentions : []) : [],
                ...(result.sourcePayloadMissing ? { sourcePayloadMissing: true } : {}),
                ...(result.fallbackQuery ? { fallbackQuery: result.fallbackQuery } : {}),
                ...(result.resultConfidence ? { resultConfidence: result.resultConfidence } : {}),
                ...(parsed.scopeRootId !== undefined ? { resolvedArgs: { refTreeID: scopeRootId } } : {}),
                ...(result.fallbackUsed ? { warning: 'SiYuan returned no backlink/backmention payload; SQL fallback results are shown.' } : {}),
            });
        } catch (error) {
            if (isPermissionRelatedApiError(error)) {
                return createJsonResult({
                    backlinks: [],
                    backmentions: [],
                    warning: 'SiYuan rejected part of the backlink/backmention query due to restricted notebooks; restricted results were omitted.',
                    partial: true,
                    reason: 'permission_filtered',
                    permissionSummary: createPartialMetadata(1).permissionSummary,
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
        const normalizedBlocks = normalizeReferencedBlocks(filtered.items);
        return createJsonResult({
            ...typed,
            blocks: normalizedBlocks,
            data: normalizedBlocks,
            total: normalizedBlocks.length,
            showing: normalizedBlocks.length,
            truncated: false,
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
        const resolvedMethod = resolveSearchMethodMeta(parsed);
        const resolvedOrderBy = resolveSortAlias(parsed.sortBy, parsed.orderBy);
        await searchApi.findReplace(client, {
            k: parsed.k,
            r: parsed.r,
            ids: parsed.ids,
            ...(parsed.paths ? { paths: parsed.paths } : {}),
            ...(parsed.types ? { types: parsed.types } : {}),
            ...(resolvedMethod.method !== undefined ? { method: resolvedMethod.method } : {}),
            ...(resolvedOrderBy !== undefined ? { orderBy: resolvedOrderBy } : {}),
            ...(parsed.groupBy !== undefined ? { groupBy: parsed.groupBy } : {}),
            ...(parsed.replaceTypes ? { replaceTypes: parsed.replaceTypes } : {}),
        });
        const shouldExposeResolvedArgs = parsed.methodName !== undefined || parsed.sortBy !== undefined;
        return createJsonResult({
            success: true,
            replaced: true,
            ids: parsed.ids,
            k: parsed.k,
            r: parsed.r,
            ...(parsed.paths ? { paths: parsed.paths } : {}),
            ...(shouldExposeResolvedArgs ? {
                resolvedArgs: buildResolvedArgs({
                    ...resolvedMethod,
                    ...(resolvedOrderBy !== undefined ? { orderBy: resolvedOrderBy } : {}),
                    ...(resolvedOrderBy !== undefined ? { sortBy: getFulltextSortName(resolvedOrderBy) } : {}),
                }).resolvedArgs,
            } : {}),
        });
    },
    search_assets: async ({ client, rawArgs }) => {
        const parsed = SearchAssetsSchema.parse(rawArgs);
        const query = resolveAliasString(parsed.k, parsed.query) ?? '';
        const result = await searchApi.searchAsset(client, query, parsed.exts);
        if (parsed.query === undefined) {
            return createJsonResult(result);
        }
        return createJsonResult({
            ...(result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : { data: result }),
            resolvedArgs: { query },
        });
    },
    fulltext_asset_content: async ({ client, permMgr, rawArgs }) => {
        const parsed = SearchFulltextAssetContentSchema.parse(rawArgs) as SearchFulltextAssetContentArgs;
        if (parsed.assetId) {
            const result = await searchApi.getAssetContent(client, parsed.assetId, parsed.query ?? '', parsed.queryMethod ?? 0);
            return createJsonResult(result);
        }
        const resolvedMethod = resolveSearchMethodMeta(parsed);
        const resolvedOrderBy = resolveAssetContentSortAlias(parsed.sortBy, parsed.orderBy);
        const result = await searchApi.fullTextSearchAssetContent(client, {
            query: parsed.query!,
            ...(parsed.types ? { types: parsed.types } : {}),
            ...(resolvedMethod.method !== undefined ? { method: resolvedMethod.method } : {}),
            ...(resolvedOrderBy !== undefined ? { orderBy: resolvedOrderBy } : {}),
            ...(parsed.page !== undefined ? { page: parsed.page } : {}),
            ...(parsed.pageSize !== undefined ? { pageSize: parsed.pageSize } : {}),
        });
        const typed = result && typeof result === 'object' ? result as Record<string, unknown> : {};
        const assetContents = Array.isArray(typed.assetContents) ? typed.assetContents : [];
        const filtered = await filterItemsByPermission(client, assetContents, permMgr);
        const shouldExposeResolvedArgs = parsed.methodName !== undefined || parsed.sortBy !== undefined;
        return createFulltextAssetContentResult(typed, filtered.items, filtered.removedCount, shouldExposeResolvedArgs
            ? buildResolvedArgs({
                query: parsed.query,
                ...resolvedMethod,
                ...(resolvedOrderBy !== undefined ? { orderBy: resolvedOrderBy } : {}),
                ...(resolvedOrderBy !== undefined ? { sortBy: getAssetContentSortName(resolvedOrderBy) } : {}),
            }).resolvedArgs
            : undefined);
    },
    list_invalid_refs: async ({ client, permMgr, rawArgs }) => {
        const parsed = SearchListInvalidRefsSchema.parse(rawArgs);
        const result = await searchApi.listInvalidBlockRefs(client, parsed.page, parsed.pageSize);
        const filtered = filterFullTextSearchResultByPermission((result ?? {}) as {
            blocks?: unknown[];
            matchedBlockCount?: number;
            matchedRootCount?: number;
        }, permMgr);
        const filteredObj = filtered as unknown as Record<string, unknown>;
        const blocks = Array.isArray(filteredObj.blocks) ? filteredObj.blocks : [];
        const normalizedBlocks = normalizeReferencedBlocks(blocks);
        return createJsonResult({
            ...filteredObj,
            blocks: normalizedBlocks,
            data: normalizedBlocks,
            total: normalizedBlocks.length,
            showing: normalizedBlocks.length,
            truncated: false,
            ...createPartialMetadata(typeof filteredObj.filteredOutBlockCount === 'number' ? filteredObj.filteredOutBlockCount as number : 0),
        });
    },
};

import type { SiYuanClient } from '../../../api/client';
import * as attributeApi from '../../../api/attribute';
import * as blockApi from '../../../api/block';
import * as documentApi from '../../../api/document';
import * as fileApi from '../../../api/file';
import type { DocumentAction } from '../../config';
import { normalizeMarkdownContent } from '../../normalize';
import type { PermissionManager } from '../../permissions';
import {
    DocumentActionSchema,
    DocumentCreateSchema,
    DocumentCreateEmptySchema,
    DocumentCreateDailyNoteSchema,
    DocumentDocToHeadingSchema,
    DocumentDuplicateSchema,
    DocumentGetChildBlocksSchema,
    DocumentGetChildDocsSchema,
    DocumentGetDocSchema,
    DocumentGetHPathSchema,
    DocumentGetIdsSchema,
    DocumentHeadingToDocSchema,
    DocumentListTreeSchema,
    DocumentGetPathSchema,
    DocumentMoveSchema,
    DocumentRemoveBatchSchema,
    DocumentRemoveSchema,
    DocumentRenameSchema,
    DocumentSearchDocsSchema,
    DocumentSetCoverSchema,
    DocumentSetIconSchema,
} from '../../types';
import {
    ensurePermissionForDocumentId,
    ensurePermissionForNotebook,
    listChildDocumentsByPath,
    resolveMoveTargetNotebook,
    resolveNotebookForPath,
} from '../context';
import { filterBacklinkResultByPermission, filterItemsByPermissionAndPath } from '../search';
import { createJsonResult, createPermissionDeniedResult, createSetIconReminder, paginate, type ToolResult } from '../shared';
import { applyUiRefresh } from '../ui-refresh';

const GET_HPATH_INDEXING_RETRY_DELAYS_MS = [120, 240];

function isIndexingError(error: unknown): boolean {
    return error instanceof Error
        && /SiYuan API error:\s*-1\s*-\s*indexing/i.test(error.message);
}

async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getHPathByIdWithRetry(client: SiYuanClient, id: string): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= GET_HPATH_INDEXING_RETRY_DELAYS_MS.length; attempt += 1) {
        try {
            return await documentApi.getHPathByID(client, id);
        } catch (error) {
            if (!isIndexingError(error) || attempt === GET_HPATH_INDEXING_RETRY_DELAYS_MS.length) {
                lastError = error;
                break;
            }
            lastError = error;
            await sleep(GET_HPATH_INDEXING_RETRY_DELAYS_MS[attempt]);
        }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`Failed to resolve hierarchical path for document "${id}" because SiYuan indexing is still catching up. Retry shortly after create. Last error: ${message}`);
}

function normalizeDocumentCoverSource(source: string): { source: string; titleImg: string } {
    const normalizedSource = source.trim();
    if (!normalizedSource) {
        throw new Error('Cover source must not be empty.');
    }

    const isRemoteUrl = /^https?:\/\//i.test(normalizedSource);
    const isAssetPath = normalizedSource.startsWith('/assets/');
    if (!isRemoteUrl && !isAssetPath) {
        throw new Error('Cover source must be an http(s) URL or a SiYuan asset path starting with /assets/.');
    }

    const escapedSource = normalizedSource
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');

    return {
        source: normalizedSource,
        titleImg: `background-image:url("${escapedSource}");`,
    };
}

function truncateTreeByDepth(nodes: unknown, maxDepth: number, currentDepth = 0): unknown {
    if (!Array.isArray(nodes)) return nodes;
    return nodes.map((node) => {
        if (!node || typeof node !== 'object') return node;
        const typedNode = node as Record<string, unknown>;
        if (currentDepth >= maxDepth && Array.isArray(typedNode.children) && typedNode.children.length > 0) {
            const { children, ...rest } = typedNode;
            return { ...rest, childCount: (children as unknown[]).length, childrenTruncated: true };
        }
        if (Array.isArray(typedNode.children)) {
            return { ...typedNode, children: truncateTreeByDepth(typedNode.children, maxDepth, currentDepth + 1) };
        }
        return typedNode;
    });
}

async function enrichTreeNodesWithDocInfo(
    client: SiYuanClient,
    value: unknown,
    cache = new Map<string, Promise<Awaited<ReturnType<typeof blockApi.getDocInfo>>>>(),
): Promise<unknown> {
    if (!Array.isArray(value)) return value;

    return Promise.all(value.map(async (node) => {
        if (!node || typeof node !== 'object') return node;
        const typedNode = node as Record<string, unknown>;
        const enrichedNode: Record<string, unknown> = { ...typedNode };
        const id = typeof typedNode.id === 'string' ? typedNode.id : undefined;

        if (id && (typedNode.name === undefined || typedNode.icon === undefined)) {
            try {
                let pending = cache.get(id);
                if (!pending) {
                    pending = blockApi.getDocInfo(client, id);
                    cache.set(id, pending);
                }
                const info = await pending;
                if (enrichedNode.name === undefined && info.name) {
                    enrichedNode.name = info.name.replace(/\.sy$/, '');
                }
                if (enrichedNode.icon === undefined && info.icon) {
                    enrichedNode.icon = info.icon;
                }
            } catch {
                // Ignore enrichment failures and keep the original node.
            }
        }

        if (Array.isArray(typedNode.children)) {
            enrichedNode.children = await enrichTreeNodesWithDocInfo(client, typedNode.children, cache);
        }

        return enrichedNode;
    }));
}

function filterSearchDocsResultByPermission(result: unknown, permMgr: PermissionManager): unknown {
    if (Array.isArray(result)) {
        return filterBacklinkResultByPermission({ backmentions: result }, permMgr).backmentions;
    }

    if (!result || typeof result !== 'object') return result;
    const typedResult = result as Record<string, unknown>;

    if (Array.isArray(typedResult.files)) {
        return {
            ...typedResult,
            files: filterBacklinkResultByPermission({ backmentions: typedResult.files }, permMgr).backmentions,
        };
    }

    if (Array.isArray(typedResult.docs)) {
        return {
            ...typedResult,
            docs: filterBacklinkResultByPermission({ backmentions: typedResult.docs }, permMgr).backmentions,
        };
    }

    return result;
}

async function filterSearchDocsResult(
    client: SiYuanClient,
    result: unknown,
    permMgr: PermissionManager,
    scopePath?: string,
): Promise<{
    data: unknown;
    permissionFilteredOutCount: number;
    pathFilteredOutCount: number;
}> {
    if (Array.isArray(result)) {
        const filtered = await filterItemsByPermissionAndPath(client, result, permMgr, scopePath);
        return {
            data: filtered.items,
            permissionFilteredOutCount: filtered.permissionFilteredOutCount,
            pathFilteredOutCount: filtered.pathFilteredOutCount,
        };
    }

    if (!result || typeof result !== 'object') {
        return {
            data: result,
            permissionFilteredOutCount: 0,
            pathFilteredOutCount: 0,
        };
    }

    const typedResult = result as Record<string, unknown>;

    if (Array.isArray(typedResult.files)) {
        const filtered = await filterItemsByPermissionAndPath(client, typedResult.files, permMgr, scopePath);
        return {
            data: {
                ...typedResult,
                files: filtered.items,
            },
            permissionFilteredOutCount: filtered.permissionFilteredOutCount,
            pathFilteredOutCount: filtered.pathFilteredOutCount,
        };
    }

    if (Array.isArray(typedResult.docs)) {
        const filtered = await filterItemsByPermissionAndPath(client, typedResult.docs, permMgr, scopePath);
        return {
            data: {
                ...typedResult,
                docs: filtered.items,
            },
            permissionFilteredOutCount: filtered.permissionFilteredOutCount,
            pathFilteredOutCount: filtered.pathFilteredOutCount,
        };
    }

    return {
        data: filterSearchDocsResultByPermission(result, permMgr),
        permissionFilteredOutCount: 0,
        pathFilteredOutCount: 0,
    };
}

interface DocumentHandlerContext {
    client: SiYuanClient;
    permMgr: PermissionManager;
    rawArgs: Record<string, unknown>;
}

type DocumentActionHandler = (ctx: DocumentHandlerContext) => Promise<ToolResult>;

const handleCreate: DocumentActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = DocumentCreateSchema.parse(rawArgs);
    await permMgr.reload();
    if (!permMgr.canWrite(parsed.notebook)) {
        return createPermissionDeniedResult(parsed.notebook, permMgr.get(parsed.notebook), 'write');
    }
    const docId = await documentApi.createDoc(client, parsed.notebook, parsed.path, parsed.markdown);
    if (parsed.icon) {
        await attributeApi.setBlockAttrs(client, docId, { icon: parsed.icon });
    }
    return applyUiRefresh(client, createJsonResult({
        success: true,
        notebook: parsed.notebook,
        path: parsed.path,
        id: docId,
        iconHint: createSetIconReminder('document', Boolean(parsed.icon)),
    }), parsed.icon
        ? [{ type: 'reloadIcon' }]
        : [
            { type: 'reloadProtyle', id: docId },
            { type: 'reloadFiletree' },
        ]);
};

const handleRename: DocumentActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = DocumentRenameSchema.parse(rawArgs);
    if (parsed.id) {
        const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'write');
        if (denied) return denied;
        await documentApi.renameDocByID(client, parsed.id, parsed.title);
        return applyUiRefresh(client, createJsonResult({ success: true, id: parsed.id, title: parsed.title }), [
            { type: 'reloadProtyle', id: context.documentId },
            { type: 'reloadFiletree' },
        ]);
    }
    if (parsed.notebook) {
        const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'write');
        if (denied) return denied;
    }
    await documentApi.renameDoc(client, parsed.notebook!, parsed.path!, parsed.title);
    return applyUiRefresh(client, createJsonResult({
        success: true,
        notebook: parsed.notebook,
        path: parsed.path,
        title: parsed.title,
    }), [{ type: 'reloadFiletree' }]);
};

const handleRemove: DocumentActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = DocumentRemoveSchema.parse(rawArgs);
    if (parsed.id) {
        const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'delete');
        if (denied) return denied;
        await documentApi.removeDocByID(client, parsed.id);
        return applyUiRefresh(client, createJsonResult({ success: true, id: parsed.id }), [
            { type: 'reloadProtyle', id: context.documentId },
            { type: 'reloadFiletree' },
        ]);
    }
    if (parsed.notebook) {
        const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'delete');
        if (denied) return denied;
    }
    await documentApi.removeDoc(client, parsed.notebook!, parsed.path!);
    return applyUiRefresh(client, createJsonResult({
        success: true,
        notebook: parsed.notebook,
        path: parsed.path,
    }), [{ type: 'reloadFiletree' }]);
};

const handleMove: DocumentActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = DocumentMoveSchema.parse(rawArgs);
    if (parsed.toNotebook) {
        const denied = await ensurePermissionForNotebook(permMgr, parsed.toNotebook, 'write');
        if (denied) return denied;
    }
    if (parsed.toID) {
        const targetNotebook = await resolveMoveTargetNotebook(client, parsed.toID);
        const denied = await ensurePermissionForNotebook(permMgr, targetNotebook, 'write');
        if (denied) return denied;
    }
    if (parsed.fromIDs) {
        const sourceDocumentIDs: string[] = [];
        for (const id of parsed.fromIDs) {
            const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, id, 'write');
            if (denied) return denied;
            sourceDocumentIDs.push(context.documentId);
        }
        await documentApi.moveDocsByID(client, parsed.fromIDs, parsed.toID!);
        return applyUiRefresh(client, createJsonResult({ success: true, fromIDs: parsed.fromIDs, toID: parsed.toID }), [
            ...sourceDocumentIDs.map((id) => ({ type: 'reloadProtyle' as const, id })),
            { type: 'reloadFiletree' },
        ]);
    }
    for (const sourcePath of parsed.fromPaths!) {
        const sourceNotebook = await resolveNotebookForPath(client, sourcePath);
        if (!sourceNotebook) {
            throw new Error(`Unable to resolve source notebook for storage path "${sourcePath}" while checking permissions.`);
        }
        const denied = await ensurePermissionForNotebook(permMgr, sourceNotebook, 'write');
        if (denied) return denied;
    }
    await documentApi.moveDocs(client, parsed.fromPaths!, parsed.toNotebook!, parsed.toPath!);
    return applyUiRefresh(client, createJsonResult({
        success: true,
        fromPaths: parsed.fromPaths,
        toNotebook: parsed.toNotebook,
        toPath: parsed.toPath,
    }), [{ type: 'reloadFiletree' }]);
};

const handleGetPath: DocumentActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = DocumentGetPathSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
    if (denied) return denied;
    const result = await documentApi.getPathByID(client, parsed.id);
    return createJsonResult(result);
};

const handleGetHPath: DocumentActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = DocumentGetHPathSchema.parse(rawArgs);
    if (parsed.notebook) {
        const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'read');
        if (denied) return denied;
    }
    if (parsed.id) {
        const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
        if (denied) return denied;
        const result = await getHPathByIdWithRetry(client, parsed.id);
        return createJsonResult(result);
    }
    const result = await documentApi.getHPathByPath(client, parsed.notebook!, parsed.path!);
    return createJsonResult(result);
};

const handleGetIds: DocumentActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = DocumentGetIdsSchema.parse(rawArgs);
    const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'read');
    if (denied) return denied;
    const result = await documentApi.getIDsByHPath(client, parsed.path, parsed.notebook);
    return createJsonResult(result);
};

const handleGetChildBlocks: DocumentActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = DocumentGetChildBlocksSchema.parse(rawArgs);
    const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
    if (denied) return denied;
    const result = await blockApi.getChildBlocks(client, context.documentId);
    return createJsonResult(result);
};

const handleGetChildDocs: DocumentActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = DocumentGetChildDocsSchema.parse(rawArgs);
    const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
    if (denied) return denied;
    const result = await listChildDocumentsByPath(client, context.notebook, context.path);
    return createJsonResult(result);
};

const handleSetIcon: DocumentActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = DocumentSetIconSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'write');
    if (denied) return denied;
    await attributeApi.setBlockAttrs(client, parsed.id, { icon: parsed.icon });
    return applyUiRefresh(client, createJsonResult({ success: true, id: parsed.id, icon: parsed.icon }), [{ type: 'reloadIcon' }]);
};

const handleSetCover: DocumentActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = DocumentSetCoverSchema.parse(rawArgs);
    const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'write');
    if (denied) return denied;
    const source = parsed.source;
    if (!source) {
        await attributeApi.setBlockAttrs(client, parsed.id, { 'title-img': '' });
        return applyUiRefresh(client, createJsonResult({ success: true, id: parsed.id, cleared: true }), [{ type: 'reloadProtyle', id: context.documentId }]);
    }
    const normalized = normalizeDocumentCoverSource(source);
    await attributeApi.setBlockAttrs(client, parsed.id, { 'title-img': normalized.titleImg });
    return applyUiRefresh(client, createJsonResult({
        success: true,
        id: parsed.id,
        source: normalized.source,
        titleImg: normalized.titleImg,
    }), [{ type: 'reloadProtyle', id: context.documentId }]);
};

const handleListTree: DocumentActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = DocumentListTreeSchema.parse(rawArgs);
    const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'read');
    if (denied) return denied;
    const maxDepth = parsed.maxDepth ?? 3;
    const result = await documentApi.listDocTree(client, parsed.notebook, parsed.path);
    const depthHint = 'Use maxDepth to control tree depth. Use document(action="list_tree") with a deeper path to expand specific subtrees.';
    if (result && typeof result === 'object' && Array.isArray((result as Record<string, unknown>).tree)) {
        const enriched = await enrichTreeNodesWithDocInfo(client, (result as Record<string, unknown>).tree);
        return createJsonResult({
            ...(result as Record<string, unknown>),
            tree: truncateTreeByDepth(enriched, maxDepth),
            maxDepth,
            depthHint,
        });
    }
    const enriched = await enrichTreeNodesWithDocInfo(client, result);
    return createJsonResult({ tree: truncateTreeByDepth(enriched, maxDepth), maxDepth, depthHint });
};

const handleSearchDocs: DocumentActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = DocumentSearchDocsSchema.parse(rawArgs);
    const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'read');
    if (denied) return denied;
    const result = await documentApi.searchDocs(client, parsed.query);
    const filtered = await filterSearchDocsResult(client, result, permMgr, parsed.path);
    const totalFilteredOutCount = filtered.permissionFilteredOutCount + filtered.pathFilteredOutCount;
    return createJsonResult({
        ...((filtered.data && typeof filtered.data === 'object' && !Array.isArray(filtered.data))
            ? filtered.data as Record<string, unknown>
            : { docs: filtered.data }),
        ...(parsed.path ? { path: parsed.path, pathApplied: true } : {}),
        ...(filtered.permissionFilteredOutCount > 0 ? { partial: true, reason: 'permission_filtered' } : {}),
        ...(totalFilteredOutCount > 0 ? { filteredOutCount: totalFilteredOutCount } : {}),
        ...(filtered.pathFilteredOutCount > 0 ? { pathFilteredOutCount: filtered.pathFilteredOutCount } : {}),
    });
};

const handleGetDoc: DocumentActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = DocumentGetDocSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
    if (denied) return denied;
    if (parsed.mode === 'html') {
        const result = await documentApi.getDoc(client, parsed.id, 0, parsed.size);
        return createJsonResult({ id: parsed.id, mode: 'html', ...((result && typeof result === 'object') ? result as Record<string, unknown> : { content: result }) });
    }
    const markdown = normalizeMarkdownContent(await fileApi.exportMdContent(client, parsed.id));
    const content = typeof markdown.content === 'string' ? markdown.content : '';
    const page = parsed.page ?? 1;
    const pageSize = parsed.pageSize ?? 8000;
    const pageCount = Math.max(1, Math.ceil(content.length / pageSize));
    const normalizedPage = Math.min(page, pageCount);
    const start = (normalizedPage - 1) * pageSize;
    const pagedContent = content.slice(start, start + pageSize);
    const isPaginated = content.length > pageSize;
    return createJsonResult({
        id: parsed.id,
        mode: 'markdown',
        hPath: markdown.hPath,
        content: pagedContent,
        ...(isPaginated ? {
            truncated: true,
            contentLength: content.length,
            showing: pagedContent.length,
            page: normalizedPage,
            pageSize,
            pageCount,
            hasNextPage: normalizedPage < pageCount,
            hint: 'Use page/pageSize to read the next markdown chunk. For structured reads, use document(action="get_child_blocks") or block(action="get_kramdown").',
        } : {}),
    });
};

const handleCreateDailyNote: DocumentActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = DocumentCreateDailyNoteSchema.parse(rawArgs);
    const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'write');
    if (denied) return denied;
    const result = await documentApi.createDailyNote(client, parsed.notebook, parsed.app);
    let hPath: string | undefined;
    try {
        hPath = await documentApi.getHPathByID(client, result.id);
    } catch {
        hPath = undefined;
    }
    return applyUiRefresh(client, createJsonResult({
        success: true,
        notebook: parsed.notebook,
        ...result,
        ...(hPath ? { hPath } : {}),
        iconHint: createSetIconReminder('document'),
    }), [
        { type: 'reloadProtyle', id: result.id },
        { type: 'reloadFiletree' },
    ]);
};

const handleDuplicate: DocumentActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = DocumentDuplicateSchema.parse(rawArgs);
    const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'write');
    if (denied) return denied;
    const result = await documentApi.duplicateDoc(client, parsed.id);
    return applyUiRefresh(client, createJsonResult({
        success: true,
        sourceID: parsed.id,
        ...result,
    }), [
        { type: 'reloadProtyle', id: context.documentId },
        { type: 'reloadFiletree' },
    ]);
};

const handleRemoveBatch: DocumentActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = DocumentRemoveBatchSchema.parse(rawArgs);
    for (const path of parsed.paths) {
        const notebook = await resolveNotebookForPath(client, path);
        if (!notebook) {
            throw new Error(`Unable to resolve notebook for storage path "${path}" while checking permissions.`);
        }
        const denied = await ensurePermissionForNotebook(permMgr, notebook, 'delete');
        if (denied) return denied;
    }
    await documentApi.removeDocs(client, parsed.paths);
    return applyUiRefresh(client, createJsonResult({
        success: true,
        paths: parsed.paths,
        count: parsed.paths.length,
    }), [{ type: 'reloadFiletree' }]);
};

const handleCreateEmpty: DocumentActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = DocumentCreateEmptySchema.parse(rawArgs);
    const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'write');
    if (denied) return denied;
    const result = await documentApi.createEmptyDoc(client, parsed.notebook, parsed.path, parsed.title, parsed.markdown ?? '', parsed.sorts);
    return applyUiRefresh(client, createJsonResult({
        success: true,
        notebook: parsed.notebook,
        path: parsed.path,
        title: parsed.title,
        ...result,
        iconHint: createSetIconReminder('document'),
    }), [
        { type: 'reloadProtyle', id: result.id },
        { type: 'reloadFiletree' },
    ]);
};

const handleHeadingToDoc: DocumentActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = DocumentHeadingToDocSchema.parse(rawArgs);
    const source = await ensurePermissionForDocumentId(client, permMgr, parsed.headingID, 'write');
    if (source.denied) return source.denied;
    const denied = await ensurePermissionForNotebook(permMgr, parsed.targetNotebook, 'write');
    if (denied) return denied;
    await documentApi.headingToDoc(client, parsed.headingID, parsed.targetNotebook, parsed.targetPath, parsed.previousPath);
    return applyUiRefresh(client, createJsonResult({
        success: true,
        headingID: parsed.headingID,
        targetNotebook: parsed.targetNotebook,
        ...(parsed.targetPath ? { targetPath: parsed.targetPath } : {}),
        ...(parsed.previousPath ? { previousPath: parsed.previousPath } : {}),
    }), [
        { type: 'reloadProtyle', id: source.context.documentId },
        { type: 'reloadFiletree' },
    ]);
};

const handleDocToHeading: DocumentActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = DocumentDocToHeadingSchema.parse(rawArgs);
    const source = await ensurePermissionForDocumentId(client, permMgr, parsed.srcID, 'write');
    if (source.denied) return source.denied;
    const target = await ensurePermissionForDocumentId(client, permMgr, parsed.targetID, 'write');
    if (target.denied) return target.denied;
    const result = await documentApi.docToHeading(client, parsed.srcID, parsed.targetID, parsed.after ?? false);
    return applyUiRefresh(client, createJsonResult({
        success: true,
        srcID: parsed.srcID,
        targetID: parsed.targetID,
        after: parsed.after ?? false,
        ...result,
    }), [
        { type: 'reloadProtyle', id: source.context.documentId },
        { type: 'reloadProtyle', id: target.context.documentId },
        { type: 'reloadFiletree' },
    ]);
};

export const DOCUMENT_ACTION_HANDLERS: Record<DocumentAction, DocumentActionHandler> = {
    create: handleCreate,
    rename: handleRename,
    remove: handleRemove,
    move: handleMove,
    get_path: handleGetPath,
    get_hpath: handleGetHPath,
    get_ids: handleGetIds,
    get_child_blocks: handleGetChildBlocks,
    get_child_docs: handleGetChildDocs,
    set_icon: handleSetIcon,
    set_cover: handleSetCover,
    list_tree: handleListTree,
    search_docs: handleSearchDocs,
    get_doc: handleGetDoc,
    create_daily_note: handleCreateDailyNote,
    duplicate: handleDuplicate,
    remove_batch: handleRemoveBatch,
    create_empty: handleCreateEmpty,
    heading_to_doc: handleHeadingToDoc,
    doc_to_heading: handleDocToHeading,
};

import type { SiYuanClient } from '../../api/client';
import * as attributeApi from '../../api/attribute';
import * as blockApi from '../../api/block';
import * as documentApi from '../../api/document';
import * as fileApi from '../../api/file';
import type { CategoryToolConfig, DocumentAction } from '../config';
import { DOCUMENT_ACTION_HINTS, DOCUMENT_GUIDANCE } from '../help';
import { normalizeMarkdownContent } from '../normalize';
import type { PermissionManager } from '../permissions';
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
    DocumentClearCoverSchema,
    DocumentMoveSchema,
    DocumentRemoveBatchSchema,
    DocumentRemoveSchema,
    DocumentRenameSchema,
    DocumentSearchDocsSchema,
    DocumentSetCoverSchema,
    DocumentSetIconSchema,
} from '../types';
import {
    ensurePermissionForDocumentId,
    ensurePermissionForNotebook,
    listChildDocumentsByPath,
    resolveMoveTargetNotebook,
    resolveNotebookForPath,
} from './context';
import { filterBacklinkResultByPermission, filterItemsByPermissionAndPath } from './search';
import { buildAggregatedTool, createActionSchema, createDisabledActionResult, createErrorResult, createJsonResult, createPermissionDeniedResult, createSetIconReminder, paginate, tryHandleHelpAction, type ActionVariant, type ToolResult } from './shared';
import { applyUiRefresh } from './ui-refresh';

export const DOCUMENT_TOOL_NAME = 'document';

export const DOCUMENT_VARIANTS: ActionVariant<DocumentAction>[] = [
    {
        action: 'create',
        schema: createActionSchema('create', {
            notebook: { type: 'string', description: 'Notebook ID' },
            path: { type: 'string', description: 'Human-readable target path, must start with / (e.g., /foo/bar). Parent paths must already exist.' },
            markdown: { type: 'string', description: 'Markdown content' },
            icon: { type: 'string', description: 'Optional document icon. Prefer a Unicode hex code string such as "1f4d4" for 📔 instead of a raw emoji character.' },
        }, ['notebook', 'path', 'markdown'], 'Create a new document with markdown content.'),
    },
    {
        action: 'rename',
        schema: createActionSchema('rename', {
            id: { type: 'string', description: 'Document ID' },
            title: { type: 'string', description: 'New document title' },
        }, ['id', 'title'], 'Rename a document by document ID.'),
    },
    {
        action: 'rename',
        schema: createActionSchema('rename', {
            notebook: { type: 'string', description: 'Notebook ID' },
            path: { type: 'string', description: 'Storage path' },
            title: { type: 'string', description: 'New document title' },
        }, ['notebook', 'path', 'title'], 'Rename a document by storage path.'),
    },
    {
        action: 'remove',
        schema: createActionSchema('remove', {
            id: { type: 'string', description: 'Document ID' },
        }, ['id'], 'Remove a document by document ID.'),
    },
    {
        action: 'remove',
        schema: createActionSchema('remove', {
            notebook: { type: 'string', description: 'Notebook ID' },
            path: { type: 'string', description: 'Storage path' },
        }, ['notebook', 'path'], 'Remove a document by storage path.'),
    },
    {
        action: 'move',
        schema: createActionSchema('move', {
            fromPaths: { type: 'array', items: { type: 'string' }, description: 'Source document paths' },
            toNotebook: { type: 'string', description: 'Target notebook ID' },
            toPath: { type: 'string', description: 'Target storage path' },
        }, ['fromPaths', 'toNotebook', 'toPath'], 'Move multiple documents by storage path.'),
    },
    {
        action: 'move',
        schema: createActionSchema('move', {
            fromIDs: { type: 'array', items: { type: 'string' }, description: 'Source document IDs' },
            toID: { type: 'string', description: 'Target document ID or notebook ID' },
        }, ['fromIDs', 'toID'], 'Move multiple documents by document ID.'),
    },
    {
        action: 'get_path',
        schema: createActionSchema('get_path', {
            id: { type: 'string', description: 'Document ID' },
        }, ['id'], 'Get storage path by document ID.'),
    },
    {
        action: 'get_hpath',
        schema: createActionSchema('get_hpath', {
            id: { type: 'string', description: 'Document ID' },
        }, ['id'], 'Get hierarchical path by document ID.'),
    },
    {
        action: 'get_hpath',
        schema: createActionSchema('get_hpath', {
            notebook: { type: 'string', description: 'Notebook ID' },
            path: { type: 'string', description: 'Storage path' },
        }, ['notebook', 'path'], 'Get hierarchical path by storage path.'),
    },
    {
        action: 'get_ids',
        schema: createActionSchema('get_ids', {
            path: { type: 'string', description: 'Human-readable path (e.g., /foo/bar)' },
            notebook: { type: 'string', description: 'Notebook ID' },
        }, ['path', 'notebook'], 'Get document IDs by hierarchical path.'),
    },
    {
        action: 'get_child_blocks',
        schema: createActionSchema('get_child_blocks', {
            id: { type: 'string', description: 'Document ID' },
        }, ['id'], 'Get direct child blocks for a document ID.'),
    },
    {
        action: 'get_child_docs',
        schema: createActionSchema('get_child_docs', {
            id: { type: 'string', description: 'Document ID' },
        }, ['id'], 'Get direct child documents for a document ID.'),
    },
    {
        action: 'set_icon',
        schema: createActionSchema('set_icon', {
            id: { type: 'string', description: 'Document ID' },
            icon: { type: 'string', description: 'Icon value. Prefer a Unicode hex code string such as "1f4d4" for 📔; raw emoji characters may not render correctly. Custom icon paths are also supported.' },
        }, ['id', 'icon'], 'Set the icon for a document or folder.'),
    },
    {
        action: 'set_cover',
        schema: createActionSchema('set_cover', {
            id: { type: 'string', description: 'Document ID' },
            source: { type: 'string', description: 'Cover image source. Accepts http(s) URLs or SiYuan asset paths like /assets/foo.png.' },
        }, ['id', 'source'], 'Set the document cover image using a URL or SiYuan asset path.'),
    },
    {
        action: 'clear_cover',
        schema: createActionSchema('clear_cover', {
            id: { type: 'string', description: 'Document ID' },
        }, ['id'], 'Clear the document cover image.'),
    },
    {
        action: 'list_tree',
        schema: createActionSchema('list_tree', {
            notebook: { type: 'string', description: 'Notebook ID' },
            path: { type: 'string', description: 'Storage path or / for the notebook root' },
            maxDepth: { type: 'number', description: 'Max tree depth (default 3). Deeper nodes collapsed to childCount.' },
        }, ['notebook', 'path'], 'List the document tree under a notebook path.'),
    },
    {
        action: 'search_docs',
        schema: createActionSchema('search_docs', {
            notebook: { type: 'string', description: 'Notebook ID used for permission scoping' },
            query: { type: 'string', description: 'Keyword to search in document titles' },
            path: { type: 'string', description: 'Optional storage path to narrow the search scope' },
        }, ['notebook', 'query'], 'Search documents by title keyword.'),
    },
    {
        action: 'get_doc',
        schema: createActionSchema('get_doc', {
            id: { type: 'string', description: 'Document ID' },
            mode: { type: 'string', enum: ['markdown', 'html'], description: 'Return mode: markdown (default) or html' },
            size: { type: 'number', description: 'Optional maximum content size hint' },
            page: { type: 'number', description: 'Page number for markdown pagination (1-based)' },
            pageSize: { type: 'number', description: 'Characters per page for markdown pagination (default 8000)' },
        }, ['id'], 'Get document content and metadata with markdown pagination support.'),
    },
    {
        action: 'create_daily_note',
        schema: createActionSchema('create_daily_note', {
            notebook: { type: 'string', description: 'Notebook ID' },
            app: { type: 'string', description: 'Optional app identifier passed through to SiYuan' },
        }, ['notebook'], 'Create or return today’s daily note.'),
    },
    {
        action: 'duplicate',
        schema: createActionSchema('duplicate', {
            id: { type: 'string', description: 'Source document ID' },
        }, ['id'], 'Duplicate an existing document.'),
    },
    {
        action: 'remove_batch',
        schema: createActionSchema('remove_batch', {
            paths: { type: 'array', items: { type: 'string' }, description: 'One or more storage paths to remove in batch' },
        }, ['paths'], 'Remove multiple documents by storage path.'),
    },
    {
        action: 'create_empty',
        schema: createActionSchema('create_empty', {
            notebook: { type: 'string', description: 'Notebook ID' },
            path: { type: 'string', description: 'Parent human-readable path, must start with /' },
            title: { type: 'string', description: 'New document title' },
            markdown: { type: 'string', description: 'Optional initial markdown content, defaults to empty' },
            sorts: { type: 'array', items: { type: 'string' }, description: 'Optional sorting path segments passed through to SiYuan' },
        }, ['notebook', 'path', 'title'], 'Create an empty document (or seed it with optional markdown).'),
    },
    {
        action: 'heading_to_doc',
        schema: createActionSchema('heading_to_doc', {
            headingID: { type: 'string', description: 'Heading block ID to convert into a document' },
            targetNotebook: { type: 'string', description: 'Target notebook ID' },
            targetPath: { type: 'string', description: 'Optional target storage path' },
            previousPath: { type: 'string', description: 'Optional previous sibling storage path' },
        }, ['headingID', 'targetNotebook'], 'Convert a heading into a new document.'),
    },
    {
        action: 'doc_to_heading',
        schema: createActionSchema('doc_to_heading', {
            srcID: { type: 'string', description: 'Source document ID' },
            targetID: { type: 'string', description: 'Target document or heading block ID' },
            after: { type: 'boolean', description: 'Insert after the target heading instead of before it' },
        }, ['srcID', 'targetID'], 'Convert a document into a heading under another document.'),
    },
];

export function listDocumentTools(config: CategoryToolConfig<DocumentAction>) {
    return buildAggregatedTool(
        DOCUMENT_TOOL_NAME,
        '📝 Grouped document operations.',
        config,
        DOCUMENT_VARIANTS,
        {
            guidance: DOCUMENT_GUIDANCE,
            actionHints: DOCUMENT_ACTION_HINTS,
            propertyDescriptionOverrides: {
                path: 'Path value. For action="create", use a human-readable target path such as /Inbox/Weekly Note. For other document actions that use notebook + path, use a storage path returned by document(action="get_path").',
                fromPaths: 'Source storage paths returned by document(action="get_path").',
                toPath: 'Target storage path. Use the storage path of an existing destination document returned by document(action="get_path").',
            },
        },
    );
}

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
    const normalized = normalizeDocumentCoverSource(parsed.source);
    await attributeApi.setBlockAttrs(client, parsed.id, { 'title-img': normalized.titleImg });
    return applyUiRefresh(client, createJsonResult({
        success: true,
        id: parsed.id,
        source: normalized.source,
        titleImg: normalized.titleImg,
    }), [{ type: 'reloadProtyle', id: context.documentId }]);
};

const handleClearCover: DocumentActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = DocumentClearCoverSchema.parse(rawArgs);
    const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'write');
    if (denied) return denied;
    await attributeApi.setBlockAttrs(client, parsed.id, { 'title-img': '' });
    return applyUiRefresh(client, createJsonResult({ success: true, id: parsed.id, cleared: true }), [{ type: 'reloadProtyle', id: context.documentId }]);
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

const DOCUMENT_ACTION_HANDLERS: Record<DocumentAction, DocumentActionHandler> = {
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
    clear_cover: handleClearCover,
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

export async function callDocumentTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<DocumentAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    const rawArgs = args ?? {};
    const action = typeof rawArgs.action === 'string' ? rawArgs.action : undefined;

    const helpResult = tryHandleHelpAction(DOCUMENT_TOOL_NAME, rawArgs, config, DOCUMENT_VARIANTS);
    if (helpResult) return helpResult;

    try {
        const parsedAction = DocumentActionSchema.parse(rawArgs.action);
        if (!config.enabled || !config.actions[parsedAction]) {
            return createDisabledActionResult(DOCUMENT_TOOL_NAME, parsedAction);
        }

        const handler = DOCUMENT_ACTION_HANDLERS[parsedAction];
        return await handler({ client, permMgr, rawArgs });
    } catch (error) {
        return createErrorResult(error, { tool: DOCUMENT_TOOL_NAME, action, rawArgs });
    }
}

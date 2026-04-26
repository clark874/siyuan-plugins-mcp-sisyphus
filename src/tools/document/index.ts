import type { SiYuanClient } from '../../api/client';
import type { DocumentAction, CategoryToolConfig } from '../../core/config';
import { DOCUMENT_ACTION_HINTS, DOCUMENT_GUIDANCE } from '../../core/help';
import type { PermissionManager } from '../../core/permissions';
import { DocumentActionSchema } from '../../core/types';
import { defineTool } from '../define-tool';
import { createActionSchema, type ActionVariant, type ToolResult } from '../shared';
import { DOCUMENT_ACTION_HANDLERS } from './handlers';

export const DOCUMENT_TOOL_NAME = 'document';

export const DOCUMENT_VARIANTS: ActionVariant<DocumentAction>[] = [
    {
        action: 'create',
        schema: createActionSchema('create', {
            notebook: { type: 'string', description: 'Notebook ID' },
            path: { type: 'string', description: 'Human-readable target path like /Inbox/Weekly Note' },
            parentPath: { type: 'string', description: 'Parent human-readable path for title-based creation' },
            title: { type: 'string', description: 'Document title when creating under parentPath' },
            markdown: { type: 'string', description: 'Initial markdown content, defaults to empty' },
            sorts: { type: 'array', items: { type: 'string' }, description: 'Optional sorting path segments passed through to SiYuan for parentPath + title creation' },
            icon: { type: 'string', description: 'Document icon (optional)' },
        }, ['notebook'], 'Create a new document. Provide either path, or parentPath + title.'),
    },
    {
        action: 'resolve',
        schema: createActionSchema('resolve', {
            id: { type: 'string', description: 'Document ID to resolve' },
            notebook: { type: 'string', description: 'Notebook ID, required with path or hpath' },
            path: { type: 'string', description: 'Storage path to resolve when notebook is provided' },
            hpath: { type: 'string', description: 'Human-readable path to resolve when notebook is provided' },
            hPath: { type: 'string', description: 'Alias for hpath' },
            include: {
                type: 'array',
                items: { type: 'string', enum: ['id', 'ids', 'path', 'hpath', 'docInfo'] },
                description: 'Fields to include: id, ids, path, hpath, docInfo',
            },
        }, [], 'Resolve document IDs, storage paths, human-readable paths, and document metadata from one document reference.'),
    },
    {
        action: 'rename',
        schema: createActionSchema('rename', {
            notebook: { type: 'string', description: 'Notebook ID' },
            path: { type: 'string', description: 'Storage path resolved with document(action="resolve")' },
            title: { type: 'string', description: 'New document title' },
        }, ['notebook', 'path', 'title'], 'Rename a document'),
    },
    {
        action: 'remove',
        schema: createActionSchema('remove', {
            notebook: { type: 'string', description: 'Notebook ID' },
            path: { type: 'string', description: 'Storage path resolved with document(action="resolve")' },
        }, ['notebook', 'path'], 'Delete a document'),
    },
    {
        action: 'move',
        schema: createActionSchema('move', {
            notebook: { type: 'string', description: 'Source notebook ID' },
            path: { type: 'string', description: 'Source storage path' },
            toNotebook: { type: 'string', description: 'Target notebook ID (optional, defaults to source)' },
            toPath: { type: 'string', description: 'Target storage path (optional, defaults to source)' },
            fromIDs: { type: 'array', items: { type: 'string' }, description: 'Source document IDs (alternative to notebook+path)' },
            fromPaths: { type: 'array', items: { type: 'string' }, description: 'Source storage paths (alternative to notebook+path)' },
            toID: { type: 'string', description: 'Target document or notebook ID (alternative)' },
        }, ['notebook', 'path'], 'Move a document to another location'),
    },
    {
        action: 'get_child_blocks',
        schema: createActionSchema('get_child_blocks', {
            id: { type: 'string', description: 'Document ID' },
        }, ['id'], 'Get top-level blocks of a document'),
    },
    {
        action: 'get_child_docs',
        schema: createActionSchema('get_child_docs', {
            id: { type: 'string', description: 'Document ID' },
        }, ['id'], 'Get child documents'),
    },
    {
        action: 'set_icon',
        schema: createActionSchema('set_icon', {
            id: { type: 'string', description: 'Document ID' },
            icon: { type: 'string', description: 'Icon (Unicode hex or emoji)' },
        }, ['id', 'icon'], 'Set document icon'),
    },
    {
        action: 'set_cover',
        schema: createActionSchema('set_cover', {
            id: { type: 'string', description: 'Document ID' },
            source: { type: 'string', description: 'Image URL or asset path' },
        }, ['id'], 'Set document cover image'),
    },
    {
        action: 'list_tree',
        schema: createActionSchema('list_tree', {
            notebook: { type: 'string', description: 'Notebook ID' },
            path: { type: 'string', description: 'Root path' },
            maxDepth: { type: 'number', description: 'Max depth (default 3)' },
        }, ['notebook'], 'Get document tree'),
    },
    {
        action: 'search_docs',
        schema: createActionSchema('search_docs', {
            notebook: { type: 'string', description: 'Notebook ID' },
            query: { type: 'string', description: 'Search keyword' },
        }, ['notebook', 'query'], 'Search documents by title'),
    },
    {
        action: 'get_doc',
        schema: createActionSchema('get_doc', {
            id: { type: 'string', description: 'Document ID' },
            mode: { type: 'string', enum: ['markdown', 'html'], description: 'Return format (default markdown)' },
            size: { type: 'number', description: 'Max content size hint' },
            page: { type: 'number', description: 'Page number for markdown pagination (1-based)' },
            pageSize: { type: 'number', description: 'Characters per page for pagination (default 8000)' },
        }, ['id'], 'Get full document content'),
    },
    {
        action: 'create_daily_note',
        schema: createActionSchema('create_daily_note', {
            notebook: { type: 'string', description: 'Notebook ID' },
        }, ['notebook'], 'Create or open today\'s daily note'),
    },
    {
        action: 'duplicate',
        schema: createActionSchema('duplicate', {
            id: { type: 'string', description: 'Source document ID' },
        }, ['id'], 'Duplicate a document'),
    },
    {
        action: 'remove_batch',
        schema: createActionSchema('remove_batch', {
            paths: { type: 'array', items: { type: 'string' }, description: 'Storage paths to remove' },
        }, ['paths'], 'Delete multiple documents'),
    },
    {
        action: 'heading_to_doc',
        schema: createActionSchema('heading_to_doc', {
            headingID: { type: 'string', description: 'Heading block ID to convert' },
        }, ['headingID'], 'Convert a heading to a separate document'),
    },
    {
        action: 'doc_to_heading',
        schema: createActionSchema('doc_to_heading', {
            srcID: { type: 'string', description: 'Source document ID' },
            targetID: { type: 'string', description: 'Target document ID' },
            after: { type: 'boolean', description: 'Insert after (default before)' },
        }, ['srcID', 'targetID'], 'Merge a document into another as a heading'),
    },
];

const documentTool = defineTool<DocumentAction>({
    name: 'document',
    description: '📝 Grouped document operations.',
    variants: DOCUMENT_VARIANTS,
    actionSchema: DocumentActionSchema,
    aggregateOptions: {
        guidance: DOCUMENT_GUIDANCE,
        actionHints: DOCUMENT_ACTION_HINTS,
        propertyDescriptionOverrides: {
            path: 'Path value. For action="create", use a human-readable target path such as /Inbox/Weekly Note. For path-based rename/remove/move, use a storage path returned by document(action="resolve").',
            fromPaths: 'Source storage paths returned by document(action="resolve").',
            toPath: 'Target storage path. Use the storage path of an existing destination document returned by document(action="resolve").',
        },
    },
    handlers: DOCUMENT_ACTION_HANDLERS,
});

export function listDocumentTools(config: CategoryToolConfig<DocumentAction>) {
    return documentTool.listTools(config);
}

export async function callDocumentTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<DocumentAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    return documentTool.callTool(client, args, config, permMgr);
}

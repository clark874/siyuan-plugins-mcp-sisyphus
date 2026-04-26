import type { SiYuanClient } from '../../api/client';
import type { CategoryToolConfig, SearchAction } from '../../core/config';
import { SEARCH_ACTION_HINTS, SEARCH_GUIDANCE } from '../../core/help';
import type { PermissionManager } from '../../core/permissions';
import { SearchActionSchema } from '../../core/types';
import { defineTool } from '../define-tool';
import { createActionSchema, type ActionVariant, type ToolResult } from '../shared';
import { SEARCH_ACTION_HANDLERS } from './handlers';

export {
    filterBacklinkResultByPermission,
    filterFullTextSearchResultByPermission,
    filterItemsByPermission,
    filterItemsByPermissionAndPath,
} from './permission-filter';

export const SEARCH_TOOL_NAME = 'search';

export const SEARCH_VARIANTS: ActionVariant<SearchAction>[] = [
    {
        action: 'fulltext',
        schema: createActionSchema('fulltext', {
            query: { type: 'string', description: 'Search query string' },
            method: { type: 'number', description: 'Search method: 0=keyword (default), 1=query syntax, 2=SQL, 3=regex' },
            methodName: { type: 'string', enum: ['keyword', 'query', 'query_syntax', 'sql', 'regex'], description: 'Semantic alias for method. Overrides method if both are provided.' },
            types: { type: 'object', additionalProperties: { type: 'boolean' }, description: 'Block type filter. Accepts full names (e.g. {"heading": true}) or shortcodes (e.g. {"h": true, "p": true}). Shortcodes: d=document, h=heading, p=paragraph, l=list, i=listItem, b=blockquote, c=codeBlock, m=mathBlock, t=table, s=superBlock, html=htmlBlock, embed=embedBlock, av=databaseBlock, video, audio, widget.' },
            typeShortcodes: { type: 'array', items: { type: 'string' }, description: 'Alternative shorthand type filter as array: ["h","p"]. Merged with types if both provided.' },
            paths: { type: 'array', items: { type: 'string' }, description: 'Restrict search to specific notebook paths' },
            groupBy: { type: 'number', description: '0=no grouping (default), 1=group by document' },
            orderBy: { type: 'number', description: 'Legacy numeric sort order: 0=type, 1=created ASC, 2=created DESC, 3=updated ASC, 4=updated DESC, 5=content ASC, 6=content DESC, 7=relevance (default)' },
            sortBy: { type: 'string', enum: ['relevance', 'date', 'updated_desc', 'updated_asc', 'created_desc', 'created_asc', 'type'], description: 'Semantic sort alias. Overrides orderBy.' },
            page: { type: 'number', description: 'Page number (1-based), default 1' },
            pageSize: { type: 'number', description: 'Results per page, default 32, max 128' },
            parentId: { type: 'string', description: 'Post-filter: only return blocks within this document subtree (matches root_id or parent_id)' },
            hasTags: { type: 'boolean', description: 'When true, only blocks with tags; when false, only blocks without tags' },
            stripHtml: { type: 'boolean', description: 'Legacy toggle. plainContent is already returned by default; keep highlighted HTML content unchanged.' },
        }, ['query'], 'Full-text search across all blocks.'),
    },
    {
        action: 'query_sql',
        schema: createActionSchema('query_sql', {
            stmt: { type: 'string', description: 'SQL SELECT statement to execute against the blocks/spans/assets tables' },
            sql: { type: 'string', description: 'Semantic alias for stmt. Overrides stmt if both are provided.' },
        }, ['stmt'], 'Execute a read-only SQL query against the database.'),
    },
    {
        action: 'get_backlinks',
        schema: createActionSchema('get_backlinks', {
            id: { type: 'string', description: 'Block or document ID to find backlinks for' },
            keyword: { type: 'string', description: 'Filter backlinks by keyword' },
            refTreeID: { type: 'string', description: 'Optional document tree ID to narrow backlink scope' },
            scopeRootId: { type: 'string', description: 'Semantic alias for refTreeID. Overrides refTreeID if both are provided.' },
            mode: { type: 'string', enum: ['links', 'mentions', 'both'], description: 'Result mode; default both' },
        }, ['id'], 'Find documents/blocks that link to or mention the given block.'),
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
            methodName: { type: 'string', enum: ['keyword', 'query', 'query_syntax', 'sql', 'regex'], description: 'Semantic alias for method. Overrides method if both are provided.' },
            orderBy: { type: 'number', description: 'Legacy numeric sort order' },
            sortBy: { type: 'string', enum: ['relevance', 'date', 'updated_desc', 'updated_asc', 'created_desc', 'created_asc', 'type'], description: 'Semantic sort alias. Overrides orderBy.' },
            groupBy: { type: 'number', description: 'Grouping mode' },
            replaceTypes: { type: 'object', additionalProperties: { type: 'boolean' }, description: 'Replace target kinds such as text, code, docTitle, blockRef' },
        }, ['k', 'r', 'ids'], 'Find and replace text in documents or blocks.'),
    },
    {
        action: 'search_assets',
        schema: createActionSchema('search_assets', {
            k: { type: 'string', description: 'Legacy asset filename keyword field' },
            query: { type: 'string', description: 'Semantic alias for k. Overrides k if both are provided.' },
            exts: { type: 'array', items: { type: 'string' }, description: 'Optional extension filters' },
        }, ['k'], 'Search asset files by filename.'),
    },
    {
        action: 'fulltext_asset_content',
        schema: createActionSchema('fulltext_asset_content', {
            query: { type: 'string', description: 'Search query string' },
            assetId: { type: 'string', description: 'Asset content ID for exact lookup' },
            queryMethod: { type: 'number', description: 'Query method for assetId lookup' },
            types: { type: 'object', additionalProperties: { type: 'boolean' }, description: 'Asset type filter' },
            method: { type: 'number', description: 'Search method: 0=keyword, 1=query syntax, 2=SQL, 3=regex' },
            methodName: { type: 'string', enum: ['keyword', 'query', 'query_syntax', 'sql', 'regex'], description: 'Semantic alias for method. Overrides method if both are provided.' },
            orderBy: { type: 'number', description: 'Legacy numeric sort order: 0=relevance DESC, 1=relevance ASC, 2=updated ASC, 3=updated DESC' },
            sortBy: { type: 'string', enum: ['relevance', 'relevance_desc', 'relevance_asc', 'updated_asc', 'updated_desc'], description: 'Semantic sort alias. Overrides orderBy.' },
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

const searchTool = defineTool<SearchAction>({
    name: SEARCH_TOOL_NAME,
    description: '🔍 Grouped search and query operations.',
    variants: SEARCH_VARIANTS,
    actionSchema: SearchActionSchema,
    aggregateOptions: {
        guidance: SEARCH_GUIDANCE,
        actionHints: SEARCH_ACTION_HINTS,
        guidanceInlineLimit: 5,
    },
    handlers: SEARCH_ACTION_HANDLERS,
});

export function listSearchTools(config: CategoryToolConfig<SearchAction>) {
    return searchTool.listTools(config);
}

export async function callSearchTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<SearchAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    return searchTool.callTool(client, args, config, permMgr);
}

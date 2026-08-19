import type { SiYuanClient } from '../../api/client';
import type { CategoryToolConfig, SearchAction } from '../../core/config';
import { SEARCH_ACTION_HINTS, SEARCH_GUIDANCE } from '../../core/help';
import type { PermissionManager } from '../../core/permissions';
import {
    SearchActionSchema,
    SearchAssetsSchema,
    SearchFindReplaceSchema,
    SearchCheckAnchorSchema,
    SearchFulltextAssetContentSchema,
    SearchFulltextSchema,
    SearchGetBacklinksSchema,
    SearchListInvalidRefsSchema,
    SearchKnowledgeSchema,
    SearchSemanticSchema,
    SearchQuerySqlSchema,
    SearchRefsSchema,
} from '../../core/types';
import { defineTool } from '../internal/define-tool';
import { createZodActionVariant, type ActionVariant, type ToolResult } from '../internal/shared';
import { SEARCH_ACTION_HANDLERS } from './handlers';

export {
    filterBacklinkResultByPermission,
    filterFullTextSearchResultByPermission,
    filterItemsByPermission,
    filterItemsByPermissionAndPath,
} from './permission-filter';

export const SEARCH_TOOL_NAME = 'search';

export const SEARCH_VARIANTS: ActionVariant<SearchAction>[] = [
    createZodActionVariant('fulltext', SearchFulltextSchema, 'Full-text search across all blocks.'),
    createZodActionVariant('semantic', SearchSemanticSchema, 'Run low-level semantic discovery through the SiYuan 3.8 embedding index.'),
    createZodActionVariant('knowledge', SearchKnowledgeSchema, 'Discover knowledge with semantic search, collapse reference-only hits, prefer named content atoms, and attach related documents.'),
    createZodActionVariant('check_anchor', SearchCheckAnchorSchema, 'Check candidate name or alias tokens against the readable knowledge anchor namespace.'),
    createZodActionVariant('query_sql', SearchQuerySqlSchema, 'Execute a read-only SQL query against the database.'),
    createZodActionVariant('get_backlinks', SearchGetBacklinksSchema, 'Find documents/blocks that link to or mention the given block.'),
    createZodActionVariant('search_refs', SearchRefsSchema, 'Search blocks that reference a given block or document.'),
    createZodActionVariant('find_replace', SearchFindReplaceSchema, 'Find and replace text in documents or blocks.'),
    createZodActionVariant('search_assets', SearchAssetsSchema, 'Search asset files by filename.'),
    createZodActionVariant('fulltext_asset_content', SearchFulltextAssetContentSchema, 'Full-text search indexed asset contents.'),
    createZodActionVariant('list_invalid_refs', SearchListInvalidRefsSchema, 'List invalid block references.'),
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

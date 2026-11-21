import type { SiYuanClient } from '../../api/client';
import type { CategoryToolConfig, SearchAction } from '../../core/config';
import { SEARCH_ACTION_HINTS, SEARCH_GUIDANCE } from '../../core/help';
import type { PermissionManager } from '../../core/permissions';
import {
    SearchActionSchema,
    SearchCriteriaListSchema,
    SearchCriteriaRemoveSchema,
    SearchCriteriaSaveSchema,
    SearchFindReplaceSchema,
    SearchCheckAnchorSchema,
    SearchFulltextSchema,
    SearchGetBacklinksSchema,
    SearchListInvalidRefsSchema,
    SearchLintSchema,
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
    createZodActionVariant('fulltext', SearchFulltextSchema, '按思源全文索引查块。Markdown 原行匹配请用 fs.search。'),
    createZodActionVariant('semantic', SearchSemanticSchema, 'Run low-level semantic discovery through the SiYuan 3.8 embedding index.'),
    createZodActionVariant('knowledge', SearchKnowledgeSchema, '检索知识：受控名称直达，支持混合召回、相邻上下文、可选TypeSafe文本精排及 prior_art 已核验成果预检。'),
    createZodActionVariant('check_anchor', SearchCheckAnchorSchema, 'Check candidate name or alias tokens against the readable knowledge anchor namespace.'),
    createZodActionVariant('lint', SearchLintSchema, '审计指定文档或笔记本的断链、名称冲突、孤儿、陈旧来源、大小及重复原子。'),
    createZodActionVariant('query_sql', SearchQuerySqlSchema, 'Execute a read-only SQL query against the database.'),
    createZodActionVariant('get_backlinks', SearchGetBacklinksSchema, 'Find documents/blocks that link to or mention the given block.'),
    createZodActionVariant('search_refs', SearchRefsSchema, 'Search blocks that reference a given block or document.'),
    createZodActionVariant('find_replace', SearchFindReplaceSchema, 'Find and replace text in documents or blocks.'),
    createZodActionVariant('list_invalid_refs', SearchListInvalidRefsSchema, 'List invalid block references.'),
    createZodActionVariant('criteria_list', SearchCriteriaListSchema, 'List workspace saved-search criteria (name + opaque kernel condition object).'),
    createZodActionVariant('criteria_save', SearchCriteriaSaveSchema, 'Save or overwrite a named search criterion. Requires user confirmation.'),
    createZodActionVariant('criteria_remove', SearchCriteriaRemoveSchema, 'Remove a saved search criterion by name. Requires user confirmation.'),
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

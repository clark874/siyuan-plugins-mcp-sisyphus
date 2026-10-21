import type { SiYuanClient } from '../../api/client';
import type { AvAction, CategoryToolConfig } from '../../core/config';
import { AV_ACTION_HINTS, AV_GUIDANCE } from '../../core/help';
import type { PermissionManager } from '../../core/permissions';
import {
    AvActionSchema,
    AvGetAutomationsSchema, AvSetAutomationsSchema, AvPreviewCollectionSchema, AvCollectBlocksSchema, AvPreviewTemplateSchema,
    AvAddColumnSchema,
    AvAddRowsSchema,
    AvDuplicateSchema,
    AvGetAttributeViewFilterSortSchema,
    AvGetAttributeViewKeysSchema,
    AvGetPrimaryKeyValuesSchema,
    AvGetSchema,
    AvRemoveColumnSchema,
    AvRemoveRowsSchema,
    AvRenameSchema,
    AvRenderSchema,
    AvSearchSchema,
    AvSetCellsSchema,
} from '../../core/types';
import { defineTool } from '../internal/define-tool';
import { createZodActionVariant, type ActionVariant, type ToolResult } from '../internal/shared';
import { AV_ACTION_HANDLERS } from './handlers';
import { AUTOMATION_ACTION_HANDLERS } from './automation';

export const AV_TOOL_NAME = 'av';

export const AV_VARIANTS: ActionVariant<AvAction>[] = [
    createZodActionVariant('get_automations', AvGetAutomationsSchema, '读取数据库自动化规则；所有镜像与视图共享配置。'),
    createZodActionVariant('set_automations', AvSetAutomationsSchema, '整体保存原生自动化规则；先读取配置，再新增、修改、停用或移除规则，既有条目保留。'),
    createZodActionVariant('preview_collection', AvPreviewCollectionSchema, '分页预览已启用规则匹配的来源块，不写入数据库。'),
    createZodActionVariant('collect_blocks', AvCollectBlocksSchema, '通过原生事务收集预览后指定的来源块；执行时重新验证规则，不清理或删除内容。'),
    createZodActionVariant('preview_template', AvPreviewTemplateSchema, '按实际源条目求值原生模板，返回目标字段值，不保存或触发自动化。'),
    createZodActionVariant('get', AvGetSchema, 'Get the full attribute view payload by AV ID; blockID is an optional exact database-block context.'),
    createZodActionVariant('render', AvRenderSchema, 'Render a compact attribute-view table by id (AV ID, not avID) with optional paging/filtering; use ignoreRows=true for schema-only output, verbose=true only for raw kernel rows, or createIfNotExist=true to materialize an AV block under blockID.'),
    createZodActionVariant('get_attribute_view_keys', AvGetAttributeViewKeysSchema, 'Get the column (key) definitions of an attribute view.'),
    createZodActionVariant('get_attribute_view_filter_sort', AvGetAttributeViewFilterSortSchema, 'Get filter and sort settings for an attribute view.'),
    createZodActionVariant('search', AvSearchSchema, 'Search attribute views by name or primary-key values.'),
    createZodActionVariant('rename', AvRenameSchema, 'Rename an attribute view through a reversible SiYuan transaction.'),
    createZodActionVariant('add_rows', AvAddRowsSchema, 'Add bound block rows or detached plain-text primary-key rows to a database.'),
    createZodActionVariant('remove_rows', AvRemoveRowsSchema, 'Remove rows from a database.'),
    createZodActionVariant('add_column', AvAddColumnSchema, 'Add a column to a database.'),
    createZodActionVariant('remove_column', AvRemoveColumnSchema, 'Remove a column from a database.'),
    createZodActionVariant('set_cells', AvSetCellsSchema, 'Set one or more cell values in a database. Provide cells/items, or pass rowID + columnID + valueType for a single-cell write.'),
    createZodActionVariant('duplicate', AvDuplicateSchema, 'Duplicate an attribute view using SiYuan copy-as-mirror semantics; previousID overrides the insertion target.'),
    createZodActionVariant('get_primary_key_values', AvGetPrimaryKeyValuesSchema, 'Get primary key values for an attribute view.'),
];

const avTool = defineTool<AvAction>({
    name: 'av',
    description: '\ud83d\uddc3\ufe0f Grouped attribute-view (database) operations.',
    variants: AV_VARIANTS,
    actionSchema: AvActionSchema,
    aggregateOptions: {
        guidance: AV_GUIDANCE,
        actionHints: AV_ACTION_HINTS,
    },
    handlers: { ...AV_ACTION_HANDLERS, ...AUTOMATION_ACTION_HANDLERS },
});

export function listAvTools(config: CategoryToolConfig<AvAction>) {
    return avTool.listTools(config);
}

export async function callAvTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<AvAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    return avTool.callTool(client, args, config, permMgr);
}

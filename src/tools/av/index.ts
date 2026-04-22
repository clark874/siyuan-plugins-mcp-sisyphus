import type { SiYuanClient } from '../../api/client';
import type { AvAction, CategoryToolConfig } from '../../core/config';
import { AV_ACTION_HINTS, AV_GUIDANCE } from '../../core/help';
import type { PermissionManager } from '../../core/permissions';
import { AvActionSchema } from '../../core/types';
import { defineTool } from '../define-tool';
import { createActionSchema, type ActionVariant, type ToolResult } from '../shared';
import { AV_ACTION_HANDLERS } from './handlers';

export const AV_TOOL_NAME = 'av';

export const AV_VARIANTS: ActionVariant<AvAction>[] = [
    {
        action: 'get',
        schema: createActionSchema('get', {
            id: { type: 'string', description: 'Attribute view ID' },
        }, ['id'], 'Get the full attribute view payload by AV ID.'),
    },
    {
        action: 'render_attribute_view',
        schema: createActionSchema('render_attribute_view', {
            id: { type: 'string', description: 'Attribute view ID; omit only with createIfNotExist=true to let MCP generate one' },
            blockID: { type: 'string', description: 'Embedding block ID; required when creating a new AV and used as the append target' },
            viewID: { type: 'string', description: 'View ID to render (optional, defaults to the current active view)' },
            page: { type: 'number', description: 'Page number (1-based), default 1' },
            pageSize: { type: 'number', description: 'Rows per page, default 48' },
            query: { type: 'string', description: 'Filter keyword to narrow rows' },
            groupPaging: {
                type: 'object',
                description: 'Per-group pagination when the view uses group-by. Keys are group value strings; values are { pageSize: number }.',
                additionalProperties: {
                    type: 'object',
                    properties: { pageSize: { type: 'number' } },
                    required: ['pageSize'],
                },
            },
            createIfNotExist: { type: 'boolean', description: 'Create and materialize the AV only when explicitly true; provide blockID when creating a new AV.' },
        }, [], 'Render an attribute view with optional server-side paging, filtering, and view selection.'),
    },
    {
        action: 'get_attribute_view_keys',
        schema: createActionSchema('get_attribute_view_keys', {
            id: { type: 'string', description: 'Attribute view ID' },
        }, ['id'], 'Get the column (key) definitions of an attribute view.'),
    },
    {
        action: 'get_attribute_view_filter_sort',
        schema: createActionSchema('get_attribute_view_filter_sort', {
            id: { type: 'string', description: 'Attribute view ID' },
            blockID: { type: 'string', description: 'Optional embedding block ID for view-specific filter/sort' },
        }, ['id'], 'Get filter and sort settings for an attribute view.'),
    },
    {
        action: 'search',
        schema: createActionSchema('search', {
            keyword: { type: 'string', description: 'Keyword to match AV name or primary-key values' },
            excludes: {
                type: 'array',
                items: { type: 'string' },
                description: 'AV IDs to exclude from results',
            },
        }, ['keyword'], 'Search attribute views by name or primary-key values.'),
    },
    {
        action: 'add_rows',
        schema: createActionSchema('add_rows', {
            avID: { type: 'string', description: 'Attribute view ID' },
            blockID: { type: 'string', description: 'Owning database block ID (optional, inferred when possible)' },
            viewID: { type: 'string', description: 'Target view ID' },
            groupID: { type: 'string', description: 'Group ID for grouped views' },
            previousID: { type: 'string', description: 'Row ID after which to insert (optional)' },
            ignoreDefaultFill: { type: 'boolean', description: 'If true, skip default value fill for new rows' },
            blockIDs: {
                type: 'array',
                items: { type: 'string' },
                description: 'IDs of content blocks to bind as new rows',
            },
        }, ['avID', 'blockIDs'], 'Add rows (bound to content blocks) to a database.'),
    },
    {
        action: 'remove_rows',
        schema: createActionSchema('remove_rows', {
            avID: { type: 'string', description: 'Attribute view ID' },
            blockID: { type: 'string', description: 'Owning database block ID for permission resolution (optional)' },
            srcIDs: {
                type: 'array',
                items: { type: 'string' },
                description: 'Source block IDs of the rows to remove',
            },
        }, ['avID', 'srcIDs'], 'Remove rows from a database.'),
    },
    {
        action: 'add_column',
        schema: createActionSchema('add_column', {
            avID: { type: 'string', description: 'Attribute view ID' },
            blockID: { type: 'string', description: 'Owning database block ID for permission resolution (optional)' },
            keyID: { type: 'string', description: 'Column key ID (auto-generated if omitted)' },
            keyName: { type: 'string', description: 'Column display name' },
            keyType: { type: 'string', description: 'Column type (text, number, date, select, mSelect, url, email, phone, checkbox, relation, rollup, template, mAsset, lineNumber, created, updated)' },
            keyIcon: { type: 'string', description: 'Column icon' },
            previousKeyID: { type: 'string', description: 'Insert after this column' },
        }, ['avID', 'keyName', 'keyType'], 'Add a column to a database.'),
    },
    {
        action: 'remove_column',
        schema: createActionSchema('remove_column', {
            avID: { type: 'string', description: 'Attribute view ID' },
            blockID: { type: 'string', description: 'Owning database block ID for permission resolution (optional)' },
            keyID: { type: 'string', description: 'Column key ID to remove' },
            columnID: { type: 'string', description: 'Alias for keyID (deprecated, use keyID)' },
            removeRelationDest: { type: 'boolean', description: 'Also remove the paired relation column in the target AV (default false)' },
        }, ['avID'], 'Remove a column from a database.'),
    },
    {
        action: 'set_cell',
        schema: createActionSchema('set_cell', {
            avID: { type: 'string', description: 'Attribute view ID' },
            blockID: { type: 'string', description: 'Owning database block ID for permission resolution (optional)' },
            rowID: { type: 'string', description: 'Row item ID (value.blockID, NOT the source block ID or value.id)' },
            columnID: { type: 'string', description: 'Column key ID' },
            valueType: { type: 'string', enum: ['text', 'number', 'date', 'checkbox', 'select', 'multi_select', 'relation', 'url', 'email', 'phone', 'mAsset'], description: 'Cell value type' },
            text: { type: 'string', description: 'Text content (for text, url, email, phone, mAsset types)' },
            number: { type: 'number', description: 'Number value' },
            numberFormat: { type: 'string', description: 'Number format string' },
            date: { description: 'ISO 8601 date string or epoch milliseconds' },
            endDate: { description: 'End date (ISO 8601 or epoch ms), enables date range' },
            includeTime: { type: 'boolean', description: 'Include time in date display' },
            checked: { type: 'boolean', description: 'Checkbox state' },
            option: { type: 'string', description: 'Single select option content' },
            options: { type: 'array', items: { type: 'string' }, description: 'Multi-select option contents' },
            relationBlockIDs: { type: 'array', items: { type: 'string' }, description: 'Related block IDs' },
            url: { type: 'string', description: 'URL value' },
            email: { type: 'string', description: 'Email value' },
            phone: { type: 'string', description: 'Phone value' },
            assets: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        type: { type: 'string', enum: ['image', 'file'] },
                        content: { type: 'string', description: 'Asset URL or path' },
                        name: { type: 'string', description: 'Display name' },
                    },
                    required: ['type', 'content'],
                },
                description: 'Asset entries for mAsset type',
            },
        }, ['avID', 'rowID', 'columnID', 'valueType'], 'Set a single cell value in a database.'),
    },
    {
        action: 'batch_set_cells',
        schema: createActionSchema('batch_set_cells', {
            avID: { type: 'string', description: 'Attribute view ID' },
            blockID: { type: 'string', description: 'Owning database block ID for permission resolution (optional)' },
            items: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        rowID: { type: 'string' },
                        columnID: { type: 'string' },
                        valueType: { type: 'string', enum: ['text', 'number', 'date', 'checkbox', 'select', 'multi_select', 'relation', 'url', 'email', 'phone', 'mAsset'] },
                        text: { type: 'string' },
                        number: { type: 'number' },
                        numberFormat: { type: 'string' },
                        date: {},
                        endDate: {},
                        includeTime: { type: 'boolean' },
                        checked: { type: 'boolean' },
                        option: { type: 'string' },
                        options: { type: 'array', items: { type: 'string' } },
                        relationBlockIDs: { type: 'array', items: { type: 'string' } },
                        url: { type: 'string' },
                        email: { type: 'string' },
                        phone: { type: 'string' },
                        assets: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, content: { type: 'string' }, name: { type: 'string' } }, required: ['type', 'content'] } },
                    },
                    required: ['rowID', 'columnID', 'valueType'],
                },
                description: 'Array of cell updates',
            },
        }, ['avID', 'items'], 'Set multiple cell values in a single call.'),
    },
    {
        action: 'duplicate_block',
        schema: createActionSchema('duplicate_block', {
            avID: { type: 'string', description: 'Source attribute view ID to duplicate' },
            previousID: { type: 'string', description: 'Block ID after which to insert the duplicate (optional, auto-resolved)' },
        }, ['avID'], 'Duplicate an attribute view and insert it into the document tree.'),
    },
    {
        action: 'get_primary_key_values',
        schema: createActionSchema('get_primary_key_values', {
            avID: { type: 'string', description: 'Attribute view ID' },
            keyword: { type: 'string', description: 'Filter by keyword in primary key values' },
            page: { type: 'number', description: 'Page number (1-based), default 1' },
            pageSize: { type: 'number', description: 'Rows per page, default all' },
        }, ['avID'], 'Get primary key values for an attribute view.'),
    },
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
    handlers: AV_ACTION_HANDLERS,
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

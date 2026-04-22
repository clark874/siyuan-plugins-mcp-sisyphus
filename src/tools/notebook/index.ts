import type { SiYuanClient } from '../../api/client';
import type { CategoryToolConfig, NotebookAction } from '../../core/config';
import { NOTEBOOK_ACTION_HINTS, NOTEBOOK_GUIDANCE } from '../../core/help';
import type { PermissionManager } from '../../core/permissions';
import { NotebookActionSchema } from '../../core/types';
import { defineTool } from '../define-tool';
import { createActionSchema, type ActionVariant, type ToolResult } from '../shared';
import { NOTEBOOK_ACTION_HANDLERS } from './handlers';

export { NOTEBOOK_TOOL_NAME } from './handlers';

export const NOTEBOOK_VARIANTS: ActionVariant<NotebookAction>[] = [
    {
        action: 'list',
        schema: createActionSchema('list', {}, [], 'List all notebooks in the workspace.'),
    },
    {
        action: 'create',
        schema: createActionSchema('create', {
            name: { type: 'string', description: 'Notebook name' },
            icon: { type: 'string', description: 'Optional notebook icon. Prefer a Unicode hex code string such as "1f4d4" for 📔 instead of a raw emoji character.' },
        }, ['name'], 'Create a new notebook.'),
    },
    {
        action: 'set_open_state',
        schema: createActionSchema('set_open_state', {
            notebook: { type: 'string', description: 'Notebook ID' },
            opened: { type: 'boolean', description: 'true to open, false to close' },
        }, ['notebook', 'opened'], 'Set notebook open state (open or close).'),
    },
    {
        action: 'remove',
        schema: createActionSchema('remove', {
            notebook: { type: 'string', description: 'Notebook ID' },
        }, ['notebook'], 'Remove a notebook.'),
    },
    {
        action: 'rename',
        schema: createActionSchema('rename', {
            notebook: { type: 'string', description: 'Notebook ID' },
            name: { type: 'string', description: 'New notebook name' },
        }, ['notebook', 'name'], 'Rename a notebook.'),
    },
    {
        action: 'get_conf',
        schema: createActionSchema('get_conf', {
            notebook: { type: 'string', description: 'Notebook ID' },
        }, ['notebook'], 'Get notebook configuration.'),
    },
    {
        action: 'set_conf',
        schema: createActionSchema('set_conf', {
            notebook: { type: 'string', description: 'Notebook ID' },
            conf: {
                type: 'object',
                description: 'Notebook configuration',
                properties: {
                    name: { type: 'string' },
                    closed: { type: 'boolean' },
                    refCreateSavePath: { type: 'string' },
                    createDocNameTemplate: { type: 'string' },
                    dailyNoteSavePath: { type: 'string' },
                    dailyNoteTemplatePath: { type: 'string' },
                },
            },
        }, ['notebook', 'conf'], 'Set notebook configuration.'),
    },
    {
        action: 'set_icon',
        schema: createActionSchema('set_icon', {
            notebook: { type: 'string', description: 'Notebook ID' },
            icon: { type: 'string', description: 'Icon value. Prefer a Unicode hex code string such as "1f4d4" for 📔; raw emoji characters may not render correctly. Custom icon paths are also supported.' },
        }, ['notebook', 'icon'], 'Set the icon for a notebook.'),
    },
    {
        action: 'get_permissions',
        schema: createActionSchema('get_permissions', {
            notebook: { type: 'string', description: 'Notebook ID, or "all" to return every notebook permission entry. Omit to return all notebooks.' },
        }, [], 'Get permission levels for notebooks. Omit notebook or pass "all" to return every notebook; pass a specific notebook ID to return only that notebook.'),
    },
    {
        action: 'set_permission',
        schema: createActionSchema('set_permission', {
            notebook: { type: 'string', description: 'Notebook ID' },
            permission: {
                type: 'string',
                enum: ['none', 'r', 'rw', 'rwd'],
                description: 'Permission level: "none" blocks all access, "r" allows read only, "rw" allows read/write without delete, "rwd" allows read/write/delete (default)',
            },
        }, ['notebook', 'permission'], 'Set the permission level for a notebook.'),
    },
    {
        action: 'get_child_docs',
        schema: createActionSchema('get_child_docs', {
            notebook: { type: 'string', description: 'Notebook ID' },
            page: { type: 'number', description: 'Page number (1-based), default 1' },
            pageSize: { type: 'number', description: 'Rows per page, default 50' },
        }, ['notebook'], 'Get direct child documents at the notebook root. Returns a paginated { data, total, page, pageSize, pageCount, hasNextPage } payload.'),
    },
];

const notebookTool = defineTool<NotebookAction>({
    name: 'notebook',
    description: '📚 Grouped notebook operations.',
    variants: NOTEBOOK_VARIANTS,
    actionSchema: NotebookActionSchema,
    aggregateOptions: {
        guidance: NOTEBOOK_GUIDANCE,
        actionHints: NOTEBOOK_ACTION_HINTS,
    },
    handlers: NOTEBOOK_ACTION_HANDLERS,
});

export function listNotebookTools(config: CategoryToolConfig<NotebookAction>) {
    return notebookTool.listTools(config);
}

export function callNotebookTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<NotebookAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    return notebookTool.callTool(client, args, config, permMgr);
}

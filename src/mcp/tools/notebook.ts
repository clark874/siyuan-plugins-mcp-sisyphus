import type { SiYuanClient } from '../../api/client';
import * as notebookApi from '../../api/notebook';
import type { CategoryToolConfig, NotebookAction } from '../config';
import { NOTEBOOK_ACTION_HINTS, NOTEBOOK_GUIDANCE } from '../help';
import type { PermissionManager } from '../permissions';
import {
    NotebookActionSchema,
    NotebookCreateSchema,
    NotebookGetConfSchema,
    NotebookGetChildDocsSchema,
    NotebookGetPermissionsSchema,
    NotebookListSchema,
    NotebookSetOpenStateSchema,
    NotebookRemoveSchema,
    NotebookRenameSchema,
    NotebookSetConfSchema,
    NotebookSetIconSchema,
    NotebookSetPermissionSchema,
} from '../types';
import { ensurePermissionForNotebook, listChildDocumentsByPath } from './context';
import { buildAggregatedTool, createActionSchema, createDisabledActionResult, createErrorResult, createJsonResult, createSetIconReminder, tryHandleHelpAction, type ActionVariant, type ToolResult } from './shared';
import { applyUiRefresh } from './ui-refresh';

export const NOTEBOOK_TOOL_NAME = 'notebook';

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
        }, ['notebook'], 'Get direct child documents at the notebook root.'),
    },
];

export function listNotebookTools(config: CategoryToolConfig<NotebookAction>) {
    return buildAggregatedTool(
        NOTEBOOK_TOOL_NAME,
        '📚 Grouped notebook operations.',
        config,
        NOTEBOOK_VARIANTS,
        {
            guidance: NOTEBOOK_GUIDANCE,
            actionHints: NOTEBOOK_ACTION_HINTS,
        },
    );
}

function normalizeNotebookChildDocsError(error: unknown, notebookId: string, exists: boolean, closed: boolean): Error {
    const message = error instanceof Error ? error.message : String(error);

    if (!exists) {
        return new Error(`Failed to get child documents: notebook "${notebookId}" does not exist.`);
    }

    if (message.includes('permission')) {
        return new Error(`Failed to get child documents for notebook "${notebookId}": permission denied by SiYuan. ${message}`);
    }

    if (closed) {
        return new Error(`Failed to get child documents for notebook "${notebookId}": notebook is currently closed or still initializing. ${message}`);
    }

    return new Error(`Failed to get child documents for notebook "${notebookId}" at "/". ${message}`);
}

function isRetryableNotebookChildDocsError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /initializing|kernel still initializing|notebook is currently closed/i.test(message);
}

async function retryNotebookChildDocs(
    client: SiYuanClient,
    notebookId: string,
    retries: number,
    delayMs: number,
): Promise<{ children?: Awaited<ReturnType<typeof listChildDocumentsByPath>>; error?: unknown; attempts: number }> {
    let attempts = 0;

    while (attempts <= retries) {
        attempts += 1;
        try {
            const children = await listChildDocumentsByPath(client, notebookId, '/');
            return { children, attempts };
        } catch (error) {
            if (attempts > retries || !isRetryableNotebookChildDocsError(error)) {
                return { error, attempts };
            }
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }

    return { error: new Error(`Failed to get child documents for notebook "${notebookId}".`), attempts };
}

function createNotebookChildDocsStateErrorResult(notebookId: string, message: string, retryAttempts: number, retryWindowMs: number): ToolResult {
    return {
        content: [{
            type: 'text',
            text: JSON.stringify({
                error: {
                    type: 'internal_error',
                    tool: NOTEBOOK_TOOL_NAME,
                    action: 'get_child_docs',
                    message,
                    reason: 'notebook_closed_or_initializing',
                    retryable: true,
                    suggestedNextAction: 'open_notebook_or_retry',
                    notebook: notebookId,
                    retryAttempts,
                    retryWindowMs,
                    hint: 'This usually happens right after notebook(action="close"). Re-open the notebook first, or retry after a short wait.',
                },
            }, null, 2),
        }],
        isError: true,
    };
}

export async function callNotebookTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<NotebookAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    const rawArgs = args ?? {};
    const action = typeof rawArgs.action === 'string' ? rawArgs.action : undefined;

    const helpResult = tryHandleHelpAction(NOTEBOOK_TOOL_NAME, rawArgs, config, NOTEBOOK_VARIANTS);
    if (helpResult) return helpResult;

    try {
        const parsedAction = NotebookActionSchema.parse(rawArgs.action);
        if (!config.enabled || !config.actions[parsedAction]) {
            return createDisabledActionResult(NOTEBOOK_TOOL_NAME, parsedAction);
        }

        switch (parsedAction) {
            case 'list': {
                NotebookListSchema.parse(rawArgs);
                const result = await notebookApi.listNotebooks(client);
                return createJsonResult(result.notebooks);
            }
            case 'create': {
                const parsed = NotebookCreateSchema.parse(rawArgs);
                const result = await notebookApi.createNotebook(client, parsed.name);
                if (parsed.icon) {
                    await notebookApi.setNotebookIcon(client, result.notebook.id, parsed.icon);
                    result.notebook.icon = parsed.icon;
                }
                return applyUiRefresh(client, createJsonResult({
                    ...result.notebook,
                    iconHint: createSetIconReminder('notebook', Boolean(parsed.icon)),
                }), parsed.icon ? [{ type: 'reloadIcon' }] : [{ type: 'reloadFiletree' }]);
            }
            case 'set_open_state': {
                const parsed = NotebookSetOpenStateSchema.parse(rawArgs);
                const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'read');
                if (denied) return denied;
                if (parsed.opened) {
                    await notebookApi.openNotebook(client, parsed.notebook);
                } else {
                    await notebookApi.closeNotebook(client, parsed.notebook);
                }
                return applyUiRefresh(client, createJsonResult({ success: true, notebook: parsed.notebook, opened: parsed.opened }), [{ type: 'reloadFiletree' }]);
            }
            case 'remove': {
                const parsed = NotebookRemoveSchema.parse(rawArgs);
                const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'delete');
                if (denied) return denied;
                await notebookApi.removeNotebook(client, parsed.notebook);
                return applyUiRefresh(client, createJsonResult({ success: true, notebook: parsed.notebook }), [{ type: 'reloadFiletree' }]);
            }
            case 'rename': {
                const parsed = NotebookRenameSchema.parse(rawArgs);
                const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'write');
                if (denied) return denied;
                await notebookApi.renameNotebook(client, parsed.notebook, parsed.name);
                return applyUiRefresh(client, createJsonResult({ success: true, notebook: parsed.notebook, name: parsed.name }), [{ type: 'reloadFiletree' }]);
            }
            case 'get_conf': {
                const parsed = NotebookGetConfSchema.parse(rawArgs);
                const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'read');
                if (denied) return denied;
                const result = await notebookApi.getNotebookConf(client, parsed.notebook);
                return createJsonResult(result);
            }
            case 'set_conf': {
                const parsed = NotebookSetConfSchema.parse(rawArgs);
                const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'write');
                if (denied) return denied;
                const result = await notebookApi.setNotebookConf(client, parsed.notebook, parsed.conf);
                return applyUiRefresh(client, createJsonResult(result), [{ type: 'reloadFiletree' }]);
            }
            case 'set_icon': {
                const parsed = NotebookSetIconSchema.parse(rawArgs);
                const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'write');
                if (denied) return denied;
                await notebookApi.setNotebookIcon(client, parsed.notebook, parsed.icon);
                return applyUiRefresh(client, createJsonResult({ success: true, notebook: parsed.notebook, icon: parsed.icon }), [{ type: 'reloadIcon' }]);
            }
            case 'get_permissions': {
                const parsed = NotebookGetPermissionsSchema.parse(rawArgs);
                await permMgr.reload();
                const listResult = await notebookApi.listNotebooks(client);
                const notebooks = listResult.notebooks.map(nb => ({
                    id: nb.id,
                    name: nb.name,
                    permission: permMgr.get(nb.id),
                }));
                if (!parsed.notebook || parsed.notebook === 'all') {
                    return createJsonResult({ notebooks });
                }

                const notebook = notebooks.find((entry) => entry.id === parsed.notebook);
                if (!notebook) {
                    return createErrorResult(
                        new Error(`Notebook "${parsed.notebook}" not found.`),
                        { tool: NOTEBOOK_TOOL_NAME, action: 'get_permissions', rawArgs },
                    );
                }

                return createJsonResult({ notebook });
            }
            case 'set_permission': {
                const parsed = NotebookSetPermissionSchema.parse(rawArgs);
                await permMgr.set(parsed.notebook, parsed.permission);
                return applyUiRefresh(client, createJsonResult({ success: true, notebook: parsed.notebook, permission: parsed.permission }), [{ type: 'reloadFiletree' }]);
            }
            case 'get_child_docs': {
                const parsed = NotebookGetChildDocsSchema.parse(rawArgs);
                const retryCount = 2;
                const retryDelayMs = 150;
                const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'read');
                if (denied) {
                    return denied;
                }
                const notebookList = await notebookApi.listNotebooks(client);
                const notebook = notebookList.notebooks.find((item) => item.id === parsed.notebook);

                if (!notebook) {
                    throw normalizeNotebookChildDocsError(new Error('Notebook not found in lsNotebooks result.'), parsed.notebook, false, false);
                }

                const retryResult = await retryNotebookChildDocs(client, parsed.notebook, retryCount, retryDelayMs);
                if (retryResult.error) {
                    const normalized = normalizeNotebookChildDocsError(retryResult.error, parsed.notebook, true, Boolean(notebook.closed));
                    if (notebook.closed) {
                        return createNotebookChildDocsStateErrorResult(parsed.notebook, normalized.message, retryResult.attempts, retryCount * retryDelayMs);
                    }
                    throw normalized;
                }
                return createJsonResult(retryResult.children ?? []);
            }
            default: {
                const _exhaustive: never = parsedAction;
                return createErrorResult(new Error(`Unknown action: ${_exhaustive}`), { tool: NOTEBOOK_TOOL_NAME, action, rawArgs });
            }
        }
    } catch (error) {
        return createErrorResult(error, { tool: NOTEBOOK_TOOL_NAME, action, rawArgs });
    }
}

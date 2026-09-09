import type { SiYuanClient } from '../../api/client';
import * as notebookApi from '../../api/notebook';
import type { NotebookAction } from '../../core/config';
import type { PermissionManager } from '../../core/permissions';
import {
    NotebookGetConfSchema,
    NotebookGetChildDocsSchema,
    NotebookGetPermissionsSchema,
    NotebookListSchema,
} from '../../core/types';
import { ensurePermissionForNotebook, listChildDocumentsByPath } from '../internal/context';
import type { ToolActionHandler } from '../internal/define-tool';
import { createErrorResult, createJsonResult, createPaginatedResult, paginate, type ToolResult } from '../internal/shared';

export const NOTEBOOK_TOOL_NAME = 'notebook';

type NotebookActionHandler = ToolActionHandler;

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

const handleList: NotebookActionHandler = async ({ client, rawArgs }) => {
    NotebookListSchema.parse(rawArgs);
    const result = await notebookApi.listNotebooks(client);
    return createJsonResult(result.notebooks);
};

const handleGetConf: NotebookActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = NotebookGetConfSchema.parse(rawArgs);
    const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'read');
    if (denied) return denied;
    const result = await notebookApi.getNotebookConf(client, parsed.notebook);
    return createJsonResult(result);
};

const handleGetPermissions: NotebookActionHandler = async ({ client, permMgr, rawArgs }) => {
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
};

const handleGetChildDocs: NotebookActionHandler = async ({ client, permMgr, rawArgs }) => {
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
    const docs = retryResult.children ?? [];
    const paged = paginate(docs, parsed.page ?? 1, parsed.pageSize ?? 50);
    return createPaginatedResult(paged.items, paged, { notebook: parsed.notebook });
};

export const NOTEBOOK_ACTION_HANDLERS: Record<NotebookAction, NotebookActionHandler> = {
    list: handleList,
    get_conf: handleGetConf,
    get_permissions: handleGetPermissions,
    get_child_docs: handleGetChildDocs,
};

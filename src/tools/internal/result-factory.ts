import { ZodError } from 'zod';

import { getActionHint } from '../../core/help';
import { translateError } from './errorTranslation';
import type { PaginatedPayload, ToolErrorContext, ToolResult } from './types';
import { formatZodIssues, getValidationMessage, includeDebugDetails, isApiError, readSemanticErrorCode, resolveHint } from './validation';

export function toErrorText(payload: Record<string, unknown>, isError = true): ToolResult {
    return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        isError,
    };
}

export function createJsonResult(value: unknown): ToolResult {
    return {
        content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    };
}

/**
 * Build the standard `{ data, total, page, pageSize, pageCount, hasNextPage }` shape
 * used by every list-style action. `extras` are merged at the top level (e.g. avID,
 * notebook, warnings). Pass a `PaginationResult` from `paginate()` or hand-rolled values.
 */
export function createPaginatedResult<T>(
    data: T[],
    pagination: { total: number; page: number; pageSize: number; pageCount: number; hasNextPage?: boolean },
    extras?: Record<string, unknown>,
): ToolResult {
    const payload: PaginatedPayload<T> & Record<string, unknown> = {
        data,
        total: pagination.total,
        page: pagination.page,
        pageSize: pagination.pageSize,
        pageCount: pagination.pageCount,
        hasNextPage: pagination.hasNextPage ?? (pagination.page < pagination.pageCount),
        ...(extras ?? {}),
    };
    return createJsonResult(payload);
}

export function createSetIconReminder(
    target: 'document' | 'notebook',
    alreadySet = false,
): string {
    if (target === 'notebook') {
        return alreadySet
            ? 'Use notebook(action="set_icon") later if you want to change the notebook icon. Prefer a Unicode hex code string like "1f4d4" instead of a raw emoji character.'
            : 'After creation, call notebook(action="set_icon") to set the notebook icon. Prefer a Unicode hex code string like "1f4d4" instead of a raw emoji character.';
    }

    return alreadySet
        ? 'Use document(action="set_icon") later if you want to change the document icon. Prefer a Unicode hex code string like "1f4d4" instead of a raw emoji character.'
        : 'After creation, call document(action="set_icon") to set the document icon. Prefer a Unicode hex code string like "1f4d4" instead of a raw emoji character.';
}

export function createWriteSuccessResult(
    context: Record<string, unknown>,
    rawResult?: unknown,
): ToolResult {
    if (rawResult && typeof rawResult === 'object' && !Array.isArray(rawResult)) {
        return createJsonResult({ success: true, ...(rawResult as Record<string, unknown>), ...context });
    }

    return createJsonResult({ success: true, ...context });
}

export function createErrorResult(error: unknown, context?: ToolErrorContext): ToolResult {
    if (error instanceof ZodError) {
        const fields = formatZodIssues(error, context?.rawArgs);
        const payload: Record<string, unknown> = {
            error: {
                type: 'validation_error',
                message: getValidationMessage(context?.tool, context?.action),
                ...(context?.tool ? { tool: context.tool } : {}),
                ...(context?.action ? { action: context.action } : {}),
                ...(fields.length > 0 ? { fields } : {}),
                ...(resolveHint(context) ? { hint: resolveHint(context) } : {}),
            },
        };
        return toErrorText(payload);
    }

    const normalizedError = error instanceof Error ? error : new Error(String(error));
    const translation = translateError(normalizedError);
    const contextHint = resolveHint(context);
    const combinedHint = translation && contextHint
        ? `${translation.hint} ${contextHint}`
        : (translation?.hint ?? contextHint);

    const semanticCode = readSemanticErrorCode(normalizedError);
    const payload: Record<string, unknown> = {
        error: {
            type: semanticCode ?? (isApiError(normalizedError) ? 'api_error' : 'internal_error'),
            ...(translation ? { code: translation.code } : {}),
            message: normalizedError.message,
            ...(context?.tool ? { tool: context.tool } : {}),
            ...(context?.action ? { action: context.action } : {}),
            ...(combinedHint ? { hint: combinedHint } : {}),
            ...(includeDebugDetails() && normalizedError.stack ? { details: normalizedError.stack } : {}),
        },
    };

    return toErrorText(payload);
}

export function createPermissionDeniedResult(notebookId: string, currentPerm: string, required: 'read' | 'write' | 'delete'): ToolResult {
    return toErrorText({
        error: {
            type: 'permission_denied',
            message: `Notebook "${notebookId}" has permission "${currentPerm}", ${required} access is required. Use notebook(action="set_permission") to change.`,
            notebook: notebookId,
            current_permission: currentPerm,
            required_permission: required,
        },
    });
}

export function createDisabledActionResult(name: string, action: string): ToolResult {
    return toErrorText({
        error: {
            type: 'action_disabled',
            message: `Action "${action}" is disabled for tool "${name}".`,
            tool: name,
            action,
            hint: 'Enable the action in Settings -> Plugins -> SiYuan MCP sisyphus, or call listTools() again to inspect the currently enabled actions.',
        },
    });
}


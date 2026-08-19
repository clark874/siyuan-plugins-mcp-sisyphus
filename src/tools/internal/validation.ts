import { ZodError, type ZodIssue } from 'zod';

import { getActionHint } from '../../core/help';
import { translateError, type ErrorTranslation } from './errorTranslation';
import type { ToolErrorContext, ToolFieldError } from './types';

export function formatIssuePath(path: PropertyKey[]): string {
    return path
        .map((segment) => typeof segment === 'number' ? `[${segment}]` : String(segment))
        .join('.')
        .replace(/\.\[/g, '[');
}

export function getValueAtPath(value: unknown, path: PropertyKey[]): unknown {
    let current = value;
    for (const segment of path) {
        if (current === null || current === undefined) return undefined;
        if (typeof segment === 'number') {
            if (!Array.isArray(current)) return undefined;
            current = current[segment];
            continue;
        }
        if (typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[String(segment)];
    }
    return current;
}

export function formatIssueMessage(issue: ZodIssue, rawArgs?: Record<string, unknown>): string {
    const path = formatIssuePath(issue.path);
    const valueAtPath = path ? getValueAtPath(rawArgs, issue.path) : undefined;

    if (issue.code === 'invalid_type') {
        if (valueAtPath === undefined && path) {
            return `${path} is required.`;
        }
        return path ? `${path} has an invalid type.` : 'Invalid input type.';
    }

    if (issue.code === 'unrecognized_keys' && 'keys' in issue && Array.isArray(issue.keys)) {
        return `Unexpected field(s): ${issue.keys.join(', ')}.`;
    }

    if (issue.message && issue.message !== 'Invalid input') {
        return issue.message;
    }

    return path ? `Invalid value for ${path}.` : 'Invalid input.';
}

export function formatZodIssues(error: ZodError, rawArgs?: Record<string, unknown>): ToolFieldError[] {
    return error.issues.map((issue) => ({
        path: formatIssuePath(issue.path),
        message: formatIssueMessage(issue, rawArgs),
    }));
}

export function getValidationMessage(tool?: string, action?: string): string {
    if (tool && action) return `Invalid arguments for ${tool}(action="${action}").`;
    if (tool) return `Invalid arguments for tool "${tool}".`;
    return 'Invalid arguments.';
}

export function resolveHint(context?: ToolErrorContext): string | undefined {
    return context?.hint ?? getActionHint(context?.tool, context?.action);
}

export function isApiError(error: Error): boolean {
    return error.name === 'SiYuanError'
        || error.message.startsWith('SiYuan API error:')
        || error.message.startsWith('HTTP error:')
        || error.message.startsWith('Request timeout');
}

/**
 * Path resolution helpers throw plain `Error` objects carrying a `code` such as
 * `not_found`. Without this lookup the generic catch in `defineTool` reports
 * every one of them as `internal_error`, which hides an agent-correctable
 * mistake behind a backend-failure label.
 */
const SEMANTIC_ERROR_CODES: ReadonlySet<string> = new Set([
    'not_found',
    'ambiguous_path',
    'invalid_path',
]);

/**
 * Kernel rejections that are really agent-correctable path mistakes.
 *
 * The kernel reports them as generic `-1` failures, so without this mapping
 * they surface as `api_error`: a type that is (correctly) excluded from soft
 * error reporting, which makes strict clients resend their whole tool
 * catalogue after what is only a bad path argument.
 */
const KERNEL_PATH_REJECTION_PATTERNS: RegExp[] = [
    /path escapes notebook directory/i,
    /invalid path/i,
];

function isKernelPathRejection(error: Error): boolean {
    const message = error.message ?? '';
    if (!isApiError(error)) return false;
    return KERNEL_PATH_REJECTION_PATTERNS.some((pattern) => pattern.test(message));
}

export function readSemanticErrorCode(error: Error): string | null {
    const code = (error as Error & { code?: unknown }).code;
    if (typeof code === 'string' && SEMANTIC_ERROR_CODES.has(code)) return code;
    if (isKernelPathRejection(error)) return 'invalid_path';
    if (!isApiError(error)) return null;

    const translation = translateError(error);
    return readTranslatedErrorType(translation);
}

const TRANSLATED_NOT_FOUND_CODES: ReadonlySet<ErrorTranslation['code']> = new Set([
    'block_not_found',
    'document_not_found',
    'notebook_not_found',
    'av_not_found',
]);

export function readTranslatedErrorType(translation: ErrorTranslation | null): string | null {
    if (!translation) return null;
    if (TRANSLATED_NOT_FOUND_CODES.has(translation.code)) return 'not_found';
    if (translation.code === 'permission_denied') return 'permission_denied';
    return null;
}

export function includeDebugDetails(): boolean {
    return process.env.SIYUAN_MCP_DEBUG_ERRORS === '1';
}

import { stringifyToolJson } from '@/tools/internal/json-serialization';

/**
 * Structural shape shared by the internal handler result and the projected
 * MCP `CallToolResult`. Keeping this local avoids coupling the boundary helper
 * to either concrete type, since only these three fields matter here.
 */
interface SoftenableResult {
    content?: unknown;
    isError?: boolean;
    structuredContent?: unknown;
}

/**
 * Failures the calling agent can fix on its own by changing the arguments of
 * the next call. Re-sending the server tool catalogue teaches it nothing that
 * the already-loaded catalogue does not say, so these are the only types that
 * may be downgraded to a non-error result.
 *
 * Deliberately excluded:
 * - `permission_denied` needs a human to change notebook permissions.
 * - `internal_error` / `api_error` signal a real backend failure.
 * - write-safety codes such as `state_changed` signal a lost write race and
 *   must stay loud so clients do not treat a skipped write as applied.
 */
export const RECOVERABLE_TOOL_ERROR_TYPES: ReadonlySet<string> = new Set([
    'validation_error',
    'invalid_arguments',
    'not_found',
    'ambiguous_path',
    'invalid_path',
    'action_disabled',
]);

export const SOFT_ERROR_MARKER = 'softened';

function parsePayload(result: SoftenableResult): Record<string, unknown> | null {
    if (result.structuredContent && typeof result.structuredContent === 'object' && !Array.isArray(result.structuredContent)) {
        return result.structuredContent as Record<string, unknown>;
    }
    const text = Array.isArray(result.content)
        ? (result.content as Array<Record<string, unknown>>)
            .find((item) => item !== null && typeof item === 'object' && item.type === 'text')?.text
        : undefined;
    if (typeof text !== 'string') return null;
    try {
        const parsed: unknown = JSON.parse(text);
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : null;
    } catch {
        return null;
    }
}

export function readToolErrorType(result: SoftenableResult): string | null {
    const payload = parsePayload(result);
    if (!payload) return null;
    const error = payload.error;
    if (error === null || typeof error !== 'object' || Array.isArray(error)) return null;
    const type = (error as Record<string, unknown>).type;
    return typeof type === 'string' ? type : null;
}

export function isRecoverableToolError(result: SoftenableResult): boolean {
    if (!result.isError) return false;
    const type = readToolErrorType(result);
    return type !== null && RECOVERABLE_TOOL_ERROR_TYPES.has(type);
}

/**
 * Clear `isError` for agent-correctable failures when the workspace opted in.
 * The `error` payload is left intact and flagged with `softened: true` so the
 * caller can still tell that nothing was executed.
 *
 * Apply this only at the outermost MCP response boundary. Internal consumers
 * such as the write-safety coordinator and the MCP App bridge branch on
 * `isError` and must keep seeing the original result.
 */
export function softenRecoverableToolError<T extends SoftenableResult>(result: T, enabled: boolean): T {
    if (!enabled || !isRecoverableToolError(result)) return result;

    const { isError: _dropped, ...rest } = result;
    const softened = rest as Record<string, unknown>;

    const payload = parsePayload(result);
    if (payload && typeof payload.error === 'object' && payload.error !== null && !Array.isArray(payload.error)) {
        const markedPayload = {
            ...payload,
            error: { ...(payload.error as Record<string, unknown>), [SOFT_ERROR_MARKER]: true },
        };
        softened.content = [{ type: 'text', text: stringifyToolJson(markedPayload) }];
        if (result.structuredContent) {
            softened.structuredContent = markedPayload;
        }
    }

    return softened as T;
}

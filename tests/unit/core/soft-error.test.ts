import { describe, expect, it } from 'vitest';

import { buildDefaultToolConfig, normalizeToolConfig } from '@/core/config';
import {
    RECOVERABLE_TOOL_ERROR_TYPES,
    SOFT_ERROR_MARKER,
    isRecoverableToolError,
    readToolErrorType,
    softenRecoverableToolError,
} from '@/core/soft-error';

function errorResult(type: string, extra: Record<string, unknown> = {}) {
    const payload = { error: { type, message: `${type} happened`, ...extra } };
    return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
        isError: true,
    };
}

function parseText(result: { content?: unknown }): Record<string, any> {
    const text = (result.content as Array<{ type: string; text: string }>)
        .find((item) => item.type === 'text')!.text;
    return JSON.parse(text);
}

describe('errorReporting config', () => {
    it('defaults to off so spec-compliant clients keep seeing isError', () => {
        expect(buildDefaultToolConfig().errorReporting.softRecoverableErrors).toBe(false);
    });

    it('reads the opt-in from persisted config', () => {
        const config = normalizeToolConfig({ errorReporting: { softRecoverableErrors: true } });
        expect(config.errorReporting.softRecoverableErrors).toBe(true);
    });

    it('ignores non-boolean persisted values', () => {
        const config = normalizeToolConfig({ errorReporting: { softRecoverableErrors: 'yes' } });
        expect(config.errorReporting.softRecoverableErrors).toBe(false);
    });
});

describe('readToolErrorType', () => {
    it('reads the type from the text payload', () => {
        expect(readToolErrorType(errorResult('not_found'))).toBe('not_found');
    });

    it('prefers structuredContent when present', () => {
        const result = {
            content: [{ type: 'text' as const, text: '{"error":{"type":"not_found"}}' }],
            structuredContent: { error: { type: 'validation_error' } },
            isError: true,
        };
        expect(readToolErrorType(result)).toBe('validation_error');
    });

    it('returns null for non-JSON and untyped payloads', () => {
        expect(readToolErrorType({ content: [{ type: 'text', text: 'boom' }], isError: true })).toBeNull();
        expect(readToolErrorType({ content: [{ type: 'text', text: '{"ok":true}' }] })).toBeNull();
    });
});

describe('isRecoverableToolError', () => {
    it('only classifies failures the agent can fix by changing arguments', () => {
        for (const type of RECOVERABLE_TOOL_ERROR_TYPES) {
            expect(isRecoverableToolError(errorResult(type))).toBe(true);
        }
        for (const type of ['permission_denied', 'internal_error', 'api_error', 'state_changed', 'readback_mismatch', 'outcome_unknown', 'write_safety_error']) {
            expect(isRecoverableToolError(errorResult(type))).toBe(false);
        }
    });

    it('never classifies a successful result as an error', () => {
        expect(isRecoverableToolError({ content: [{ type: 'text', text: '{"error":{"type":"not_found"}}' }] })).toBe(false);
    });
});

describe('softenRecoverableToolError', () => {
    it('is a no-op while the opt-in is disabled', () => {
        const result = errorResult('validation_error');
        expect(softenRecoverableToolError(result, false)).toBe(result);
    });

    it('drops isError and marks the payload for recoverable failures', () => {
        const softened = softenRecoverableToolError(errorResult('not_found'), true);
        expect('isError' in softened).toBe(false);
        const payload = parseText(softened);
        expect(payload.error.type).toBe('not_found');
        expect(payload.error.message).toBe('not_found happened');
        expect(payload.error[SOFT_ERROR_MARKER]).toBe(true);
    });

    it('keeps isError for permission, backend, and write-conflict failures', () => {
        for (const type of ['permission_denied', 'internal_error', 'state_changed', 'readback_mismatch', 'outcome_unknown', 'write_safety_error']) {
            expect(softenRecoverableToolError(errorResult(type), true).isError).toBe(true);
        }
    });

    it('marks structuredContent in step with the text payload', () => {
        const softened = softenRecoverableToolError({
            content: [{ type: 'text' as const, text: '{"error":{"type":"validation_error"}}' }],
            structuredContent: { error: { type: 'validation_error' } },
            isError: true,
        }, true);
        expect('isError' in softened).toBe(false);
        expect((softened.structuredContent as any).error[SOFT_ERROR_MARKER]).toBe(true);
        expect(parseText(softened).error[SOFT_ERROR_MARKER]).toBe(true);
    });

    it('preserves other diagnostic fields such as hint and fields', () => {
        const softened = softenRecoverableToolError(
            errorResult('validation_error', { hint: 'use hpath', fields: [{ path: 'include[2]' }] }),
            true,
        );
        const payload = parseText(softened);
        expect(payload.error.hint).toBe('use hpath');
        expect(payload.error.fields).toEqual([{ path: 'include[2]' }]);
    });

    it('leaves an untyped error payload untouched', () => {
        const result = { content: [{ type: 'text' as const, text: 'unparseable' }], isError: true };
        expect(softenRecoverableToolError(result, true)).toBe(result);
    });
});

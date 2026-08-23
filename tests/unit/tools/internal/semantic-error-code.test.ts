import { describe, expect, it } from 'vitest';

import { createErrorResult } from '@/tools/internal/shared';
import { createErrorResult as createErrorResultFromFactory } from '@/tools/internal/result-factory';
import { readSemanticErrorCode } from '@/tools/internal/validation';
import { SiYuanError } from '@/shared/error';
import { RECOVERABLE_TOOL_ERROR_TYPES, softenRecoverableToolError } from '@/core/soft-error';

function codedError(code: string, message: string): Error {
    const error = new Error(message);
    Object.assign(error, { code });
    return error;
}

function errorType(result: { content: Array<{ text: string }> }): string {
    return JSON.parse(result.content[0].text).error.type;
}

describe('readSemanticErrorCode', () => {
    it('recognises semantic codes thrown by local helpers', () => {
        expect(readSemanticErrorCode(codedError('not_found', 'x'))).toBe('not_found');
        expect(readSemanticErrorCode(codedError('ambiguous_path', 'x'))).toBe('ambiguous_path');
        expect(readSemanticErrorCode(codedError('invalid_path', 'x'))).toBe('invalid_path');
        expect(readSemanticErrorCode(codedError('invalid_arguments', 'x'))).toBe('invalid_arguments');
        expect(readSemanticErrorCode(codedError('permission_denied', 'x'))).toBe('permission_denied');
    });

    it('ignores unrelated and non-string codes', () => {
        expect(readSemanticErrorCode(codedError('ECONNREFUSED', 'x'))).toBeNull();
        expect(readSemanticErrorCode(Object.assign(new Error('x'), { code: 404 }))).toBeNull();
        expect(readSemanticErrorCode(new Error('x'))).toBeNull();
    });

    // The kernel reports bad paths as a generic -1 failure. Left as api_error
    // they escape soft error reporting, so every bad path argument costs a
    // full tool-catalogue resend on strict clients.
    it('recognises kernel path rejections as invalid_path', () => {
        expect(readSemanticErrorCode(new SiYuanError(-1, 'path escapes notebook directory'))).toBe('invalid_path');
        expect(readSemanticErrorCode(new SiYuanError(1, 'Invalid path'))).toBe('invalid_path');
    });

    it.each([
        ['block_not_found', new SiYuanError(-1, '未找到 ID 为 [missing] 的内容块')],
        ['document_not_found', new SiYuanError(1, 'tree not found')],
        ['notebook_not_found', new SiYuanError(-1, 'notebook [missing] not found')],
        ['av_not_found', new SiYuanError(-1, 'attribute view "missing" not found')],
    ])('maps translated resource absence %s to the recoverable not_found type', (_code, error) => {
        expect(readSemanticErrorCode(error)).toBe('not_found');
    });

    it('maps translated permission failures to their hard semantic type', () => {
        expect(readSemanticErrorCode(new SiYuanError(-1, 'permission denied'))).toBe('permission_denied');
        expect(RECOVERABLE_TOOL_ERROR_TYPES.has('permission_denied')).toBe(false);
    });

    it('does not reclassify other kernel failures as path problems', () => {
        expect(readSemanticErrorCode(new SiYuanError(-1, 'kernel busy'))).toBeNull();
        // Only kernel-originated failures may be reclassified; a plain Error
        // carrying similar prose is not an API failure at all.
        expect(readSemanticErrorCode(new Error('path escapes notebook directory'))).toBeNull();
        expect(readSemanticErrorCode(new Error('block not found in local cache'))).toBeNull();
        expect(readSemanticErrorCode(new SiYuanError(-1, 'invalid id format for block operation'))).toBeNull();
    });
});

// A missing fs path used to surface as internal_error, which both mislabels an
// agent-correctable mistake and blocks it from being softened.
describe.each([
    ['shared', createErrorResult],
    ['result-factory', createErrorResultFromFactory],
])('createErrorResult (%s)', (_name, build) => {
    it('reports fs path failures with their real type', () => {
        const result = build(codedError('not_found', 'No document found at "/Notebook/Missing".'));
        expect(errorType(result as any)).toBe('not_found');
    });

    it('still reports uncoded failures as internal_error', () => {
        expect(errorType(build(new Error('boom')) as any)).toBe('internal_error');
    });

    it('still reports SiYuan API failures as api_error', () => {
        const apiError = new Error('SiYuan API error: -1 kernel busy');
        expect(errorType(build(apiError) as any)).toBe('api_error');
    });

    it('reports kernel path rejections as invalid_path so they can be softened', () => {
        const rejection = new SiYuanError(-1, 'path escapes notebook directory');
        expect(errorType(build(rejection) as any)).toBe('invalid_path');
        expect(RECOVERABLE_TOOL_ERROR_TYPES.has(errorType(build(rejection) as any))).toBe(true);
    });

    it.each([
        ['block_not_found', new SiYuanError(-1, '未找到 ID 为 [missing] 的内容块')],
        ['document_not_found', new SiYuanError(1, 'tree not found')],
        ['notebook_not_found', new SiYuanError(-1, 'notebook [missing] not found')],
        ['av_not_found', new SiYuanError(-1, 'attribute view "missing" not found')],
    ])('reports %s as not_found while preserving the detailed code', (code, error) => {
        const result = build(error) as any;
        const payload = JSON.parse(result.content[0].text);
        expect(payload.error.type).toBe('not_found');
        expect(payload.error.code).toBe(code);
        expect(RECOVERABLE_TOOL_ERROR_TYPES.has(payload.error.type)).toBe(true);
    });

    it('keeps translated permission failures loud and correctly typed', () => {
        const result = build(new SiYuanError(-1, 'permission denied')) as any;
        const payload = JSON.parse(result.content[0].text);
        expect(payload.error.type).toBe('permission_denied');
        expect(payload.error.code).toBe('permission_denied');
        expect(softenRecoverableToolError(result, true).isError).toBe(true);
    });

    it('allows translated missing resources through the opt-in soft-error boundary', () => {
        const result = build(new SiYuanError(-1, '未找到 ID 为 [missing] 的内容块')) as any;
        const softened = softenRecoverableToolError(result, true) as any;
        expect('isError' in softened).toBe(false);
        expect(JSON.parse(softened.content[0].text).error).toMatchObject({
            type: 'not_found',
            code: 'block_not_found',
            softened: true,
        });
    });

    it('preserves bounded project suggestions across the normal and softened error boundary', () => {
        const error = Object.assign(new Error('missing project'), {
            code: 'not_found',
            detailCode: 'project_source_not_registered',
            suggestions: ['water-commodification-dual-transition'],
        });
        const result = build(error) as any;
        expect(JSON.parse(result.content[0].text).error).toMatchObject({
            type: 'not_found',
            code: 'project_source_not_registered',
            suggestions: ['water-commodification-dual-transition'],
        });

        const softened = softenRecoverableToolError(result, true) as any;
        expect('isError' in softened).toBe(false);
        expect(JSON.parse(softened.content[0].text).error).toMatchObject({
            type: 'not_found',
            code: 'project_source_not_registered',
            suggestions: ['water-commodification-dual-transition'],
            softened: true,
        });
    });
});

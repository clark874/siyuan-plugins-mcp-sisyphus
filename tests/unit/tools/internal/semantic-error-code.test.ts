import { describe, expect, it } from 'vitest';

import { createErrorResult } from '@/tools/internal/shared';
import { createErrorResult as createErrorResultFromFactory } from '@/tools/internal/result-factory';
import { readSemanticErrorCode } from '@/tools/internal/validation';

function codedError(code: string, message: string): Error {
    const error = new Error(message);
    Object.assign(error, { code });
    return error;
}

function errorType(result: { content: Array<{ text: string }> }): string {
    return JSON.parse(result.content[0].text).error.type;
}

describe('readSemanticErrorCode', () => {
    it('recognises the path resolution codes thrown by fs helpers', () => {
        expect(readSemanticErrorCode(codedError('not_found', 'x'))).toBe('not_found');
        expect(readSemanticErrorCode(codedError('ambiguous_path', 'x'))).toBe('ambiguous_path');
        expect(readSemanticErrorCode(codedError('invalid_path', 'x'))).toBe('invalid_path');
    });

    it('ignores unrelated and non-string codes', () => {
        expect(readSemanticErrorCode(codedError('ECONNREFUSED', 'x'))).toBeNull();
        expect(readSemanticErrorCode(Object.assign(new Error('x'), { code: 404 }))).toBeNull();
        expect(readSemanticErrorCode(new Error('x'))).toBeNull();
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
});

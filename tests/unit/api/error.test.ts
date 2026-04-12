import { describe, it, expect } from 'vitest';
import {
    SiYuanError,
    errorCodeMap,
    createError,
    createErrorFromCode,
    getErrorDescription,
} from '@/libs/error';

describe('SiYuanError', () => {
    it('should create error with correct properties', () => {
        const error = new SiYuanError(1, 'Invalid parameter');

        expect(error.name).toBe('SiYuanError');
        expect(error.code).toBe(1);
        expect(error.msg).toBe('Invalid parameter');
        expect(error.message).toBe('SiYuan API error: 1 - Invalid parameter');
    });

    it('should be instanceof Error', () => {
        const error = new SiYuanError(0, 'Success');
        expect(error).toBeInstanceOf(Error);
    });

    it('should be instanceof SiYuanError', () => {
        const error = new SiYuanError(0, 'Success');
        expect(error).toBeInstanceOf(SiYuanError);
    });

    it('should work with negative error codes', () => {
        const error = new SiYuanError(-1, 'Unknown error');
        expect(error.code).toBe(-1);
        expect(error.message).toBe('SiYuan API error: -1 - Unknown error');
    });
});

describe('errorCodeMap', () => {
    it('should contain all expected error codes', () => {
        expect(errorCodeMap[0]).toBe('Success');
        expect(errorCodeMap[1]).toBe('Invalid parameter');
        expect(errorCodeMap[2]).toBe('Unsupported operation');
        expect(errorCodeMap[3]).toBe('Data not found');
        expect(errorCodeMap[4]).toBe('Permission denied');
        expect(errorCodeMap[5]).toBe('Data conflict');
        expect(errorCodeMap[-1]).toBe('Unknown error');
    });

    it('should have at least 20 error codes defined', () => {
        const codeCount = Object.keys(errorCodeMap).length;
        expect(codeCount).toBeGreaterThanOrEqual(20);
    });
});

describe('createError', () => {
    it('should return undefined for success response (code: 0)', () => {
        const response = { code: 0, msg: 'Success', data: {} };
        const error = createError(response);
        expect(error).toBeUndefined();
    });

    it('should return SiYuanError for error response', () => {
        const response = { code: 3, msg: 'Data not found', data: null };
        const error = createError(response);

        expect(error).toBeInstanceOf(SiYuanError);
        expect(error?.code).toBe(3);
        expect(error?.msg).toBe('Data not found');
    });

    it('should handle negative error codes', () => {
        const response = { code: -1, msg: 'Unknown error', data: null };
        const error = createError(response);

        expect(error).toBeInstanceOf(SiYuanError);
        expect(error?.code).toBe(-1);
    });
});

describe('createErrorFromCode', () => {
    it('should create error from code and message', () => {
        const error = createErrorFromCode(4, 'Permission denied');

        expect(error).toBeInstanceOf(SiYuanError);
        expect(error.code).toBe(4);
        expect(error.msg).toBe('Permission denied');
    });

    it('should work with any error code', () => {
        const error = createErrorFromCode(999, 'Custom error');

        expect(error.code).toBe(999);
        expect(error.msg).toBe('Custom error');
    });
});

describe('getErrorDescription', () => {
    it('should return description for known error codes', () => {
        expect(getErrorDescription(0)).toBe('Success');
        expect(getErrorDescription(1)).toBe('Invalid parameter');
        expect(getErrorDescription(10)).toBe('Timeout');
    });

    it('should return "Unknown error" for unknown codes', () => {
        expect(getErrorDescription(999)).toBe('Unknown error');
        expect(getErrorDescription(-999)).toBe('Unknown error');
    });

    it('should return "Unknown error" for code -1', () => {
        expect(getErrorDescription(-1)).toBe('Unknown error');
    });
});

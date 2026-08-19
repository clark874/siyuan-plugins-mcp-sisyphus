import { describe, it, expect } from 'vitest';
import { translateError, isMissingBlockError } from '@/tools/internal/errorTranslation';
import { createErrorResult } from '@/tools/internal/shared';

describe('translateError', () => {
    it('maps missing-block kernel messages to block_not_found', () => {
        const translated = translateError(new Error('SiYuan API error: -1 - 未找到 ID 为 [xxx] 的内容块'));
        expect(translated?.code).toBe('block_not_found');
        expect(translated?.hint).toMatch(/block\(action="info"/);
    });

    it('maps filetree missing-document messages without depending on the kernel numeric code', () => {
        expect(translateError(new Error('SiYuan API error: 1 - tree not found'))?.code).toBe('document_not_found');
        expect(translateError(new Error('SiYuan API error: -1 - tree not found'))?.code).toBe('document_not_found');
    });

    it('does not mistake unrelated invalid-ID failures for a missing block', () => {
        expect(translateError(new Error('SiYuan API error: -1 - invalid id format for block operation'))).toBeNull();
    });

    it('maps notebook initialization errors to notebook_closed', () => {
        const translated = translateError(new Error('notebook is currently closed'));
        expect(translated?.code).toBe('notebook_closed');
    });

    it('maps transport errors to kernel_unreachable', () => {
        const translated = translateError(new Error('HTTP error: fetch failed'));
        expect(translated?.code).toBe('kernel_unreachable');
    });

    it('returns null for unrecognised errors', () => {
        expect(translateError(new Error('some random failure'))).toBeNull();
    });
});

describe('isMissingBlockError compatibility', () => {
    it('keeps returning true for kernel -1 messages', () => {
        expect(isMissingBlockError(new Error('SiYuan API error: -1 - 未找到 ID 为 [abc] 的内容块'))).toBe(true);
        expect(isMissingBlockError(new Error('some other error'))).toBe(false);
        expect(isMissingBlockError(null)).toBe(false);
    });
});

describe('createErrorResult wires translator', () => {
    it('adds a code field when the kernel message matches a known pattern', () => {
        const result = createErrorResult(new Error('SiYuan API error: -1 - 未找到 ID 为 [abc] 的内容块'), {
            tool: 'block',
            action: 'info',
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.error.type).toBe('not_found');
        expect(parsed.error.code).toBe('block_not_found');
        expect(parsed.error.hint).toContain('block(action="info"');
    });

    it('leaves unrelated errors untouched', () => {
        const result = createErrorResult(new Error('weirdest thing'));
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.error.code).toBeUndefined();
    });
});

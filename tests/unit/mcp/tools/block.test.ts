import { describe, expect, it } from 'vitest';

import { isMissingBlockError } from '@/mcp/tools/block';

describe('block tool', () => {
    it('treats missing block API errors as non-existent blocks', () => {
        expect(isMissingBlockError(new Error('SiYuan API error: -1 - 未找到 ID 为 [invalid-block-id-12345] 的内容块'))).toBe(true);
        expect(isMissingBlockError(new Error('some other error'))).toBe(false);
    });
});

import { describe, expect, it } from 'vitest';

import { applyTruncation, paginate } from '@/tools/internal/pagination';

describe('tools/pagination', () => {
    it('returns items unchanged when they fit inside the truncation limit', () => {
        expect(applyTruncation([1, 2], 2, 'narrow it')).toEqual({ items: [1, 2] });
    });

    it('adds truncation metadata when items exceed the limit', () => {
        expect(applyTruncation([1, 2, 3], 2, 'narrow it')).toEqual({
            items: [1, 2],
            meta: {
                truncated: true,
                showing: 2,
                total: 3,
                hint: 'narrow it',
            },
        });
    });

    it('normalizes pages and exposes pagination metadata', () => {
        expect(paginate(['a', 'b', 'c'], 5, 2)).toEqual({
            items: ['c'],
            total: 3,
            page: 2,
            pageSize: 2,
            pageCount: 2,
            showing: 1,
            truncated: true,
            hasNextPage: false,
        });
        expect(paginate([], 1, 20)).toEqual({
            items: [],
            total: 0,
            page: 1,
            pageSize: 20,
            pageCount: 1,
            showing: 0,
            truncated: false,
            hasNextPage: false,
        });
    });
});

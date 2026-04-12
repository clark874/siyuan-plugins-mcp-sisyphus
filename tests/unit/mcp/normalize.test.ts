import { describe, expect, it } from 'vitest';

import {
    normalizeFullTextSearchResult,
    normalizeKramdownResult,
    normalizeMarkdownContent,
    stripHtmlTags,
    stripZeroWidthChars,
} from '@/mcp/normalize';

describe('normalize helpers', () => {
    it('strips zero-width characters from markdown content', () => {
        expect(stripZeroWidthChars('a\u200Bb\uFEFFc')).toBe('abc');
        expect(normalizeMarkdownContent({ content: 'x\u200B#标签#\u200B' }).content).toBe('x#标签#');
    });

    it('strips zero-width characters from kramdown results', () => {
        const result = normalizeKramdownResult({ id: 'block-id', kramdown: '\u200B#标签#\u200B' });
        expect(result).toEqual({ id: 'block-id', kramdown: '#标签#' });
    });

    it('strips HTML tags for plain-text search fields', () => {
        expect(stripHtmlTags('before <mark>hit</mark> after')).toBe('before hit after');
    });

    it('keeps original fulltext content while adding plainContent when requested', () => {
        const result = normalizeFullTextSearchResult({
            blocks: [
                { id: '1', content: 'before <mark>hit</mark> after' },
                { id: '2', content: 'plain text' },
            ],
            matchedBlockCount: 2,
            matchedRootCount: 1,
            pageCount: 1,
        }, true);

        expect(result.blocks).toEqual([
            { id: '1', content: 'before <mark>hit</mark> after', plainContent: 'before hit after' },
            { id: '2', content: 'plain text', plainContent: 'plain text' },
        ]);
    });

    it('returns fulltext result unchanged when stripHtml is disabled', () => {
        const input = { blocks: [{ id: '1', content: '<mark>hit</mark>' }] };
        expect(normalizeFullTextSearchResult(input, false)).toBe(input);
    });
});

import { describe, expect, it } from 'vitest';

import {
    normalizeFullTextSearchResult,
    normalizeKramdownResult,
    normalizeMarkdownContent,
    slimBlockFields,
    slimSearchBlocks,
    stripHtmlTags,
    stripZeroWidthChars,
    truncateContentAroundMarks,
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

describe('slimBlockFields', () => {
    it('keeps essential fields and drops empty/irrelevant ones', () => {
        const full = {
            box: 'nb1', path: '/a/b.sy', hPath: '/Folder/Doc', id: 'block1',
            rootID: 'root1', parentID: 'parent1', name: '', alias: '', memo: '',
            tag: '', content: 'hello', fcontent: '', markdown: '**hello**',
            folded: false, type: 'NodeParagraph', subType: '', refText: '',
            refs: null, defID: '', defPath: '', ial: { id: 'block1' },
            children: null, depth: 0, count: 0, refCount: 0, sort: 10,
            created: '', updated: '', riffCardID: '', riffCard: null,
        };
        const slim = slimBlockFields(full);
        expect(slim).toEqual({
            id: 'block1', type: 'NodeParagraph', box: 'nb1',
            hPath: '/Folder/Doc', path: '/a/b.sy', rootID: 'root1', parentID: 'parent1',
            content: 'hello', markdown: '**hello**',
        });
    });

    it('keeps non-empty optional fields like name, tag, memo', () => {
        const block = {
            id: 'b1', type: 'NodeHeading', box: 'nb1',
            hPath: '/Doc', name: 'My Block', tag: '#important', memo: 'note',
            content: 'heading', markdown: '# heading',
        };
        const slim = slimBlockFields(block);
        expect(slim.name).toBe('My Block');
        expect(slim.tag).toBe('#important');
        expect(slim.memo).toBe('note');
    });

    it('normalizes hpath to hPath', () => {
        const block = { id: 'b1', type: 'NodeParagraph', box: 'nb1', hpath: '/Some/Path' };
        const slim = slimBlockFields(block);
        expect(slim.hPath).toBe('/Some/Path');
        expect(slim).not.toHaveProperty('hpath');
    });
});

describe('truncateContentAroundMarks', () => {
    it('returns short content unchanged', () => {
        const short = 'before <mark>hit</mark> after';
        expect(truncateContentAroundMarks(short)).toBe(short);
    });

    it('truncates long content around mark tags', () => {
        const padding = 'x'.repeat(300);
        const text = `${padding}<mark>keyword</mark>${padding}`;
        const result = truncateContentAroundMarks(text, 50);
        expect(result).toContain('<mark>keyword</mark>');
        expect(result).toMatch(/^\.\.\./);
        expect(result).toMatch(/\.\.\.$/);
        expect(result.length).toBeLessThan(text.length);
    });

    it('merges adjacent mark windows', () => {
        const padding = 'x'.repeat(300);
        const text = `${padding}<mark>a</mark> near <mark>b</mark>${padding}`;
        const result = truncateContentAroundMarks(text, 50);
        expect(result).toContain('<mark>a</mark>');
        expect(result).toContain('<mark>b</mark>');
        // Should be a single window (no ... between the two marks)
        const inner = result.replace(/^\.\.\./, '').replace(/\.\.\.$/, '');
        expect(inner).not.toContain('...');
    });

    it('falls back to simple truncation when no marks present', () => {
        const text = 'a'.repeat(500);
        const result = truncateContentAroundMarks(text);
        expect(result).toBe('a'.repeat(400) + '...');
    });
});

describe('slimSearchBlocks', () => {
    it('slims an array of blocks', () => {
        const blocks = [{
            id: 'b1', type: 'NodeParagraph', box: 'nb1', hPath: '/Doc',
            content: 'short <mark>hit</mark>', markdown: 'short **hit**',
            path: '/a.sy', parent_id: 'root', refs: null, children: null,
        }];
        const result = slimSearchBlocks(blocks);
        expect(result).toHaveLength(1);
        expect(result[0]).toHaveProperty('path', '/a.sy');
        expect(result[0]).toHaveProperty('parent_id', 'root');
        expect(result[0]).not.toHaveProperty('refs');
        expect(result[0]).not.toHaveProperty('children');
    });

    it('does not truncate NodeDocument content', () => {
        const longTitle = 'T'.repeat(500);
        const blocks = [{
            id: 'd1', type: 'NodeDocument', box: 'nb1', hPath: '/Doc',
            content: longTitle, markdown: '',
        }];
        const result = slimSearchBlocks(blocks) as Record<string, unknown>[];
        expect(result[0].content).toBe(longTitle);
    });

    it('truncates long markdown', () => {
        const longMd = 'm'.repeat(500);
        const blocks = [{
            id: 'b1', type: 'NodeParagraph', box: 'nb1',
            content: 'short', markdown: longMd,
        }];
        const result = slimSearchBlocks(blocks) as Record<string, unknown>[];
        expect((result[0].markdown as string).length).toBeLessThan(500);
        expect((result[0].markdown as string)).toMatch(/\.\.\.$/);
    });
});

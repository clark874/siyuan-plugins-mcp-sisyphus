import { describe, expect, it } from 'vitest';

import { normalizeFullTextSearchResult } from '@/mcp/normalize';
import { filterBacklinkResultByPermission, filterFullTextSearchResultByPermission } from '@/mcp/tools/search';

describe('search tool filtering', () => {
    it('filters fulltext search results by notebook permission and preserves plainContent', () => {
        const permMgr = {
            canRead(notebookId: string) {
                return notebookId !== 'blocked';
            },
        };

        const filtered = filterFullTextSearchResultByPermission({
            blocks: [
                { id: '1', box: 'allowed', rootID: 'doc-1', content: '<mark>MCP</mark> note' },
                { id: '2', box: 'blocked', rootID: 'doc-2', content: '<mark>Secret</mark> note' },
            ],
            matchedBlockCount: 2,
            matchedRootCount: 2,
            pageCount: 1,
        }, permMgr as never);

        const normalized = normalizeFullTextSearchResult(filtered, true) as {
            blocks: Array<Record<string, unknown>>;
            matchedBlockCount: number;
            matchedRootCount: number;
            filteredOutBlockCount?: number;
        };

        expect(normalized.blocks).toHaveLength(1);
        expect(normalized.blocks[0].plainContent).toBe('MCP note');
        expect(normalized.matchedBlockCount).toBe(1);
        expect(normalized.matchedRootCount).toBe(1);
        expect(normalized.filteredOutBlockCount).toBe(1);
    });

    it('filters backlink-style result sets by notebook permission', () => {
        const permMgr = {
            canRead(notebookId: string) {
                return notebookId !== 'blocked';
            },
        };

        const filtered = filterBacklinkResultByPermission({
            backlinks: [
                { id: '1', box: 'allowed' },
                { id: '2', box: 'blocked' },
            ],
            backmentions: [
                { id: '3', notebook: 'allowed' },
                { id: '4', notebook: 'blocked' },
            ],
        }, permMgr as never) as {
            backlinks: unknown[];
            backmentions: unknown[];
            filteredOutCount?: number;
            partial?: boolean;
            reason?: string;
        };

        expect(filtered.backlinks).toHaveLength(1);
        expect(filtered.backmentions).toHaveLength(1);
        expect(filtered.filteredOutCount).toBe(2);
        expect(filtered.partial).toBe(true);
        expect(filtered.reason).toBe('permission_filtered');
    });
});

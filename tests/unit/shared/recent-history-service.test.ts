import { describe, expect, it, vi } from 'vitest';

import {
    compareRecentDocumentHistory,
    resolveRecentDocumentHistoryDiff,
} from '@/shared/recent-history-service';
import { createMockClient } from '../../helpers/mock-client';

const DOC_ID = '20260811120000-abcdefg';
const CURRENT_DOM = [
    '<div data-node-id="heading" data-type="NodeHeading" data-subtype="h1"><div>方法</div></div>',
    '<div data-node-id="paragraph" data-type="NodeParagraph"><div>当前内容</div></div>',
].join('');
const SAME_DOM = CURRENT_DOM.replace(/contenteditable="true"/g, 'contenteditable="false"');
const OLD_DOM = CURRENT_DOM.replace('当前内容', '历史内容');

function historyClient() {
    return createMockClient({
        request: vi.fn(async (endpoint: string, data?: Record<string, unknown>) => {
            if (endpoint === '/api/block/getBlockDOM') return { id: DOC_ID, dom: CURRENT_DOM };
            if (endpoint === '/api/history/searchHistory') {
                return { histories: ['1786434544', '1786358524'], pageCount: 1, totalCount: 2 };
            }
            if (endpoint === '/api/history/getHistoryItems') {
                return {
                    items: [{
                        title: '示例文档',
                        path: `history/${String(data?.created)}/nb-1/${DOC_ID}.sy`,
                        op: 'update',
                        notebook: 'nb-1',
                    }],
                };
            }
            if (endpoint === '/api/history/getDocHistoryContent') {
                const path = String(data?.historyPath);
                return {
                    id: DOC_ID,
                    rootID: DOC_ID,
                    content: path.includes('1786434544') ? SAME_DOM : OLD_DOM,
                    isLargeDoc: false,
                };
            }
            return null;
        }),
    });
}

describe('recent history comparison', () => {
    it('skips an identical checkpoint and selects the newest different document history', async () => {
        const result = await resolveRecentDocumentHistoryDiff(historyClient(), {
            documentId: DOC_ID,
            currentUpdated: '20260811150000',
        });

        expect(result.baseline).toMatchObject({ created: '1786358524', title: '示例文档', op: 'update' });
        expect(result.scannedCandidates).toBe(2);
        expect(result.stats).toMatchObject({ changedBlocks: 1, addedLines: 1, removedLines: 1 });
        expect(result.allEntries.find((entry) => entry.status === 'modified')?.sectionPath).toEqual(['方法']);
    });

    it('returns a sanitized, paginated MCP result without history paths or full documents', async () => {
        const result = await compareRecentDocumentHistory(historyClient(), {
            documentId: DOC_ID,
            page: 1,
            pageSize: 1,
        });

        expect(result.source).toBe('recent_history');
        expect(result.total).toBe(1);
        expect(result.changes[0]).toMatchObject({
            status: 'modified',
            sectionPath: ['方法'],
            old: { id: 'paragraph', markdown: '历史内容' },
            current: { id: 'paragraph', markdown: '当前内容' },
        });
        expect(JSON.stringify(result)).not.toContain('history/');
        expect(result).not.toHaveProperty('oldContent');
        expect(result).not.toHaveProperty('allEntries');
    });

    it('reports an explicit empty baseline when no document history exists', async () => {
        const client = createMockClient({
            request: vi.fn(async (endpoint: string) => endpoint === '/api/block/getBlockDOM'
                ? { id: DOC_ID, dom: CURRENT_DOM }
                : { histories: [], pageCount: 0, totalCount: 0 }),
        });

        const result = await compareRecentDocumentHistory(client, { documentId: DOC_ID });
        expect(result).toMatchObject({ baseline: null, noChanges: true, reason: 'no_history', total: 0 });
    });

    it('validates the returned history root id before comparing content', async () => {
        const client = historyClient();
        (client.request as any).mockImplementation(async (endpoint: string) => {
            if (endpoint === '/api/block/getBlockDOM') return { id: DOC_ID, dom: CURRENT_DOM };
            if (endpoint === '/api/history/searchHistory') return { histories: ['1786434544'], pageCount: 1, totalCount: 1 };
            if (endpoint === '/api/history/getHistoryItems') return { items: [{ title: '错配', path: 'history/wrong.sy', op: 'update', notebook: 'nb-1' }] };
            if (endpoint === '/api/history/getDocHistoryContent') return { id: 'wrong', rootID: 'wrong', content: OLD_DOM, isLargeDoc: false };
            return null;
        });

        const result = await compareRecentDocumentHistory(client, { documentId: DOC_ID });
        expect(result).toMatchObject({ baseline: null, reason: 'no_different_history', total: 0 });
    });
});

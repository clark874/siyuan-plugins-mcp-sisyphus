import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildDefaultToolConfig } from '@/core/config';
import { callLiteratureTool } from '@/tools/literature';
import { createMockClient } from '../../helpers/mock-client';

function parseResult(result: Awaited<ReturnType<typeof callLiteratureTool>>): Record<string, any> {
    return JSON.parse(result.content[0]?.text ?? '{}') as Record<string, any>;
}

describe('literature tool', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('maps the public paper search to the fixed Zotero read tool and strips local paths', async () => {
        const requests: Array<Record<string, any>> = [];
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            const request = JSON.parse(String(init?.body ?? '{}')) as Record<string, any>;
            requests.push(request);
            if (request.method === 'initialize') {
                return new Response(JSON.stringify({
                    jsonrpc: '2.0', id: request.id,
                    result: { protocolVersion: '2024-11-05', serverInfo: { name: 'zotero-integrated-mcp', version: '1.1.0' } },
                }), { headers: { 'content-type': 'application/json' } });
            }
            return new Response(JSON.stringify({
                jsonrpc: '2.0', id: request.id,
                result: {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            items: [{
                                itemKey: 'ABC123',
                                title: 'Paper',
                                filePath: '/Users/test/paper.pdf',
                                dbPath: '/Users/test/zotero-mcp-vectors.sqlite',
                            }],
                        }),
                    }],
                },
            }), { headers: { 'content-type': 'application/json' } });
        }));

        const result = await callLiteratureTool(
            {} as never,
            { action: 'search_papers', query: 'trust', yearRange: '2020-2024', limit: 5 },
            buildDefaultToolConfig().literature,
            {} as never,
        );
        const payload = parseResult(result);

        expect(result.isError).not.toBe(true);
        expect(payload.items[0]).toEqual({ itemKey: 'ABC123', title: 'Paper' });
        expect(requests[1]).toMatchObject({
            method: 'tools/call',
            params: {
                name: 'search_library',
                arguments: { q: 'trust', yearRange: '2020-2024', limit: 5, offset: 0 },
            },
        });
    });

    it('returns an actionable degraded status when Zotero is unavailable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new Error('connect ECONNREFUSED 127.0.0.1:23120');
        }));

        const result = await callLiteratureTool(
            {} as never,
            { action: 'status' },
            buildDefaultToolConfig().literature,
            {} as never,
        );
        const payload = parseResult(result);

        expect(result.isError).not.toBe(true);
        expect(payload).toMatchObject({
            connected: false,
            source: 'zotero-mcp',
            endpoint: 'http://127.0.0.1:23120/mcp',
        });
        expect(payload.nextStep).toContain('启动 Zotero');
    });

    it('collects paper and child-block citations without exposing restricted discussions', async () => {
        const request = vi.fn(async (endpoint: string, body?: Record<string, unknown>) => {
            if (endpoint !== '/api/query/sql') return null;
            const stmt = String(body?.stmt ?? '');
            if (stmt.includes("WHERE id = 'paper-doc'")) {
                return [{ id: 'paper-doc', root_id: 'paper-doc', box: 'paper-nb', path: '/paper-doc.sy' }];
            }
            if (stmt.includes("r.def_block_root_id = 'paper-doc'")) {
                return [
                    { refId: 'ref-1', sourceBlockId: 'discussion-1', sourceDocumentId: 'discussion-doc', targetBlockId: 'paper-doc', anchorText: 'paper', box: 'readable-nb', sourceText: 'First discussion' },
                    { refId: 'ref-2', sourceBlockId: 'discussion-1', sourceDocumentId: 'discussion-doc', targetBlockId: 'paper-child', anchorText: 'specific result', box: 'readable-nb', sourceText: 'First discussion' },
                    { refId: 'ref-3', sourceBlockId: 'private-1', sourceDocumentId: 'private-doc', targetBlockId: 'paper-child', anchorText: 'private', box: 'private-nb', sourceText: 'Private discussion' },
                ];
            }
            return [];
        });
        const permissions = {
            reload: vi.fn(async () => undefined),
            canRead: (box: string) => box !== 'private-nb',
            get: (box: string) => box === 'private-nb' ? 'none' : 'r',
            getAll: () => ({ 'paper-nb': 'r', 'readable-nb': 'r', 'private-nb': 'none' }),
        };
        const result = await callLiteratureTool(
            createMockClient({ request }),
            { action: 'get_citations', documentId: 'paper-doc' },
            buildDefaultToolConfig().literature,
            permissions as never,
        );
        const payload = parseResult(result);
        expect(payload.citations.map((row: Record<string, string>) => row.targetBlockId)).toEqual(['paper-doc', 'paper-child']);
        expect(payload.sourceDocuments).toEqual(['discussion-doc']);
        expect(payload).toMatchObject({ returnedEdges: 2, partial: true, filteredOutCount: 1 });
        expect(payload.hasMore).toBeUndefined();
    });

    it('locates an exact quote in a Markdown attachment without returning its local path', async () => {
        const requests: Array<Record<string, any>> = [];
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            const request = JSON.parse(String(init?.body ?? '{}')) as Record<string, any>;
            requests.push(request);
            const payload = request.method === 'initialize'
                ? { protocolVersion: '2024-11-05' }
                : request.params?.name === 'get_item_details'
                    ? { attachments: [{ key: 'MD123', contentType: 'text/markdown', filename: 'full.md', path: '/private/full.md' }] }
                    : { contentType: 'text/markdown', filename: 'full.md', content: '# Heading\nFirst line\nThe exact result is here.\n', truncated: false, filePath: '/private/full.md' };
            return new Response(JSON.stringify({
                jsonrpc: '2.0', id: request.id,
                result: request.method === 'initialize' ? payload : { content: [{ type: 'text', text: JSON.stringify(payload) }] },
            }), { headers: { 'content-type': 'application/json' } });
        }));

        const result = await callLiteratureTool(
            {} as never,
            { action: 'locate_quote', itemKey: 'PAPER123', quote: 'The exact result is here.' },
            buildDefaultToolConfig().literature,
            {} as never,
        );
        const payload = parseResult(result);
        expect(payload).toMatchObject({ status: 'located', attachmentKey: 'MD123', occurrenceCount: 1 });
        expect(payload.matches[0]).toMatchObject({ lineStart: 3, lineEnd: 3, heading: 'Heading' });
        expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(JSON.stringify(payload)).not.toContain('/private/');
        expect(requests.at(-1)?.params).toMatchObject({ name: 'get_content', arguments: { attachmentKey: 'MD123', mode: 'complete' } });
    });
});

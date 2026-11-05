import { describe, expect, it, vi } from 'vitest';
import { buildDefaultToolConfig } from '@/core/config';
import { callLiteratureTool } from '@/tools/literature';
import * as avHandlers from '@/tools/av/handlers';
import * as retrieval from '@/tools/search/retrieval';
import { createMockClient } from '../../helpers/mock-client';

const box = '20261105000000-abc0001';
const catalog = '20261105000000-abc0002';
const avID = '20261105000000-abc0003';
const doc = '20261105000000-abc0004';
const block = '20261105000000-abc0005';
const path = '/' + doc + '.sy';

vi.mock('@/tools/av/handlers', () => ({
    ensurePermissionForAvId: vi.fn(async () => ({
        denied: null,
        avData: {
            keyValues: [
                { key: { type: 'block', name: '主键' }, values: [{ blockID: 'row', block: { id: doc, content: '论文甲' } }] },
                { key: { type: 'text', name: 'DOI' }, values: [{ blockID: 'row', text: { content: '10.1234/test' } }] },
            ],
        },
    })),
    extractAvRowLookup: vi.fn(() => ({ rows: [{ rowID: 'row', sourceBlockID: doc }] })),
}));

function fixture() {
    const request = vi.fn(async (endpoint: string, args: { stmt?: string }) => {
        if (endpoint === '/api/query/sql') {
            if (args.stmt?.includes('custom-literature-catalog')) return [{ id: catalog, box, root_id: catalog, av_id: avID, title: '文献库' }];
            if (args.stmt?.includes("'d'")) return [{ id: doc, box, path, content: '论文甲', updated: '20261105000000' }];
            return [{ id: block, root_id: doc, box, content: '直接相关的正文。', heading: '结果' }];
        }
        if (endpoint === '/api/search/fullTextSearchBlock') return { blocks: [{ id: block }] };
        if (endpoint === '/api/block/getBlockKramdowns') return { [block]: '直接相关的正文。' };
        throw Error(endpoint);
    });
    return { client: createMockClient({ request }), request, permissions: { reload: vi.fn(), canRead: (id: string) => id === box } as never };
}

describe('思源文献库', () => {
    it('通过目录绑定定位论文，返回回读的正文和出处', async () => {
        const { client, permissions } = fixture();
        const result = await callLiteratureTool(client, { action: 'find_evidence', doi: 'https://doi.org/10.1234/TEST', query: '结果' },
            buildDefaultToolConfig().literature, permissions);
        expect(JSON.parse(result.content[0].text ?? '{}')).toMatchObject({
            status: 'found', papers: [{ documentId: doc, doi: '10.1234/test' }],
            evidence: [{ documentId: doc, blockId: block, text: '直接相关的正文。', heading: '结果' }],
        });
    });

    it('精确书目不存在时结束查找', async () => {
        const { client, permissions, request } = fixture();
        const result = await callLiteratureTool(client, { action: 'find_evidence', doi: '10.1234/missing', query: '结果', semantic: true, rerank: true },
            buildDefaultToolConfig().literature, permissions);
        expect(JSON.parse(result.content[0].text ?? '{}')).toMatchObject({ status: 'not_found' });
        expect(request.mock.calls.every(([endpoint]) => endpoint === '/api/query/sql')).toBe(true);
    });

    it('六篇十八块全部进入分批精排，输出可翻页且批次失败保留召回顺序', async () => {
        const documents = Array.from({ length: 6 }, (_, i) => ({
            id: `20261105000000-doc000${i}`, box, path: `/论文${i}.sy`, content: `论文${i}`, updated: '20261105000000',
        }));
        const rows = Array.from({ length: 18 }, (_, i) => ({
            id: `20261105000000-row00${String(i).padStart(2, '0')}`, root_id: documents[i % 6].id,
            box, type: 'p', content: `实质正文${i}`, heading: '结果',
            ...(i === 0 ? { literature_role: 'abstract', literature_role_digest: '内容变更前的摘要指纹' } : {}),
        }));
        const noise = { ...rows[1], id: '20261105000000-noise01', literature_role: 'references' };
        vi.mocked(avHandlers.extractAvRowLookup).mockReturnValue({ rows: documents.map((item, i) => ({
            rowID: `row${i}`, sourceBlockID: item.id,
        })) } as never);
        const { permissions } = fixture();
        const request = vi.fn(async (endpoint: string, args: { stmt?: string; pageSize?: number }) => {
            if (endpoint === '/api/query/sql') {
                if (args.stmt?.includes('custom-literature-catalog')) return [{ id: catalog, box, root_id: catalog, av_id: avID, title: '文献库' }];
                if (args.stmt?.includes("type='d'")) return documents;
                return [noise, ...rows].filter(row => args.stmt?.includes(`'${row.id}'`));
            }
            if (endpoint === '/api/search/fullTextSearchBlock') {
                expect(args.pageSize).toBeGreaterThanOrEqual(100);
                return { blocks: [noise, ...rows], matchedBlockCount: 19 };
            }
            if (endpoint === '/api/block/getBlockKramdowns') return Object.fromEntries(rows.map(row => [row.id, row.content]));
            throw Error(endpoint);
        });
        const context = vi.spyOn(retrieval, 'attachKnowledgeContext').mockResolvedValue(undefined);
        const rerank = vi.spyOn(retrieval, 'rerankKnowledgeCandidates').mockImplementation(async (_client, _perm, _query, candidates) => {
            candidates.forEach(row => { row.decisionScore = rows.findIndex(item => item.id === row.id) / 18; });
            return { status: 'applied', provider: 'typesafe', model: '测试模型', rankedCount: candidates.length,
                durationMs: 1, inputLimits: { candidates: 10, bodyChars: 1000, neighborChars: 400 }, usage: undefined };
        });
        const client = createMockClient({ request });
        const run = async (offset: number) => JSON.parse((await callLiteratureTool(client,
            { action: 'find_evidence', query: '结果', rerank: true, limit: 12, offset },
            buildDefaultToolConfig().literature, permissions)).content[0].text ?? '{}');
        const first = await run(0);
        expect(first).toMatchObject({ totalCandidates: 18, hasMore: true, nextOffset: 12,
            retrieval: { candidateDocuments: 6, filteredByContentRole: 1, rerank: { status: 'applied', rankedCount: 18 } } });
        expect(first.papers).toHaveLength(6);
        expect(first.evidence.map((row: { blockId: string }) => row.blockId)).toEqual(rows.slice(6).reverse().map(row => row.id));
        expect(rerank.mock.calls.map(call => call[3].length)).toEqual([10, 8]);
        expect(context).toHaveBeenCalledTimes(2);
        const second = await run(12);
        expect(second).toMatchObject({ hasMore: false, nextOffset: null });
        expect(second.evidence.map((row: { blockId: string }) => row.blockId)).toEqual(rows.slice(0, 6).reverse().map(row => row.id));
        rerank.mockImplementationOnce(async () => ({ status: 'fallback', reason: 'timeout', rankedCount: 0 }));
        const degraded = await run(0);
        expect(degraded).toMatchObject({ partial: true, retrieval: { rerank: { status: 'partial', ordering: 'original_recall' } } });
        expect(degraded.evidence.map((row: { blockId: string }) => row.blockId)).toEqual(rows.slice(0, 12).map(row => row.id));
    });
});

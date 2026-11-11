import { describe, expect, it, vi } from 'vitest';
import { discoverProjectKnowledgeCatalogs, readProjectKnowledgeCatalog } from '@/tools/project/knowledge-catalog';
import { createMockClient } from '../../helpers/mock-client';
import { createMockPermissionManager } from '../../helpers/mock-permissions';

const projectId = 'aa-m';
const catalogBlockId = '20261111090000-catalog';
const avId = '20261111090000-avtable';
const documentId = '20261111090000-project';
const blockId = '20261111090000-atom001';
const privateBlockId = '20261111090000-atom002';
const marker = { id: catalogBlockId, box: 'public', document_id: documentId, title: 'AA-M', av_id: avId, project_id: projectId };

function setup(stored = true) {
    const request = vi.fn(async (endpoint: string, args: { stmt?: string; id?: string }) => {
        if (endpoint === '/api/query/sql') {
            if (args.stmt?.includes('AS av_id')) return [marker];
            if (args.stmt?.includes('AS atom_type')) return [
                { id: blockId, box: 'public', block_name: '预算定义', atom_type: 'definition', verification_status: 'draft' },
                { id: privateBlockId, box: 'private', block_name: '受限正文', atom_type: 'definition', verification_status: 'draft' },
            ];
            if (args.stmt?.includes('root_id, box, path')) {
                return [{ id: catalogBlockId, root_id: documentId, box: 'public', path: `/${documentId}.sy` }];
            }
        }
        if (endpoint === '/api/file/readDir') return stored ? [{ name: `${avId}.json`, isDir: false }] : [];
        if (endpoint === '/api/av/getAttributeView' && args.id === avId) return { av: { id: avId, keyValues: [
            { key: { id: 'primary', name: '条目', type: 'block' }, values: [
                { blockID: 'row-1', block: { id: blockId } },
                { blockID: 'row-2', block: { id: privateBlockId } },
            ] },
            { key: { id: 'workstream', name: '工作线', type: 'mSelect' }, values: [
                { blockID: 'row-1', mSelect: [{ content: 'AA-M' }, { content: '预算' }] },
                { blockID: 'row-2', mSelect: [{ content: 'AA-M' }] },
            ] },
            { key: { id: 'verification', name: '核验状态', type: 'text' }, values: [
                { blockID: 'row-1', text: { content: 'evidence-verified' } },
            ] },
        ] } };
        if (endpoint === '/api/block/getBlockDOM' && args.id === catalogBlockId) {
            return { id: catalogBlockId, dom: `<div data-type="NodeAttributeView" data-av-id="${avId}"></div>` };
        }
        throw Error(`意外请求 ${endpoint}`);
    });
    const client = createMockClient({ request, requestWrite: vi.fn() });
    const permissions = createMockPermissionManager({ canRead: box => box === 'public' });
    return { client, permissions, request };
}

describe('项目知识目录', () => {
    it('只读发现目录并按工作线和绑定块现状筛选，受限行不出现在结果或计数中', async () => {
        const { client, permissions, request } = setup();
        const catalogs = await discoverProjectKnowledgeCatalogs(client, permissions, projectId);
        expect(catalogs).toMatchObject([{ catalogBlockId, avId, projectId, documentId }]);
        expect(request.mock.calls.map(([endpoint]) => endpoint)).toEqual(['/api/query/sql']);

        const selector = { catalogBlockId, projectId };
        const result = await readProjectKnowledgeCatalog(client, permissions, {
            ...selector, filters: { workstream: ['无关', '预算'], verificationStatus: 'draft' },
        });
        expect(result).toMatchObject({ status: 'ready', totalMatches: 1, candidates: [
            { blockId, rowId: 'row-1', url: `siyuan://blocks/${blockId}`, title: '预算定义', verificationStatus: 'draft' },
        ] });
        await expect(readProjectKnowledgeCatalog(client, permissions, {
            ...selector, filters: { workstream: 'AA-M', verificationStatus: 'evidence-verified' },
        })).resolves.toMatchObject({ status: 'not_found', totalMatches: 0 });
        expect(client.requestWrite).not.toHaveBeenCalled();
    });

    it('登记指向缺失的数据库时保留异常状态，跳过可能创建文件的内核接口', async () => {
        const { client, permissions, request } = setup(false);
        await expect(readProjectKnowledgeCatalog(client, permissions, { catalogBlockId, projectId }))
            .resolves.toEqual({ status: 'catalog_unavailable', candidates: [] });
        expect(request.mock.calls.map(([endpoint]) => endpoint)).toEqual(['/api/query/sql', '/api/file/readDir']);
        expect(client.requestWrite).not.toHaveBeenCalled();
    });
});

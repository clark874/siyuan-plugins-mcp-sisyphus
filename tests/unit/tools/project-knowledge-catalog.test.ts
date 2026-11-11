import { describe, expect, it, vi } from 'vitest';
import { discoverProjectKnowledgeCatalogs, readProjectKnowledgeCatalog, verifyProjectKnowledgeCatalogBindings } from '@/tools/project/knowledge-catalog';
import { createMockClient } from '../../helpers/mock-client';
import { createMockPermissionManager } from '../../helpers/mock-permissions';

const projectId = 'aa-m';
const catalogBlockId = '20261111090000-catalog';
const avId = '20261111090000-avtable';
const documentId = '20261111090000-project';
const blockId = '20261111090000-atom001';
const privateBlockId = '20261111090000-atom002';
const attributeBlockId = '20261111090000-atom003';
const marker = { id: catalogBlockId, box: 'public', document_id: documentId, title: 'AA-M', av_id: avId, project_id: projectId };

function setup(stored = true, attributes = false) {
    const metadata = [
        { id: blockId, box: 'public', block_name: '预算定义', atom_type: 'definition', verification_status: 'draft',
            ...(attributes ? { knowledge_project_id: projectId, knowledge_workstream: 'AA-M' } : {}) },
        { id: privateBlockId, box: 'private', block_name: '受限正文', atom_type: 'definition', verification_status: 'draft' },
        ...(attributes ? [{ id: attributeBlockId, box: 'public', block_name: '无需重复绑定的知识块', atom_type: 'claim',
            verification_status: 'draft', knowledge_project_id: projectId, knowledge_workstream: 'AA-M' }] : []),
    ];
    const request = vi.fn(async (endpoint: string, args: { stmt?: string; id?: string }) => {
        if (endpoint === '/api/query/sql') {
            if (args.stmt?.includes('AS av_id')) return [marker];
            if (args.stmt?.includes('AS atom_type')) return metadata.filter(row => args.stmt?.includes(`'${row.id}'`));
            if (args.stmt?.includes('JOIN attributes workstream')) return attributes
                ? [{ id: attributeBlockId, box: 'public' }, { id: blockId, box: 'public' }, { id: privateBlockId, box: 'private' }] : [];
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
            { key: { id: 'compile', name: '编译状态', type: 'text' }, values: [
                { blockID: 'row-1', text: { content: 'compiled' } },
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

    it('已授权目录合并属性原子并稳定分页，编译筛选只按实际目录记录，关账可复用属性', async () => {
        const { client, permissions } = setup(true, true);
        const selector = { catalogBlockId, projectId, filters: { objectRole: 'atom', workstream: 'AA-M' }, limit: 1 };
        const first = await readProjectKnowledgeCatalog(client, permissions, selector);
        expect(first).toMatchObject({ status: 'ready', totalMatches: 2, nextOffset: 1,
            candidates: [{ blockId, rowId: 'row-1' }] });
        const second = await readProjectKnowledgeCatalog(client, permissions, { ...selector, offset: 1 });
        expect(second).toMatchObject({ status: 'ready', totalMatches: 2, hasMore: false,
            candidates: [{ blockId: attributeBlockId, atomType: 'claim' }] });
        expect(second.candidates[0]).not.toHaveProperty('rowId');
        expect(second.candidates[0]).not.toHaveProperty('compileStatus');
        await expect(readProjectKnowledgeCatalog(client, permissions, {
            ...selector, filters: { compileStatus: 'compiled' },
        })).resolves.toMatchObject({ totalMatches: 1, candidates: [{ blockId, compileStatus: 'compiled' }] });
        await expect(verifyProjectKnowledgeCatalogBindings(client, permissions, projectId, 'AA-M', [attributeBlockId], []))
            .resolves.toBeUndefined();
        await expect(verifyProjectKnowledgeCatalogBindings(client, permissions, projectId, '其他工作线', [attributeBlockId], []))
            .rejects.toThrow('工作线属性冲突');
        await expect(verifyProjectKnowledgeCatalogBindings(client, permissions, projectId, 'AA-M', [], [{ id: attributeBlockId, status: 'compiled' }]))
            .rejects.toThrow('有效绑定或字段');
        expect(client.requestWrite).not.toHaveBeenCalled();
    });

    it('目录权限未通过时不查询属性原子，也不返回受限候选计数', async () => {
        const { client, permissions, request } = setup(true, true);
        permissions.canRead.mockReturnValue(false);
        await expect(readProjectKnowledgeCatalog(client, permissions, { catalogBlockId, projectId }))
            .resolves.toEqual({ status: 'catalog_not_found', candidates: [] });
        expect(request.mock.calls).toHaveLength(1);
        expect(request.mock.calls.some(([, args]) => args?.stmt?.includes('JOIN attributes workstream'))).toBe(false);
    });
});

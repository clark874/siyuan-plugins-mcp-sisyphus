import { expect, it, vi } from 'vitest';
import { KNOWLEDGE_UPDATE_ATTR, readKnowledgeUpdateLedger, validateKnowledgeUpdateMutation } from '@/core/knowledge-update';
import { createMockClient } from '../../helpers/mock-client';
import { createMockPermissionManager } from '../../helpers/mock-permissions';
import { verifyProjectKnowledgeCatalogBindings } from '@/tools/project/knowledge-catalog';

const hub = '20261121131600-aaac123';
const target = '20261121131600-aaac124';
const notebook = '20261121131600-aaac125';
const reuse = '20261121131600-aaac126';
vi.mock('@/core/project-sources', () => ({
    readProjectSourceState: async () => ({ record: { hubBlockId: '20261121131600-aaac123' } }),
}));
vi.mock('@/tools/project/knowledge-catalog', () => ({ verifyProjectKnowledgeCatalogBindings: vi.fn() }));

it('中断后显示目录待办，只有资料位置与目录均回读后才能关账', async () => {
    const catalog = vi.mocked(verifyProjectKnowledgeCatalogBindings);
    catalog.mockRejectedValue(new Error('目录尚无有效绑定。'));
    const source = { key: '附件', revision: '核定版本', disposition: 'reused', sourceBlockId: target, reuseBlockId: reuse };
    const ledger = {
        version: 1, projectId: 'audit', covered: [],
        pending: {
            batchId: 'batch', workstream: '主线', phase: 'sources', sources: [{ ...source, disposition: 'pending' }],
            atomIds: [], relationIds: [], nextStep: '检查目录绑定',
            operations: [
                { key: '正文', kind: 'document', state: 'pending', sourceKey: source.key, path: '/资料/正文' },
                { key: '目录', kind: 'catalog', state: 'pending', sourceKey: source.key },
            ] as Record<string, string>[],
        },
    };
    const docAttrs = { 'custom-source-project-id': ledger.projectId, 'custom-source-role': 'source-document', 'custom-source-revision': source.revision };
    const encode = (value: unknown) => ({ [KNOWLEDGE_UPDATE_ATTR]: JSON.stringify(value) });
    let saved: Record<string, string> = {};
    const client = createMockClient({ request: vi.fn(async (endpoint: string, data?: Record<string, unknown>) => {
        switch (endpoint) {
            case '/api/attr/getBlockAttrs': return data?.id === target ? docAttrs : data?.id === reuse
                ? { 'custom-knowledge-project-id': 'audit', 'custom-atom-type': 'evidence', 'custom-source-revision': source.revision }
                : saved;
            case '/api/query/sql': return [{ id: String(data?.stmt).includes(reuse) ? reuse : target,
                root_id: target, box: notebook, path: '/' + target + '.sy' }];
            case '/api/notebook/lsNotebooks': return { notebooks: [{ id: notebook, name: '资料' }] };
            case '/api/filetree/getIDsByHPath': return [target];
            case '/api/filetree/getPathByID': return { notebook, path: '/' + target + '.sy' };
            case '/api/filetree/getHPathByID': return '/正文';
            default: throw new Error(endpoint);
        }
    }) });
    const permissions = createMockPermissionManager();
    const apply = async (value: unknown) => {
        const next = encode(value);
        await validateKnowledgeUpdateMutation(client, permissions, hub, next, saved);
        saved = next;
    };
    await apply(ledger);
    const current = structuredClone(ledger);
    current.pending.phase = 'projection';
    current.pending.sources = [source];
    Object.assign(current.pending.operations[0], { state: 'verified', targetId: target });
    await apply(current);
    expect(await readKnowledgeUpdateLedger(client, hub, 'audit')).toMatchObject({
        status: 'pending', pendingOperations: [{ key: '目录', kind: 'catalog' }], verifiedOperationCount: 1,
    });
    await expect(apply({ ...current, pending: { ...current.pending, operations: current.pending.operations.slice(0, 1) } }))
        .rejects.toThrow('须保留待办');
    await expect(apply({ version: 1, projectId: 'audit', covered: current.pending.sources }))
        .rejects.toThrow('仍有待核文档、目录或关系操作');
    current.pending.sources = [source];
    Object.assign(current.pending.operations[1], { state: 'verified', targetId: target });
    await expect(apply(current)).rejects.toThrow('目录尚无有效绑定');
    expect(catalog).toHaveBeenCalledWith(client, permissions, 'audit', '主线', [], [{ id: target, status: 'reused' }]);
    expect(await readKnowledgeUpdateLedger(client, hub, 'audit')).toMatchObject({ pendingOperations: [{ key: '目录', kind: 'catalog' }] });
    catalog.mockResolvedValue(undefined);
    await apply(current);
    await apply({ version: 1, projectId: 'audit', covered: [source] });
    expect(await readKnowledgeUpdateLedger(client, hub, 'audit')).toMatchObject({ status: 'ready', coveredCount: 1 });
});

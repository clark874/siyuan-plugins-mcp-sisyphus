import { describe, expect, it, vi } from 'vitest';
import { executeMindmapPlan, readMindmapPlan, type MindmapPlan } from '@/tools/project/mindmap';
import { createMockClient } from '../../helpers/mock-client';
import { createMockPermissionManager } from '../../helpers/mock-permissions';

const pageId = '20260930000000-aaaaaaa';
const sourceId = '20260930000000-bbbbbbb';

function fixture() {
    let state: any;
    let edited = false;
    const pageAttrs: Record<string, string> = {};
    const transaction = vi.fn(async (body: any) => {
        for (const op of body.transactions[0].doOperations) {
            if (op.action === 'appendInsert') {
                const encoded = op.data.match(/custom-project-mindmap-state="([^"]+)"/)[1];
                state = JSON.parse(encoded.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
            }
            if (op.action === 'setAttrs') {
                const attrs = JSON.parse(op.data);
                if (op.id === pageId) Object.assign(pageAttrs, attrs);
                else if (attrs['custom-project-mindmap-state']) state = JSON.parse(attrs['custom-project-mindmap-state']);
            }
        }
    });
    const client = createMockClient({ request: async (endpoint: string, body: any) => {
        if (endpoint === '/api/transactions') return transaction(body);
        if (endpoint === '/api/query/sql') return [{ id: pageId, root_id: pageId, box: 'nb', path: '/page.sy' }];
        if (endpoint === '/api/attr/getBlockAttrs') return body.id === pageId ? pageAttrs : { 'custom-project-mindmap-state': JSON.stringify(state) };
        if (endpoint === '/api/block/getChildBlocks') {
            if (body.id === pageId) return [{ id: state.rootId, type: 'mindmap' }];
            const children = body.id === state.rootId ? state.nodes.filter((n: any) => !n.parent).map((n: any) => n.id)
                : state.nodes.find((n: any) => n.id === body.id) ? [state.nodes.find((n: any) => n.id === body.id).paragraphId, state.nodes.find((n: any) => n.id === body.id).listId].filter(Boolean)
                : state.nodes.filter((n: any) => n.parent === state.nodes.find((p: any) => p.listId === body.id)?.key).map((n: any) => n.id);
            return children.map((id: string) => ({ id }));
        }
        if (endpoint === '/api/block/getBlockDOM') {
            const node = state.nodes.find((n: any) => n.paragraphId === body.id);
            const content = node ? (edited && node.sourceId ? '人工改写' : node.label) : '';
            return { dom: `<div data-node-id="${body.id}"><div contenteditable="true">${node?.sourceId ? `<span data-type="block-ref" data-id="${node.sourceId}">${content}</span>` : content}</div></div>` };
        }
        throw new Error(`未预期的接口：${endpoint}`);
    } });
    const snapshot = { project: { projectId: '验收项目', bindingStatus: 'available' }, progressPage: { id: pageId }, chronology: { complete: true }, diagnostics: [], projections: { projectState: { id: sourceId, content: '当前状态' }, workstreams: [] }, knowledgeProducts: [], events: [] };
    const plan: MindmapPlan = { projectId: '验收项目', pageId, title: '验收项目', desired: [{ key: 'stages', parent: null, label: '阶段' }, { key: 'project-state', parent: 'stages', label: '当前状态', sourceId }], pageAttrs, rootAttrs: {}, actual: {} };
    return { client, transaction, snapshot, plan, getState: () => state, edit: () => { edited = true; } };
}

describe('项目原生导图', () => {
    it('首次创建、原地更新及重复执行保持标识并避免重复写入', async () => {
        const f = fixture();
        expect((await executeMindmapPlan(f.client, f.plan, true)).status).toBe('created');
        const previous = f.getState();
        const plan = await readMindmapPlan(f.client, createMockPermissionManager(), f.snapshot);
        plan.desired = previous.nodes.map(({ id, paragraphId, listId, ...node }: any) => ({ ...node, label: node.sourceId ? '已完成 $&' : node.label }));
        expect((await executeMindmapPlan(f.client, plan, true)).status).toBe('updated');
        expect(f.getState().nodes.map((n: any) => n.id)).toEqual(previous.nodes.map((n: any) => n.id));
        plan.previous = f.getState();
        expect((await executeMindmapPlan(f.client, plan, true)).status).toBe('unchanged');
        expect(f.transaction).toHaveBeenCalledTimes(2);
    });

    it('人工改写管理正文后停止，且不发出新事务', async () => {
        const f = fixture();
        await executeMindmapPlan(f.client, f.plan, true);
        f.edit();
        await expect(readMindmapPlan(f.client, createMockPermissionManager(), f.snapshot)).rejects.toThrow('人工修改');
        expect(f.transaction).toHaveBeenCalledTimes(1);
    });
});

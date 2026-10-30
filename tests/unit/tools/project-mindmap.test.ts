import { describe, expect, it, vi } from 'vitest';
import { executeMindmapPlan, projectMindmapNodes, readMindmapPlan, type MindmapPlan } from '@/tools/project/mindmap';
import { createMockClient } from '../../helpers/mock-client';
import { createMockPermissionManager } from '../../helpers/mock-permissions';

const pageId = '20260930000000-aaaaaaa';
const sourceId = '20260930000000-bbbbbbb';

function fixture() {
    let state: any;
    const paragraphDOMs = new Map<string, string>();
    let edited = false;
    let sourceLabel: string | undefined;
    let activeReads = 0, peakReads = 0;
    const pageAttrs: Record<string, string> = {};
    const rootAttrs: Record<string, string> = {};
    const transaction = vi.fn(async (body: any) => {
        for (const op of body.transactions[0].doOperations) {
            if (op.action === 'appendInsert') {
                const encoded = op.data.match(/custom-project-mindmap-state="([^"]+)"/)[1];
                state = JSON.parse(encoded.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
                rootAttrs['custom-sy-list-mindmap-data'] = op.data.match(/custom-sy-list-mindmap-data="([^"]+)"/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
            }
            if (op.action === 'setAttrs') {
                const attrs = JSON.parse(op.data);
                if (op.id === pageId) Object.assign(pageAttrs, attrs);
                else {
                    Object.assign(rootAttrs, attrs);
                    if (attrs['custom-project-mindmap-state']) state = JSON.parse(attrs['custom-project-mindmap-state']);
                }
            }
        }
    });
    const client = createMockClient({ request: vi.fn(async (endpoint: string, body: any) => {
        if (endpoint === '/api/block/getChildBlocks' || endpoint === '/api/block/getBlockDOM') {
            peakReads = Math.max(peakReads, ++activeReads);
            await new Promise<void>((resolve) => setImmediate(resolve));
            activeReads--;
        }
        if (endpoint === '/api/transactions') return transaction(body);
        if (endpoint === '/api/system/version') return '3.8.9';
        if (endpoint === '/api/block/updateBlock') { paragraphDOMs.set(body.id, body.data); return []; }
        if (endpoint === '/api/block/getBlockDOM') return { id: body.id, dom: paragraphDOMs.get(body.id) };
        if (endpoint === '/api/query/sql') return [{ id: pageId, root_id: pageId, box: 'nb', path: '/page.sy' }];
        if (endpoint === '/api/attr/getBlockAttrs') return body.id === pageId ? pageAttrs : { ...rootAttrs, 'custom-project-mindmap-state': JSON.stringify(state) };
        if (endpoint === '/api/block/getChildBlocks') {
            if (body.id === pageId) return [{ id: state.rootId, type: 'mindmap' }];
            const children = body.id === state.rootId ? state.nodes.filter((n: any) => !n.parent).map((n: any) => n.id)
                : state.nodes.find((n: any) => n.id === body.id) ? [state.nodes.find((n: any) => n.id === body.id).paragraphId, state.nodes.find((n: any) => n.id === body.id).listId].filter(Boolean)
                : state.nodes.filter((n: any) => n.parent === state.nodes.find((p: any) => p.listId === body.id)?.key).map((n: any) => n.id);
            return children.map((id: string) => ({ id }));
        }
        if (endpoint === '/api/block/getBlockDOMs') return Object.fromEntries(body.ids.map((id: string) => {
            const node = state.nodes.find((n: any) => n.paragraphId === id);
            const content = node ? (edited && node.sourceId ? '人工改写' : node.sourceId === sourceId && sourceLabel !== undefined ? sourceLabel : node.label) : '';
            return [id, paragraphDOMs.get(id) ?? `<div data-node-id="${id}"><div contenteditable="true">${node?.sourceId ? `<span data-type="block-ref" data-id="${node.sourceId}">${content}</span>` : content}</div></div>`];
        }));
        throw new Error(`未预期的接口：${endpoint}`);
    }) });
    const snapshot = { project: { projectId: '验收项目', bindingStatus: 'available' }, progressPage: { id: pageId }, chronology: { complete: true }, diagnostics: [], projections: { projectState: { id: sourceId, content: '当前状态' }, workstreams: [] }, knowledgeProducts: [], events: [] as any[] };
    const plan: MindmapPlan = { projectId: '验收项目', pageId, title: '验收项目', desired: [{ key: 'stages', parent: null, label: '阶段' }, { key: 'project-state', parent: 'stages', label: '当前状态', sourceId }], pageAttrs, rootAttrs: {}, actual: {} };
    return { client, transaction, snapshot, plan, getState: () => state, getPeakReads: () => peakReads, getDisplay: () => JSON.parse(rootAttrs['custom-sy-list-mindmap-data']), edit: () => { edited = true; }, refreshSource: (label?: string) => { sourceLabel = label; } };
}

describe('项目原生导图', () => {
    it('普通关系记录不占用知识原子的展示窗口', () => {
        const snapshot = fixture().snapshot;
        const knowledgeProducts = [
            ...Array.from({ length: 30 }, (_, index) => ({ id: `关系${index}`, title: '跨项目关系记录' })),
            { id: sourceId, title: '当前方法原子', name: '方法原子' },
        ];
        const nodes = projectMindmapNodes({ ...snapshot, knowledgeProducts });
        expect(nodes.filter((node) => node.parent === 'knowledge')).toEqual([
            { key: `knowledge:${sourceId}`, parent: 'knowledge', sourceId, label: '当前方法原子' },
        ]);
    });

    it('首次创建、原地更新及重复执行保持标识并避免重复写入', async () => {
        const f = fixture();
        f.snapshot.events = [{ id: '20260930000000-ccccccc', content: '旧事件' }, { id: '20260930000000-ddddddd', content: '保留事件' }];
        const oldEventKey = `event:${f.snapshot.events[0].id}`;
        const keptEventKey = `event:${f.snapshot.events[1].id}`;
        f.plan.desired.push({ key: 'events', parent: null, label: '最近更新' }, ...f.snapshot.events.map((event) => ({ key: `event:${event.id}`, parent: 'events', label: event.content, sourceId: event.id })));
        const relations = [{ fromKey: '$root', toKey: 'stages', label: '进度关系', arrowDirection: 'both' as const }, { fromKey: 'stages', toKey: oldEventKey, label: '旧事件关系' }];
        f.plan.display = { appearance: { version: 1, palette: ['#123456'], backgroundColor: '#FFFFFF', nodeStyle: 'branch' }, rootTitle: '项目导图', connectorStyle: 'orthogonal', viewLocked: true, nodes: { stages: { textColor: '#123456', bold: true }, [oldEventKey]: { bold: true } }, relations,
            summaries: [{ parentKey: 'stages', nodeKeys: ['project-state'], label: '状态概要' }, { parentKey: 'events', nodeKeys: [oldEventKey, keptEventKey], label: '事件概要' }] };
        expect((await executeMindmapPlan(f.client, f.plan, true)).status).toBe('created');
        const previous = f.getState();
        const originalDisplay = f.getDisplay();
        f.snapshot.projections.projectState.content = '已完成 $& ';
        f.refreshSource('已完成 $& ');
        const plan = await readMindmapPlan(f.client, createMockPermissionManager(), f.snapshot, { connectorStyle: 'rounded', nodes: { stages: { italic: true } }, relations: [{ fromKey: '$root', toKey: 'stages', label: '更新关系' }, relations[1]] });
        expect(f.getPeakReads()).toBeGreaterThan(1);
        expect(f.getPeakReads()).toBeLessThanOrEqual(6);
        expect(f.client.request.mock.calls.filter(([endpoint]: any[]) => endpoint === '/api/block/getBlockDOMs')).toHaveLength(1);
        plan.desired = previous.nodes.map(({ id, paragraphId, listId, ...node }: any) => ({ ...node, label: node.sourceId ? '已完成 $&' : node.label }));
        expect((await executeMindmapPlan(f.client, plan, true)).status).toBe('updated');
        f.refreshSource();
        expect(f.getState().nodes.map((n: any) => n.id)).toEqual(previous.nodes.map((n: any) => n.id));
        const updatedDisplay = f.getDisplay();
        expect(updatedDisplay).toMatchObject({ version: 2, rootTitle: '项目导图', connectorStyle: 'rounded', viewLocked: true, nodes: { [previous.nodes[0].id]: { textColor: '#123456', bold: true, italic: true } } });
        expect(updatedDisplay.relations[0]).toMatchObject({ id: originalDisplay.relations[0].id, label: '更新关系', arrowDirection: 'both' });
        expect(updatedDisplay.summaries).toEqual(originalDisplay.summaries);
        const automatic = await readMindmapPlan(f.client, createMockPermissionManager(), { ...f.snapshot, projections: { ...f.snapshot.projections, projectState: { id: sourceId, content: '已完成 $&' } } });
        automatic.desired = f.getState().nodes.map(({ id, paragraphId, listId, ...node }: any) => ({ ...node, label: node.sourceId ? '自动更新状态' : node.label }));
        expect((await executeMindmapPlan(f.client, automatic, true)).status).toBe('updated');
        expect(f.getDisplay()).toEqual(updatedDisplay);
        automatic.previous = f.getState();
        expect((await executeMindmapPlan(f.client, automatic, true)).status).toBe('unchanged');
        expect(f.getDisplay()).toEqual(updatedDisplay);
        const retired = await readMindmapPlan(f.client, createMockPermissionManager(), { ...f.snapshot, events: f.snapshot.events.slice(1) }, { rootTitle: '窗口更新后导图' });
        retired.desired = f.getState().nodes.filter((node: any) => node.key !== oldEventKey).map(({ id, paragraphId, listId, ...node }: any) => node);
        expect((await executeMindmapPlan(f.client, retired, true)).status).toBe('updated');
        const finalDisplay = f.getDisplay();
        const removedId = previous.nodes.find((node: any) => node.key === oldEventKey).id;
        expect(finalDisplay.rootTitle).toBe('窗口更新后导图');
        expect(finalDisplay.nodes).not.toHaveProperty(removedId);
        expect(finalDisplay.relations).toEqual([updatedDisplay.relations[0]]);
        expect(finalDisplay.summaries).toEqual([updatedDisplay.summaries[0], { ...updatedDisplay.summaries[1], nodeIds: [previous.nodes.find((node: any) => node.key === keptEventKey).id] }]);
        expect(f.transaction).toHaveBeenCalledTimes(4);
    });

    it('人工改写管理正文后停止，且不发出新事务', async () => {
        const f = fixture();
        await executeMindmapPlan(f.client, f.plan, true);
        await expect(readMindmapPlan(f.client, createMockPermissionManager(), f.snapshot, { nodes: { unknown: { bold: true } } })).rejects.toThrow('未知节点键');
        await expect(readMindmapPlan(f.client, createMockPermissionManager(), f.snapshot, { summaries: [
            { parentKey: '$root', nodeKeys: ['profile', 'stages'] }, { parentKey: '$root', nodeKeys: ['stages', 'knowledge'] },
        ] })).rejects.toThrow('范围交叉');
        f.edit();
        await expect(readMindmapPlan(f.client, createMockPermissionManager(), f.snapshot)).rejects.toThrow('人工修改');
        expect(f.transaction).toHaveBeenCalledTimes(1);
    });
});

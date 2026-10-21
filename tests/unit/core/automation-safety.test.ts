import { afterEach, expect, it, vi } from 'vitest';
import { SiYuanClient } from '@/api/client';
import { readAutomationStateHash, withAutomationWriteGuard } from '@/core/automation-safety';
import type { PermissionManager } from '@/core/permissions';

const source = '20261021140000-aaaaaaa';
const target = '20261021140000-bbbbbbb';
const block = '20261021140000-ccccccc';

function fixture(version = '3.8.8') {
    const client = new SiYuanClient();
    const config = { spec: 4, rules: [{ enabled: true, trigger: 'block', blockSource: { notebookIDs: ['source'] }, actions: [{ type: 'collect', target: 'current', fields: {} }] }] };
    const view = { id: target, automations: config };
    vi.spyOn(client, 'readFile').mockImplementation(async () => JSON.stringify(view));
    vi.spyOn(client, 'requestRead').mockImplementation(async (endpoint: string, data?: object): Promise<any> => {
        if (endpoint === '/api/system/version') return version;
        if (endpoint === '/api/notebook/lsNotebooks') return { notebooks: [] };
        if (endpoint === '/api/file/readDir') return [{ name: `${target}.json`, isDir: false }];
        if (endpoint === '/api/av/getMirrorDatabaseBlocks') return { refDefs: [{ refID: block }] };
        if (endpoint === '/api/block/getBlockDOM') return { dom: `<div data-type="NodeAttributeView" data-av-id="${target}"></div>` };
        if (endpoint === '/api/query/sql') {
            return (data as any).stmt.includes("type = 'av'") ? [{ id: block }]
                : [{ id: (data as any).stmt.includes(source) ? source : block, root_id: source, box: (data as any).stmt.includes(source) ? 'source' : 'target', path: `/${source}.sy` }];
        }
        throw new Error(`未模拟接口 ${endpoint}`);
    });
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ code: 0, data: null })));
    const permissions = (targetWritable: boolean) => ({ canRead: () => true, canWrite: (id: string) => id === 'source' || targetWritable }) as unknown as PermissionManager;
    return { client, view, fetch, permissions };
}

afterEach(() => { vi.restoreAllMocks(); });

it('来源普通块更新受全局收集规则约束，拒绝只读目标且没有网络写入', async () => {
    const { client, fetch, permissions } = fixture('3.8.8-dev1');
    await expect(withAutomationWriteGuard(client, permissions(false), () => client.requestWrite('/api/attr/setBlockAttrs', { id: source, attrs: { 'custom-topic': '项目' } })))
        .rejects.toMatchObject({ code: 'permission_denied' });
    expect(fetch).not.toHaveBeenCalled();
});

it('授权范围内提交一次，规则变化进入预检摘要，规则停用不再触发旧规则', async () => {
    const { client, view, fetch, permissions } = fixture();
    const before = await readAutomationStateHash(client);
    await withAutomationWriteGuard(client, permissions(true), () => client.requestWrite('/api/attr/setBlockAttrs', { id: source, attrs: { 'custom-topic': '项目' } }));
    expect(fetch).toHaveBeenCalledTimes(1);
    view.automations.rules[0].enabled = false;
    expect(await readAutomationStateHash(client)).not.toBe(before);
    await withAutomationWriteGuard(client, permissions(true), () => client.requestWrite('/api/transactions', { transactions: [{ doOperations: [{ action: 'setAttrViewAutomations', avID: target, data: view.automations }] }] }));
    expect(fetch).toHaveBeenCalledTimes(2);
});

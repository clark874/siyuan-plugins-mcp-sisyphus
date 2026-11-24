import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callAvTool } from '@/tools/av';
import { ensurePermissionForAvId, listVerifiedAvMirrorBlockIds } from '@/tools/av/handlers';
import { ensurePermissionForDocumentId } from '@/tools/internal/context';
import { callOfficialMcpTool } from '@/core/official-mcp-bridge';
import { buildDefaultToolConfig } from '@/core/config';
import { readAvViewWriteState } from '@/tools/av/views';
import { createJsonResult, createPermissionDeniedResult } from '@/tools/internal/shared';
import type { SiYuanClient } from '@/api/client';
import type { PermissionManager } from '@/core/permissions';

vi.mock('@/api/system', () => ({ requireKernel389: vi.fn(async () => undefined) }));
vi.mock('@/core/official-mcp-bridge', () => ({ callOfficialMcpTool: vi.fn() }));
vi.mock('@/tools/av/handlers', () => ({
    AV_ACTION_HANDLERS: {},
    ensurePermissionForAvId: vi.fn(),
    listVerifiedAvMirrorBlockIds: vi.fn(),
}));
vi.mock('@/tools/internal/context', () => ({ ensurePermissionForDocumentId: vi.fn() }));

const avID = '20261124110000-avtest1';
const blockID = '20261124110000-block01';
const viewID = '20261124110000-view001';
const mirrorID = '20261124110000-mirror1';
const keyID = '20261124110000-key0001';
const client = {} as SiYuanClient;
const permissions = {} as PermissionManager;
const current = { id: avID, blockID, viewID, revision: 'old', views: [{ id: viewID }], visibleViewIDs: [viewID], sorts: [] };
const sorts = [{ column: keyID, order: 'DESC' }];
const configured = { ...current, revision: 'new', sorts };
const settings = { action: 'view_configure', avID, blockID, viewID, operation: 'set_sorts', sorts, revision: 'old' };

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensurePermissionForAvId).mockResolvedValue({ denied: null, avData: { views: [{ id: viewID }] } });
    vi.mocked(listVerifiedAvMirrorBlockIds).mockResolvedValue([blockID, mirrorID]);
    vi.mocked(ensurePermissionForDocumentId).mockResolvedValue({ context: { notebook: 'notebook', documentId: 'doc', path: '/doc.sy' }, denied: null });
});

describe('数据库视图配置', () => {
    it('用内核修订值写入并独立回读，同时在严格预检中识别旧修订值', async () => {
        vi.mocked(callOfficialMcpTool).mockResolvedValueOnce(createJsonResult({ data: current }))
            .mockResolvedValueOnce(createJsonResult({ data: configured }))
            .mockResolvedValue(createJsonResult({ data: configured }));
        const result = await callAvTool(client, settings, buildDefaultToolConfig().av, permissions);
        expect(result.isError).toBeUndefined();
        expect(JSON.parse(result.content[0].text)).toMatchObject({ sorts, verification: { status: 'verified' } });
        expect(callOfficialMcpTool).toHaveBeenNthCalledWith(2, client, 'database', { action: 'view_sorts_set', id: avID, blockID, viewID, revision: 'old', sorts });
        expect(callOfficialMcpTool).toHaveBeenNthCalledWith(3, client, 'database', { action: 'view_get', id: avID, blockID, viewID });
        await expect(readAvViewWriteState(client, permissions, { ...settings, validateOnly: true })).rejects.toMatchObject({ code: 'state_changed' });
    });

    it('共享镜像只读时在调用原生工具前拒绝', async () => {
        vi.mocked(ensurePermissionForDocumentId).mockResolvedValueOnce({
            context: { notebook: 'restricted', documentId: 'doc', path: '/doc.sy' },
            denied: createPermissionDeniedResult('restricted', 'r', 'write'),
        });
        const result = await callAvTool(client, settings, buildDefaultToolConfig().av, permissions);
        expect(result.isError).toBe(true);
        expect(JSON.parse(result.content[0].text).error.type).toBe('permission_denied');
        expect(callOfficialMcpTool).not.toHaveBeenCalled();
    });
});

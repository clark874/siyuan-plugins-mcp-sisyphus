import { describe, expect, it, vi } from 'vitest';

import { WriteSafetyCoordinator } from '@/core/write-safety-coordinator';
import { createMockPermissionManager } from '../../helpers/mock-permissions';
import { parseResult } from '../../helpers/parse-result';

function uuidV7(now = Date.now(), suffix = '000000000002') {
    const timestamp = now.toString(16).padStart(12, '0');
    return `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-7000-8000-${suffix}`;
}

function success(payload: Record<string, unknown>) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], structuredContent: payload };
}

describe('严格安全写入协调器', () => {
    it('为仅需请求编号的新增动作签发编号且不执行', async () => {
        const execute = vi.fn();
        const client = { readFile: vi.fn(async () => { throw new Error('HTTP error: 404 Not Found'); }), requestRead: vi.fn() } as never;
        const result = parseResult(await new WriteSafetyCoordinator(client).run({
            client,
            permMgr: createMockPermissionManager(),
            category: 'block',
            action: 'append',
            args: { action: 'append', parentID: '20260821000000-parent1', dataType: 'markdown', data: '新增正文', validateOnly: true },
            strictMode: true,
            execute,
        }));
        expect(result).toMatchObject({ validateOnly: true, writeExecuted: false, mutationProtocol: 'request-id-only' });
        expect(result.issuedRequestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(execute).not.toHaveBeenCalled();
    });

    it('拒绝缺失或格式错误的严格写入凭据', async () => {
        const client = { readFile: vi.fn(async () => { throw new Error('HTTP error: 404 Not Found'); }), requestRead: vi.fn() } as never;
        const coordinator = new WriteSafetyCoordinator(client);
        const base = {
            client, permMgr: createMockPermissionManager(), category: 'block' as const,
            action: 'update', strictMode: true, execute: vi.fn(),
        };
        const missing = parseResult(await coordinator.run({ ...base, args: { action: 'update', id: '20260812000000-abcdefg' } }));
        expect(missing.error).toMatchObject({ type: 'validation_error', code: 'precondition_required' });
        const malformed = parseResult(await coordinator.run({ ...base, args: { action: 'update', id: '20260812000000-abcdefg', requestId: 'not-a-uuidv7' } }));
        expect(malformed.error).toMatchObject({ type: 'validation_error', code: 'invalid_request_id' });
    });

    it('完成状态预检、单次提交和请求编号重放', async () => {
        let updated = '20260812010101';
        const client = {
            readFile: vi.fn(async () => { throw new Error('HTTP error: 404 Not Found'); }),
            writeFile: vi.fn(async () => undefined),
            requestRead: vi.fn(async (endpoint: string) => {
                if (endpoint === '/api/block/checkBlockExist') return true;
                if (endpoint === '/api/block/getBlockInfo') return { id: '20260812000000-abcdefg', box: 'nb-1', updated };
                if (endpoint === '/api/attr/getBlockAttrs') return {};
                if (endpoint === '/api/block/getBlockKramdown') return { kramdown: updated };
                if (endpoint === '/api/block/getChildBlocks' || endpoint === '/api/query/sql') return [];
                return null;
            }),
        } as never;
        const permMgr = createMockPermissionManager({ canWrite: () => true, canDelete: () => true });
        permMgr.get = vi.fn(() => 'rwd');
        permMgr.getAll = vi.fn(() => ({ 'nb-1': 'rwd' }));
        const coordinator = new WriteSafetyCoordinator(client);
        const baseArgs = { action: 'update', id: '20260812000000-abcdefg' };
        const preflight = parseResult(await coordinator.run({
            client, permMgr, category: 'block', action: 'update', args: { ...baseArgs, validateOnly: true }, strictMode: true, execute: vi.fn(),
        }));
        expect(preflight.stateHash).toMatch(/^sha256:v1:[a-f0-9]{4}$/);

        const execute = vi.fn(async () => { updated = '20260812020202'; return success({ success: true }); });
        const args = { ...baseArgs, requestId: String(preflight.issuedRequestId), expectedStateHash: String(preflight.stateHash) };
        const committed = parseResult(await coordinator.run({ client, permMgr, category: 'block', action: 'update', args, strictMode: true, execute }));
        expect(committed.safety).toMatchObject({ transactionState: 'committed', writeExecuted: true });
        const replayed = parseResult(await coordinator.run({ client, permMgr, category: 'block', action: 'update', args, strictMode: true, execute }));
        expect(replayed.replayed).toBe(true);
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('严格模式关闭时不接受 validateOnly', async () => {
        const execute = vi.fn();
        const result = parseResult(await new WriteSafetyCoordinator({} as never).run({
            client: {} as never, permMgr: createMockPermissionManager(), category: 'tag', action: 'remove',
            args: { action: 'remove', label: 'obsolete', validateOnly: true }, strictMode: false, execute,
        }));
        expect(result.error.code).toBe('strict_mode_disabled');
        expect(execute).not.toHaveBeenCalled();
    });

    it('第三方扩展副作用不执行 validateOnly', async () => {
        const execute = vi.fn();
        const result = parseResult(await new WriteSafetyCoordinator({} as never).run({
            client: {} as never, permMgr: createMockPermissionManager(), category: 'extension', action: 'third_party_write',
            args: { action: 'third_party_write', validateOnly: true }, strictMode: true, execute,
        }));
        expect(result.error.code).toBe('preflight_unavailable');
        expect(execute).not.toHaveBeenCalled();
    });
});

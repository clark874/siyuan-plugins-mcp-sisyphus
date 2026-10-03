import { describe, expect, it, vi } from 'vitest';

import { WRITE_SAFETY_LEDGER_PATH, WriteSafetyLedger } from '@/core/write-safety-ledger';
import { hashWriteState } from '@/core/write-safety-hash';

function uuidV7(now = Date.now(), suffix = '000000000001') {
    const timestamp = now.toString(16).padStart(12, '0');
    return `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-7000-8000-${suffix}`;
}

describe('write safety ledger', () => {
    it('并发首次读取仅迁移一次，重启后保留请求状态且只写新位置', async () => {
        const legacyPath = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/writeSafetyLedger';
        const requestId = uuidV7();
        const args = { action: 'update', id: 'block-1', data: 'body' };
        const entry = {
            requestId, tool: 'block', action: 'update', argsHash: hashWriteState(args),
            targetIds: ['block-1'], state: 'committed', createdAt: Date.now(), updatedAt: Date.now(),
        };
        const files: Record<string, string> = { [legacyPath]: JSON.stringify({ version: 1, entries: [entry] }) };
        const client = {
            readFile: vi.fn(async (path: string) => files[path] ?? JSON.stringify({ code: 404, msg: 'missing' })),
            writeFile: vi.fn(async (path: string, content: string) => { files[path] = content; }),
        };
        const ledger = new WriteSafetyLedger(client as never);
        const results = await Promise.all([
            ledger.inspect(requestId, 'block', 'update', args),
            ledger.inspect(requestId, 'block', 'update', args),
        ]);
        expect(results.map((result) => result.entry?.state)).toEqual(['committed', 'committed']);
        expect(client.writeFile).toHaveBeenCalledTimes(1);
        expect(client.writeFile.mock.calls[0][0]).toBe(WRITE_SAFETY_LEDGER_PATH);
        expect(JSON.parse(files[legacyPath]).entries[0]).toEqual(entry);
        const restarted = new WriteSafetyLedger(client as never);
        expect((await restarted.inspect(requestId, 'block', 'update', args)).entry?.state).toBe('committed');
        await expect(restarted.inspect(requestId, 'block', 'delete', { action: 'delete' }))
            .rejects.toMatchObject({ code: 'idempotency_conflict' });
        await restarted.record({ ...entry, tool: 'block', state: 'unknown' });
        expect(client.writeFile.mock.calls.every(([path]) => path === WRITE_SAFETY_LEDGER_PATH)).toBe(true);
    });

    it('迁移写入失败时拒绝读取成功，重试仍须完成落盘；损坏的新账本不回退旧位置', async () => {
        const client = {
            readFile: vi.fn(async (path: string) => path === WRITE_SAFETY_LEDGER_PATH
                ? JSON.stringify({ code: 404, msg: 'missing' }) : JSON.stringify({ version: 1, entries: [] })),
            writeFile: vi.fn().mockRejectedValueOnce(new Error('storage unavailable')).mockResolvedValue(undefined),
        };
        const ledger = new WriteSafetyLedger(client as never);
        await expect(ledger.inspect(uuidV7(), 'fs', 'write', { action: 'write' }))
            .rejects.toMatchObject({ code: 'write_ledger_unavailable' });
        await ledger.inspect(uuidV7(), 'fs', 'write', { action: 'write' });
        expect(client.writeFile).toHaveBeenCalledTimes(2);
        client.readFile.mockResolvedValue('{broken');
        await expect(new WriteSafetyLedger(client as never).inspect(uuidV7(), 'fs', 'write', { action: 'write' }))
            .rejects.toMatchObject({ code: 'write_ledger_unavailable' });
        client.readFile.mockResolvedValue('');
        await expect(new WriteSafetyLedger(client as never).inspect(uuidV7(), 'fs', 'write', { action: 'write' }))
            .rejects.toMatchObject({ code: 'write_ledger_unavailable' });
        expect(client.writeFile).toHaveBeenCalledTimes(2);
    });

    it('initializes an empty ledger from SiYuan getFile missing-file envelope', async () => {
        const writes: string[] = [];
        const client = {
            readFile: vi.fn(async () => JSON.stringify({ code: 404, msg: 'file does not exist', data: null })),
            writeFile: vi.fn(async (_path: string, content: string) => { writes.push(content); }),
        } as never;
        const ledger = new WriteSafetyLedger(client);
        const requestId = uuidV7();
        const inspected = await ledger.inspect(requestId, 'fs', 'write', {
            action: 'write',
            path: '/Test/New',
            markdown: 'body',
        });

        await ledger.record({
            requestId,
            tool: 'fs',
            action: 'write',
            argsHash: inspected.argsHash,
            targetIds: ['/Test/New'],
            state: 'executing',
        });

        expect(JSON.parse(writes[0])).toMatchObject({
            version: 1,
            entries: [{ requestId, state: 'executing' }],
        });
    });

    it('fails closed for non-404 SiYuan file API envelopes', async () => {
        const client = {
            readFile: vi.fn(async () => JSON.stringify({ code: 500, msg: 'storage unavailable: backing service not found', data: null })),
            writeFile: vi.fn(),
        } as never;
        const ledger = new WriteSafetyLedger(client);

        await expect(ledger.inspect(uuidV7(), 'fs', 'write', { action: 'write' }))
            .rejects.toMatchObject({ code: 'write_ledger_unavailable' });
    });

    it('persists metadata hashes without storing note bodies and rejects requestId reuse', async () => {
        const writes: string[] = [];
        const client = {
            readFile: vi.fn(async () => { throw new Error('HTTP error: 404 Not Found'); }),
            writeFile: vi.fn(async (_path: string, content: string) => { writes.push(content); }),
        } as never;
        const ledger = new WriteSafetyLedger(client);
        const requestId = uuidV7();
        const args = { action: 'update', id: 'block-1', data: 'SECRET NOTE BODY' };
        const inspected = await ledger.inspect(requestId, 'block', 'update', args);
        await ledger.record({
            requestId,
            tool: 'block',
            action: 'update',
            argsHash: inspected.argsHash,
            targetIds: ['block-1'],
            state: 'committed',
            result: { resultHash: 'sha256:v1:abc' },
        });

        expect(writes[writes.length - 1]).not.toContain('SECRET NOTE BODY');
        await expect(ledger.inspect(requestId, 'block', 'delete', { action: 'delete' }))
            .rejects.toMatchObject({ code: 'idempotency_conflict' });
    });
});

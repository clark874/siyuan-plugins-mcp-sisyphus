import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/recovery-point', async () => {
    const actual = await vi.importActual<typeof import('@/core/recovery-point')>('@/core/recovery-point');
    return { ...actual, createDestructiveRecoveryPoint: vi.fn() };
});

import { createDestructiveRecoveryPoint } from '@/core/recovery-point';
import { WriteSafetyCoordinator } from '@/core/write-safety-coordinator';
import { parseResult } from '../../helpers/parse-result';

function uuidV7(now = Date.now(), suffix = '000000000101') {
    const timestamp = now.toString(16).padStart(12, '0');
    return `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-7000-8000-${suffix}`;
}

function permissionManager() {
    return {
        reload: vi.fn(async () => undefined),
        get: vi.fn(() => 'rwd'),
        getAll: vi.fn(() => ({ 'nb-1': 'rwd' })),
        canRead: vi.fn(() => true),
        canWrite: vi.fn(() => true),
        canDelete: vi.fn(() => true),
    } as never;
}

describe('write safety reference and recovery integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('rejects a destructive preflight when external references exist', async () => {
        const id = '20260822000000-target1';
        const client = {
            readFile: vi.fn(async () => { throw new Error('HTTP error: 404 Not Found'); }),
            requestRead: vi.fn(async (endpoint: string, payload?: Record<string, unknown>) => {
                if (endpoint === '/api/block/checkBlockExist') return true;
                if (endpoint === '/api/block/getBlockInfo') return { id, box: 'nb-1' };
                if (endpoint === '/api/attr/getBlockAttrs') return {};
                if (endpoint === '/api/block/getBlockKramdown') return { kramdown: 'target' };
                if (endpoint === '/api/block/getChildBlocks') return [];
                if (endpoint === '/api/query/sql' && String(payload?.stmt).includes('FROM refs')) {
                    return [{ def_block_id: id, block_id: '20260822000000-source1', root_id: '20260822000000-doc0001', box: 'nb-1', markdown: `((${id}))` }];
                }
                if (endpoint === '/api/query/sql') return [];
                return null;
            }),
        };
        const execute = vi.fn();

        const result = parseResult(await new WriteSafetyCoordinator(client as never).run({
            client: client as never,
            permMgr: permissionManager(),
            category: 'block',
            action: 'delete',
            args: { action: 'delete', id, validateOnly: true },
            strictMode: true,
            referenceProtection: true,
            autoRecovery: 'required_for_destructive',
            execute,
        }));

        expect(result.error).toMatchObject({ code: 'reference_conflict' });
        expect(result.error.referenceImpact.externalReferenceCount).toBe(1);
        expect(execute).not.toHaveBeenCalled();
        expect(createDestructiveRecoveryPoint).not.toHaveBeenCalled();
    });

    it('creates one required recovery point before executing an approved delete', async () => {
        const id = '20260822000000-target1';
        let exists = true;
        const files = new Map<string, string>();
        const client = {
            readFile: vi.fn(async (path: string) => {
                const value = files.get(path);
                if (value === undefined) throw new Error('HTTP error: 404 Not Found');
                return value;
            }),
            writeFile: vi.fn(async (path: string, value: string) => { files.set(path, value); }),
            requestRead: vi.fn(async (endpoint: string) => {
                if (endpoint === '/api/block/checkBlockExist') return exists;
                if (endpoint === '/api/block/getBlockInfo') return exists ? { id, box: 'nb-1' } : null;
                if (endpoint === '/api/attr/getBlockAttrs') return {};
                if (endpoint === '/api/block/getBlockKramdown') return exists ? { kramdown: 'target' } : null;
                if (endpoint === '/api/block/getChildBlocks' || endpoint === '/api/query/sql') return [];
                return null;
            }),
        };
        vi.mocked(createDestructiveRecoveryPoint).mockResolvedValue({
            created: true,
            replayed: false,
            name: 'recovery',
            snapshotId: 'snapshot-1',
            tag: 'tag-1',
            targetIds: [id],
        });
        const coordinator = new WriteSafetyCoordinator(client as never);
        const args = { action: 'delete', id, referencePolicy: 'break' };
        const preflight = parseResult(await coordinator.run({
            client: client as never,
            permMgr: permissionManager(),
            category: 'block',
            action: 'delete',
            args: { ...args, validateOnly: true },
            strictMode: true,
            referenceProtection: true,
            autoRecovery: 'required_for_destructive',
            execute: vi.fn(),
        }));
        const requestId = uuidV7();
        const result = parseResult(await coordinator.run({
            client: client as never,
            permMgr: permissionManager(),
            category: 'block',
            action: 'delete',
            args: { ...args, requestId, expectedStateHash: preflight.stateHash },
            strictMode: true,
            referenceProtection: true,
            autoRecovery: 'required_for_destructive',
            execute: vi.fn(async () => {
                exists = false;
                return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, removed: 1 }) }] };
            }),
        }));

        expect(createDestructiveRecoveryPoint).toHaveBeenCalledOnce();
        expect(result.safety).toMatchObject({
            transactionState: 'committed',
            recoveryPoint: { snapshotId: 'snapshot-1', tag: 'tag-1' },
        });
    });
});

import { describe, expect, it } from 'vitest';

import {
    recordProvenanceEvent,
    readProvenanceWriteState,
    resolveAgentSessionLink,
    validateLocalAgentSession,
} from '@/core/provenance';
import { createMockClient } from '../../helpers/mock-client';

describe('Agent 会话溯源核心', () => {
    it('为 Codex 返回已核验的原生深链和统一启动链接', () => {
        const link = resolveAgentSessionLink({ provider: 'codex', sessionId: '0199-example', hostAlias: 'local' });
        expect(link.linkCapability).toBe('native');
        expect(link.nativeUrl).toBe('codex://threads/0199-example');
        expect(link.launcherUrl).toContain('action=open-agent-session');
        expect(link.resumeCommand).toContain('codex resume');
    });

    it('不把 ZCode 恢复命令宣称为原生深链', () => {
        const link = resolveAgentSessionLink({ provider: 'zcode', sessionId: 'sess_demo', hostAlias: 'local' });
        expect(link.linkCapability).toBe('resume_command');
        expect(link.nativeUrl).toBeUndefined();
        expect(link.resumeCommand).toBe("zcode --resume 'sess_demo'");
    });

    it('对远端 hostAlias 不读取本机 rollout', () => {
        expect(validateLocalAgentSession({ provider: 'codex', sessionId: 'x', hostAlias: 'lab-mac' })).toEqual({
            status: 'remote',
            checkedBy: 'host_alias',
        });
    });

    it('创建会话、事件与原子最近摘要，并以 eventId 幂等复跑', async () => {
        const attrs = new Map<string, Record<string, string>>();
        let inserted = 0;
        const client = createMockClient({
            request: async (endpoint: string, body: Record<string, unknown>) => {
                if (endpoint === '/api/query/sql') return [];
                if (endpoint === '/api/block/appendBlock') {
                    inserted += 1;
                    return [{ doOperations: [{ id: `new-${inserted}` }] }];
                }
                if (endpoint === '/api/attr/setBlockAttrs') {
                    attrs.set(String(body.id), { ...(attrs.get(String(body.id)) || {}), ...(body.attrs as Record<string, string>) });
                    return null;
                }
                if (endpoint === '/api/attr/batchSetBlockAttrs') {
                    for (const item of body.blockAttrs as Array<{ id: string; attrs: Record<string, string> }>) attrs.set(item.id, { ...(attrs.get(item.id) || {}), ...item.attrs });
                    return null;
                }
                if (endpoint === '/api/attr/getBlockAttrs') return attrs.get(String(body.id)) || {};
                return null;
            },
        });
        const input = {
            projectBlockId: 'project-hub', projectId: 'project-a', eventId: 'event-1', operation: 'compile',
            sourceSession: { provider: 'codex' as const, sessionId: 'codex-1', captureMethod: 'environment' as const },
            compileSession: { provider: 'zcode' as const, sessionId: 'sess-2', captureMethod: 'explicit' as const },
            targetAtomIds: ['atom-1'], occurredAt: '2026-09-01T00:00:00.000Z',
        };
        const first = await recordProvenanceEvent(client, input);
        const completeState = await readProvenanceWriteState(client, 'record_event', input);
        delete attrs.get('atom-1')!['custom-compile-session'];
        const incompleteState = await readProvenanceWriteState(client, 'record_event', input);
        expect(incompleteState.hash).not.toBe(completeState.hash);
        const second = await recordProvenanceEvent(client, input);
        const repairedState = await readProvenanceWriteState(client, 'record_event', input);
        expect(first.replayed).toBe(false);
        expect(second.replayed).toBe(true);
        expect(inserted).toBe(3);
        expect(attrs.get('atom-1')).toMatchObject({
            'custom-source-session': 'codex-1',
            'custom-compile-session': 'sess-2',
            'custom-provenance-event': 'event-1',
        });
        expect(repairedState.hash).toBe(completeState.hash);
        await expect(recordProvenanceEvent(client, { ...input, operation: 'different-operation' }))
            .rejects.toThrow(/已用于不同的知识化事件/);
        expect(inserted).toBe(3);
    });
});

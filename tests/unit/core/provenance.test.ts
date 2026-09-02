import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
    discoverLocalAgentSessions,
    hermesSessionExists,
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

    it('为 Hermes 返回已核验的 --resume 命令，不虚构 hermes://', () => {
        const link = resolveAgentSessionLink({ provider: 'hermes', sessionId: '20260901_013451_2821c5', hostAlias: 'local' });
        expect(link.linkCapability).toBe('resume_command');
        expect(link.nativeUrl).toBeUndefined();
        expect(link.preferredUrl).toBeUndefined();
        expect(link.resumeCommand).toBe("hermes --resume '20260901_013451_2821c5'");
        expect(link.launcherUrl).toContain('provider=hermes');
    });

    it('在隔离的 Hermes home 中按 state.db 字节核验会话存在性', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-provenance-'));
        try {
            fs.writeFileSync(path.join(root, 'state.db'), Buffer.from('noise 20260901_013451_2821c5 more'));
            expect(hermesSessionExists('20260901_013451_2821c5', root)).toBe(true);
            expect(hermesSessionExists('missing-session', root)).toBe(false);
            expect(validateLocalAgentSession({ provider: 'hermes', sessionId: 'definitely-absent-session-id', hostAlias: 'local' }).checkedBy).toBe('hermes_state_db');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('discover 列出 ZCode rollout 候选：剥前缀取 sessionId、按新旧排序、标记活跃与限额', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zcode-discover-'));
        try {
            const rolloutDir = path.join(home, '.zcode', 'cli', 'rollout');
            fs.mkdirSync(rolloutDir, { recursive: true });
            const now = Date.now();
            const active = path.join(rolloutDir, 'model-io-sess_active-0001.jsonl');
            const stale = path.join(rolloutDir, 'model-io-sess_stale-0002.jsonl');
            fs.writeFileSync(active, 'a');
            fs.writeFileSync(stale, 'b');
            fs.utimesSync(active, new Date(now - 30 * 1000), new Date(now - 30 * 1000));
            fs.utimesSync(stale, new Date(now - 2 * 3600 * 1000), new Date(now - 2 * 3600 * 1000));
            const result = discoverLocalAgentSessions('zcode', { homeDir: home, activeWindowSeconds: 60 });
            expect(result.rootExists).toBe(true);
            expect(result.candidates.map((c) => c.sessionId)).toEqual(['sess_active-0001', 'sess_stale-0002']);
            expect(result.candidates[0].recentlyActive).toBe(true);
            expect(result.candidates[1].recentlyActive).toBe(false);
            expect(result.notice).toContain('不推断');
            const limited = discoverLocalAgentSessions('zcode', { homeDir: home, limit: 1 });
            expect(limited.candidates).toHaveLength(1);
            expect(limited.candidates[0].sessionId).toBe('sess_active-0001');
        } finally {
            fs.rmSync(home, { recursive: true, force: true });
        }
    });

    it('discover 递归收集 Codex 嵌套会话并从文件名提取 UUID', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-discover-'));
        try {
            const nested = path.join(home, '.codex', 'sessions', '2026', '09', '02');
            fs.mkdirSync(nested, { recursive: true });
            fs.writeFileSync(path.join(nested, 'rollout-2026-09-02T15-43-12-3f2b8c41-9d5e-4a67-8b1f-2c9d0e5a7b31.jsonl'), 'x');
            const result = discoverLocalAgentSessions('codex', { homeDir: home });
            expect(result.candidates).toHaveLength(1);
            expect(result.candidates[0].sessionId).toBe('3f2b8c41-9d5e-4a67-8b1f-2c9d0e5a7b31');
        } finally {
            fs.rmSync(home, { recursive: true, force: true });
        }
    });

    it('discover 对未适配 provider 与缺失目录返回空候选而不抛错', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-empty-'));
        try {
            const unsupported = discoverLocalAgentSessions('kimi', { homeDir: home });
            expect(unsupported.candidates).toEqual([]);
            expect(unsupported.notice).toContain('暂无本机会话目录适配');
            const missing = discoverLocalAgentSessions('zcode', { homeDir: home });
            expect(missing.rootExists).toBe(false);
            expect(missing.candidates).toEqual([]);
        } finally {
            fs.rmSync(home, { recursive: true, force: true });
        }
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

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../agent-kit/scripts/capture-agent-session.cjs');

function capture(env: NodeJS.ProcessEnv, args: string[] = []) {
    const clean: NodeJS.ProcessEnv = { ...process.env };
    for (const key of ['CODEX_THREAD_ID', 'CODEX_SESSION_ID', 'ZCODE_SESSION_ID', 'CLAUDE_SESSION_ID', 'KIMI_SESSION_ID', 'CURSOR_SESSION_ID', 'AGENT_SESSION_ID', 'HERMES_SESSION_ID', 'HERMES_SESSION_KEY']) {
        delete clean[key];
    }
    return JSON.parse(execFileSync(process.execPath, [script, ...args], {
        env: { ...clean, ...env },
        encoding: 'utf8',
    }));
}

describe('capture-agent-session', () => {
    it('从 HERMES_SESSION_ID 捕获 Hermes 会话且不推断 rollout', () => {
        const payload = capture({
            HERMES_SESSION_ID: '20260901_013451_2821c5',
            CODEX_THREAD_ID: '',
            CODEX_SESSION_ID: '',
            ZCODE_SESSION_ID: '',
        });
        expect(payload).toMatchObject({
            provider: 'hermes',
            sessionId: '20260901_013451_2821c5',
            captureMethod: 'environment',
            environmentVariable: 'HERMES_SESSION_ID',
        });
        expect(payload.warning).toBeUndefined();
    });

    it('显式 --provider hermes 读取 HERMES_SESSION_KEY', () => {
        const payload = capture({
            HERMES_SESSION_ID: '',
            HERMES_SESSION_KEY: '20260831_144259_4504dd',
        }, ['--provider', 'hermes']);
        expect(payload.sessionId).toBe('20260831_144259_4504dd');
        expect(payload.environmentVariable).toBe('HERMES_SESSION_KEY');
    });
});

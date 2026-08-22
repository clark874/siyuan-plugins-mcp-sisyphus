import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import { HttpServerLauncher } from '@/server-launcher';

class FakeChild extends EventEmitter {
    pid = 424242;
    exitCode: number | null = null;
    signalCode: string | null = null;
    killed = false;
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    kill = vi.fn(() => {
        this.killed = true;
        return true;
    });
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function launcherWithProbe(probe: () => Promise<{ state: 'ready' | 'degraded'; detail?: string }>) {
    const child = new FakeChild();
    const launcher = new HttpServerLauncher('/tmp/mcp-server.cjs', {
        readinessProbe: probe,
        startupDelayMs: 0,
    });
    (launcher as any).childProcess = {
        spawn: vi.fn(() => child),
        spawnSync: vi.fn(() => ({ status: 1, stdout: '', stderr: '' })),
    };
    return { launcher, child };
}

describe('HttpServerLauncher readiness states', () => {
    it('does not report ready merely because the child spawned', async () => {
        const readiness = deferred<{ state: 'ready' }>();
        const { launcher } = launcherWithProbe(() => readiness.promise);

        expect(launcher.getStatus()).toMatchObject({ state: 'stopped', running: false });
        const starting = launcher.start({ host: '127.0.0.1', port: 36806, token: 'hidden' });
        await vi.waitFor(() => expect(launcher.getStatus().state).toBe('listening'));
        expect(launcher.getStatus().running).toBe(true);
        expect(launcher.getStatus().state).not.toBe('ready');

        readiness.resolve({ state: 'ready' });
        await starting;
        expect(launcher.getStatus()).toMatchObject({ state: 'ready', running: true });
    });

    it('preserves a degraded readiness result instead of claiming ready', async () => {
        const { launcher } = launcherWithProbe(async () => ({ state: 'degraded', detail: 'bootstrap_failed' }));

        await launcher.start({ host: '127.0.0.1', port: 36806 });

        expect(launcher.getStatus()).toMatchObject({
            state: 'degraded',
            running: true,
            lastError: 'bootstrap_failed',
        });
    });

    it('moves to failed when the readiness probe cannot reach the spawned server', async () => {
        const { launcher } = launcherWithProbe(async () => {
            throw new Error('gateway_not_running');
        });

        await expect(launcher.start({ host: '127.0.0.1', port: 36806 })).rejects.toThrow('gateway_not_running');
        expect(launcher.getStatus()).toMatchObject({ state: 'failed', running: true });
    });
});

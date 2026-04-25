import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('siyuan', () => ({
    Plugin: class {},
    showMessage: vi.fn(),
    Dialog: class {},
}), { virtual: true });

vi.mock('@/ui/setting/mcp-config.svelte', () => ({
    default: class {
        $destroy() {}
    },
}));

vi.mock('@/ui/components/ToolPuppy.svelte', () => ({
    default: class {
        constructor(_: unknown) {}
        $set(_: unknown) {}
        $destroy() {}
    },
}));

import SiyuanMCP from '@/index';
import { resetToolConfigWarningStateForTests } from '@/core/config';
import type { HttpServerSettings } from '@/ui/setting/tool-config-storage';

import { HttpServerLauncher } from '@/server-launcher';
import { showMessage } from 'siyuan';

describe('HTTP settings sync', () => {
    let plugin: SiyuanMCP;
    let saveData: ReturnType<typeof vi.fn>;
    let loadData: ReturnType<typeof vi.fn>;
    let launcherStart: ReturnType<typeof vi.fn>;
    let launcherStop: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        resetToolConfigWarningStateForTests();
        vi.mocked(showMessage).mockClear();
        plugin = new SiyuanMCP();
        loadData = vi.fn().mockResolvedValue(undefined);
        saveData = vi.fn().mockResolvedValue(undefined);
        launcherStart = vi.fn().mockResolvedValue(undefined);
        launcherStop = vi.fn().mockResolvedValue(undefined);

        Object.assign(plugin, {
            name: 'siyuan-plugins-mcp-sisyphus',
            loadData,
            saveData,
        });
        plugin.httpLauncher = {
            start: launcherStart,
            stop: launcherStop,
            getStatus: vi.fn(() => ({ running: false, host: '127.0.0.1', port: 36806 })),
        } as any;

        (globalThis as any).window = {
            siyuan: {
                config: {
                    api: { token: 'siyuan-token' },
                    system: { workspaceDir: '/mock/workspace' },
                },
            },
        };

        vi.restoreAllMocks();
    });

    it('syncs settings into plugin state before start', async () => {
        const next: HttpServerSettings = {
            enabled: false,
            host: '127.0.0.1',
            port: 39000,
            token: '12345678-token',
            authEnabled: true,
            tlsEnabled: false,
            tlsCertFile: '',
            tlsKeyFile: '',
            tlsCaFile: '',
        };

        await plugin.setHttpServerSettings(next);
        await plugin.startHttpServer();

        expect(plugin.httpSettings.port).toBe(39000);
        expect(saveData).toHaveBeenCalledWith('mcpHttpSettings', expect.objectContaining({ port: 39000 }));
        expect(launcherStart).toHaveBeenCalledWith(expect.objectContaining({
            host: '127.0.0.1',
            port: 39000,
            token: '12345678-token',
            siyuanToken: 'siyuan-token',
        }));
    });

    it('restarts running server with updated settings', async () => {
        const getStatus = vi.fn(() => ({ running: true, host: '127.0.0.1', port: 36806 }));
        plugin.httpLauncher = {
            start: launcherStart,
            stop: launcherStop,
            getStatus,
        } as any;

        const next: HttpServerSettings = {
            enabled: false,
            host: '0.0.0.0',
            port: 39001,
            token: 'updated-token',
            authEnabled: false,
            tlsEnabled: false,
            tlsCertFile: '',
            tlsKeyFile: '',
            tlsCaFile: '',
        };

        await plugin.updateHttpServerSettings(next);

        expect(launcherStop).toHaveBeenCalledTimes(1);
        expect(plugin.httpSettings).toEqual(expect.objectContaining({
            host: '0.0.0.0',
            port: 39001,
            authEnabled: false,
        }));
        expect(launcherStart).toHaveBeenCalledWith(expect.objectContaining({
            host: '0.0.0.0',
            port: 39001,
            token: undefined,
        }));
    });

    it('starts stopped server when auto-start is enabled in new settings', async () => {
        const next: HttpServerSettings = {
            enabled: true,
            host: '127.0.0.1',
            port: 39002,
            token: 'another-token',
            authEnabled: true,
            tlsEnabled: false,
            tlsCertFile: '',
            tlsKeyFile: '',
            tlsCaFile: '',
        };

        await plugin.updateHttpServerSettings(next);

        expect(launcherStop).not.toHaveBeenCalled();
        expect(launcherStart).toHaveBeenCalledWith(expect.objectContaining({
            port: 39002,
            token: 'another-token',
        }));
    });

    it('rejects HTTPS start when TLS cert or key path is missing', async () => {
        plugin.httpSettings = {
            enabled: true,
            host: '127.0.0.1',
            port: 39003,
            token: 'secure-token',
            authEnabled: true,
            tlsEnabled: true,
            tlsCertFile: '/tmp/cert.pem',
            tlsKeyFile: '',
            tlsCaFile: '',
        };

        await expect(plugin.startHttpServer()).rejects.toThrow('HTTPS requires both certificate and key file paths.');
        expect(launcherStart).not.toHaveBeenCalled();
    });

    it('reports unsupported launcher support when workspaceDir is missing', () => {
        delete (globalThis as any).window.siyuan.config.system.workspaceDir;

        expect(HttpServerLauncher.getSupportInfo()).toEqual({
            supported: false,
            reason: 'workspace_dir_unavailable',
        });
        expect(HttpServerLauncher.isSupported()).toBe(false);
    });

    it('skips launcher init without logging when current frontend is unsupported', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        delete (globalThis as any).window.siyuan.config.system.workspaceDir;
        plugin.httpLauncher = null;

        await plugin.onload();

        expect(plugin.httpLauncher).toBeNull();
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('initializes launcher and auto-starts HTTP server when supported', async () => {
        const startSpy = vi.spyOn(HttpServerLauncher.prototype, 'start').mockResolvedValue(undefined);
        plugin.httpLauncher = null;

        await plugin.onload();

        expect(plugin.httpLauncher).toBeInstanceOf(HttpServerLauncher);
        expect(startSpy).toHaveBeenCalledWith(expect.objectContaining({
            host: '127.0.0.1',
            port: 36806,
            siyuanToken: 'siyuan-token',
        }));
    });

    it('shows a one-time warning when persisted tool config uses the legacy format', async () => {
        delete (globalThis as any).window.siyuan.config.system.workspaceDir;
        loadData.mockImplementation(async (storageName: string) => {
            if (storageName === 'mcpToolsConfig') {
                return {
                    notebook: ['list', 'rename'],
                    remove_document: true,
                };
            }
            return undefined;
        });

        await plugin.onload();
        await plugin.onload();

        expect(showMessage).toHaveBeenCalledTimes(1);
        expect(showMessage).toHaveBeenCalledWith(expect.stringContaining('Detected legacy tool config format'));
    });
});

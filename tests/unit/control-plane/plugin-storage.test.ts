import { describe, expect, it, vi } from 'vitest';

import { listPluginStorage, readPluginStorage } from '@/control-plane/plugin-storage';

function installedPackage(name: string) {
    return { packages: [{ name, enabled: true, version: '1.0.0' }] };
}

describe('controlled plugin storage', () => {
    it('uses a declared storage alias and lists symlinks without following them', async () => {
        const request = vi.fn(async (endpoint: string, body?: Record<string, unknown>) => {
            if (endpoint === '/api/bazaar/getInstalledPlugin') return installedPackage('kmind-plugin');
            if (endpoint === '/api/file/readDir' && body?.path === '/data/storage/petal') {
                return [{ name: 'kmind', isDir: true, isSymlink: false }];
            }
            if (endpoint === '/api/file/readDir' && body?.path === '/data/storage/petal/kmind') {
                return [{ name: 'config.json', isDir: false, isSymlink: true, updated: 9 }];
            }
            throw new Error(`Unexpected request: ${endpoint} ${String(body?.path)}`);
        });

        const result = await listPluginStorage({ request } as never, { pluginName: 'kmind-plugin', recursive: true });

        expect(result.storageRootName).toBe('kmind');
        expect(result.entries).toEqual([expect.objectContaining({ path: 'config.json', isSymlink: true })]);
        expect(request).not.toHaveBeenCalledWith('/api/file/readDir', { path: '/data/storage/petal/kmind/config.json' });
    });

    it('rejects symlink reads before fetching file content', async () => {
        const readFileTextLimited = vi.fn();
        const request = vi.fn(async (endpoint: string, body?: Record<string, unknown>) => {
            if (endpoint === '/api/bazaar/getInstalledPlugin') return installedPackage('demo-plugin');
            if (endpoint === '/api/file/readDir' && body?.path === '/data/storage/petal') return [{ name: 'demo-plugin', isDir: true, isSymlink: false }];
            if (endpoint === '/api/file/readDir') return [{ name: 'config.json', isDir: false, isSymlink: true }];
            throw new Error(`Unexpected request: ${endpoint}`);
        });

        await expect(readPluginStorage({ request, readFileTextLimited } as never, {
            pluginName: 'demo-plugin',
            path: 'config.json',
        })).rejects.toThrow('Symbolic links');
        expect(readFileTextLimited).not.toHaveBeenCalled();
    });

    it('reads, redacts, and truncates a bounded safe JSON file', async () => {
        const request = vi.fn(async (endpoint: string, body?: Record<string, unknown>) => {
            if (endpoint === '/api/bazaar/getInstalledPlugin') return installedPackage('demo-plugin');
            if (endpoint === '/api/file/readDir' && body?.path === '/data/storage/petal') return [{ name: 'demo-plugin', isDir: true, isSymlink: false }];
            if (endpoint === '/api/file/readDir') return [{ name: 'config.json', isDir: false, isSymlink: false }];
            throw new Error(`Unexpected request: ${endpoint}`);
        });
        const readFileTextLimited = vi.fn().mockResolvedValue({
            content: JSON.stringify({ enabled: true, apiKey: 'hidden-value' }),
            byteLength: 48,
        });

        const result = await readPluginStorage({ request, readFileTextLimited } as never, {
            pluginName: 'demo-plugin',
            path: 'config.json',
            maxChars: 100,
        });

        expect(result.content).toContain('[REDACTED]');
        expect(result.content).not.toContain('hidden-value');
        expect(result.redacted).toBe(true);
        expect(readFileTextLimited).toHaveBeenCalledWith('/data/storage/petal/demo-plugin/config.json', 128 * 1024);
    });

    it('rejects traversal before any storage directory request', async () => {
        const request = vi.fn(async (endpoint: string) => {
            if (endpoint === '/api/bazaar/getInstalledPlugin') return installedPackage('demo-plugin');
            throw new Error(`Unexpected request: ${endpoint}`);
        });

        await expect(readPluginStorage({ request } as never, {
            pluginName: 'demo-plugin',
            path: '../petals.json',
        })).rejects.toThrow('unsafe');
        expect(request).not.toHaveBeenCalled();
    });

    it('rejects a symbolic-link storage root before entering it', async () => {
        const request = vi.fn(async (endpoint: string, body?: Record<string, unknown>) => {
            if (endpoint === '/api/bazaar/getInstalledPlugin') return installedPackage('demo-plugin');
            if (endpoint === '/api/file/readDir' && body?.path === '/data/storage/petal') {
                return [{ name: 'demo-plugin', isDir: true, isSymlink: true }];
            }
            throw new Error(`Unexpected request: ${endpoint} ${String(body?.path)}`);
        });

        await expect(listPluginStorage({ request } as never, { pluginName: 'demo-plugin' }))
            .rejects.toThrow('storage roots');
        expect(request).not.toHaveBeenCalledWith('/api/file/readDir', { path: '/data/storage/petal/demo-plugin' });
    });

    it('blocks private control-plane records from direct reads before file access', async () => {
        const request = vi.fn();
        const readFileTextLimited = vi.fn();

        await expect(readPluginStorage({ request, readFileTextLimited } as never, {
            pluginName: 'siyuan-plugins-mcp-sisyphus',
            path: 'control-plane/plans/00000000-0000-4000-8000-000000000000.json',
        })).rejects.toThrow('private');
        expect(request).not.toHaveBeenCalled();
        expect(readFileTextLimited).not.toHaveBeenCalled();
    });
});

import { describe, expect, it, vi } from 'vitest';

import { applyChange, discardPlan, planChange, rollbackChange, verifyApplied } from '@/control-plane/operations';

const VALID_EMPTY_ZIP = Uint8Array.from([
    0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);

function createStatefulClient() {
    let enabled = false;
    const files = new Map<string, string>();
    const request = vi.fn(async (endpoint: string, body?: Record<string, unknown>) => {
        if (endpoint === '/api/file/renameFile' || endpoint === '/api/file/removeFile') return null;
        if (endpoint === '/api/bazaar/getInstalledPlugin') {
            return {
                packages: [{
                    name: 'demo-plugin',
                    version: '1.0.0',
                    repoURL: 'https://github.com/example/demo-plugin',
                    repoHash: 'abcdef1234567',
                    enabled,
                    installSize: 1024,
                }],
            };
        }
        if (endpoint === '/api/petal/setPetalEnabled') {
            enabled = body?.enabled === true;
            return { enabled };
        }
        throw new Error(`Unexpected endpoint: ${endpoint}`);
    });
    return {
        request,
        requestRead: request,
        requestWrite: request,
        createDirectory: vi.fn(async () => undefined),
        writeFile: vi.fn(async (path: string, content: string) => { files.set(path, content); }),
        readFile: vi.fn(async (path: string) => {
            const content = files.get(path);
            if (content === undefined) throw new Error(`missing: ${path}`);
            return content;
        }),
        setEnabled(value: boolean) { enabled = value; },
        getEnabled() { return enabled; },
    };
}

describe('control-plane operations', () => {
    it('completes plan, apply, verify, and rollback for plugin state', async () => {
        const client = createStatefulClient();
        const plan = await planChange(client as never, { kind: 'plugin_state', pluginName: 'demo-plugin', enabled: true });

        expect(plan.status).toBe('planned');
        expect(client.getEnabled()).toBe(false);
        const applied = await applyChange(client as never, plan.id);
        expect(applied).toEqual(expect.objectContaining({ status: 'applied', verification: { ok: true, message: expect.any(String) } }));
        expect(client.getEnabled()).toBe(true);

        const rolledBack = await rollbackChange(client as never, String(applied.id));
        expect(rolledBack).toEqual(expect.objectContaining({ status: 'rolled_back', rollbackVerification: { ok: true, message: expect.any(String) } }));
        expect(client.getEnabled()).toBe(false);
    });

    it('rejects a stale plan before any mutation', async () => {
        const client = createStatefulClient();
        const plan = await planChange(client as never, { kind: 'plugin_state', pluginName: 'demo-plugin', enabled: true });
        client.setEnabled(true);

        await expect(applyChange(client as never, plan.id)).rejects.toThrow('Target state changed');
        expect(client.request).not.toHaveBeenCalledWith('/api/petal/setPetalEnabled', expect.anything());
    });

    it('allows only one concurrent consumer for the same change target', async () => {
        const client = createStatefulClient();
        const plan = await planChange(client as never, { kind: 'plugin_state', pluginName: 'demo-plugin', enabled: true });

        const results = await Promise.allSettled([
            applyChange(client as never, plan.id),
            applyChange(client as never, plan.id),
        ]);

        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
        expect(String((results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason)).toContain('already in progress');
        expect(client.request.mock.calls.filter(([endpoint]) => endpoint === '/api/petal/setPetalEnabled')).toHaveLength(1);
    });

    it('serializes discarding and applying the same plan', async () => {
        const client = createStatefulClient();
        const plan = await planChange(client as never, { kind: 'plugin_state', pluginName: 'demo-plugin', enabled: true });
        const results = await Promise.allSettled([
            applyChange(client as never, plan.id),
            discardPlan(client as never, plan.id),
        ]);

        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    });

    it('rejects secret-bearing snippet plans before persistence', async () => {
        const client = createStatefulClient();
        client.request.mockImplementation(async (endpoint: string): Promise<any> => {
            if (endpoint === '/api/snippet/getSnippet') return { snippets: [] };
            throw new Error(`Unexpected endpoint: ${endpoint}`);
        });

        await expect(planChange(client as never, {
            kind: 'snippet_upsert',
            snippet: { id: 's1', name: 'unsafe', type: 'js', enabled: true, disabledInPublish: false, content: 'const apiKey = "abcdefghijklmnop";' },
        })).rejects.toThrow('secret');
        expect(client.writeFile).not.toHaveBeenCalled();
    });

    it('accepts the empty installed revision emitted by SiYuan but rejects conflicting package identity', () => {
        const request = {
            kind: 'plugin_install' as const,
            packageName: 'demo-plugin',
            repoURL: 'https://github.com/example/demo-plugin',
            repoHash: '1234567890abcde',
        };
        const state = {
            name: 'demo-plugin',
            version: '2.0.0',
            repoURL: 'https://github.com/example/demo-plugin',
            repoHash: '',
            descriptor: { name: 'demo-plugin', version: '2.0.0', url: 'https://github.com/example/demo-plugin' },
            treeHash: 'sha256:tree',
            treeEntries: 3,
        };

        expect(verifyApplied(request, state, '2.0.0')).toBe(true);
        expect(verifyApplied(request, { ...state, repoHash: 'deadbeef' }, '2.0.0')).toBe(false);
        expect(verifyApplied(request, { ...state, repoURL: 'https://github.com/example/other-plugin' }, '2.0.0')).toBe(false);
        expect(verifyApplied(request, { ...state, descriptor: { ...state.descriptor, url: 'https://github.com/example/other-plugin' } }, '2.0.0')).toBe(false);
    });

    it('creates an exact package archive before an update and restores it on rollback', async () => {
        let plugin: Record<string, unknown> | null = {
            name: 'demo-plugin', version: '1.0.0', repoURL: 'https://github.com/example/demo-plugin', repoHash: 'abcdef1', enabled: true, installSize: 1024,
        };
        const files = new Map<string, string>();
        const request = vi.fn(async (endpoint: string, body?: Record<string, unknown>) => {
            if (endpoint === '/api/file/renameFile' || endpoint === '/api/file/removeFile') return null;
            if (endpoint === '/api/bazaar/getInstalledPlugin') return { packages: plugin ? [plugin] : [] };
            if (endpoint === '/api/bazaar/getBazaarPlugin') return { packages: [{ name: 'demo-plugin', version: '2.0.0', repoURL: 'https://github.com/example/demo-plugin', repoHash: '1234567890abcde' }] };
            if (endpoint === '/api/archive/zip') return null;
            if (endpoint === '/api/file/readDir' && (body?.path === '/data/plugins'
                || (String(body?.path).includes('/backup-validation/') && !String(body?.path).endsWith('/demo-plugin')))) {
                return [{ name: 'demo-plugin', isDir: true, isSymlink: false }];
            }
            if (endpoint === '/api/file/readDir') return [{ name: 'plugin.json', isDir: false, isSymlink: false }];
            if (endpoint === '/api/bazaar/installBazaarPlugin') {
                plugin = { name: body?.packageName, version: '2.0.0', repoURL: body?.repoURL, repoHash: body?.repoHash, enabled: true, installSize: 2048 };
                return { packages: [plugin] };
            }
            if (endpoint === '/api/bazaar/uninstallBazaarPlugin') { plugin = null; return { packages: [] }; }
            if (endpoint === '/api/archive/unzip' && String(body?.path).includes('/backup-validation/')) {
                if (rejectValidationUnzip) throw new Error('invalid zip');
                return null;
            }
            if (endpoint === '/api/archive/unzip') {
                if (failRestoreUnzip) throw new Error('restore unzip failed');
                plugin = { name: 'demo-plugin', version: '1.0.0', repoURL: 'https://github.com/example/demo-plugin', repoHash: 'abcdef1', enabled: true, installSize: 1024 };
                return null;
            }
            if (endpoint === '/api/petal/setPetalEnabled') { if (plugin) plugin.enabled = body?.enabled === true; return plugin; }
            throw new Error(`Unexpected endpoint: ${endpoint}`);
        });
        let corruptBackup = false;
        let rejectValidationUnzip = true;
        let failRestoreUnzip = false;
        const client = {
            request,
            requestRead: request,
            requestWrite: request,
            createDirectory: vi.fn(async () => undefined),
            writeFile: vi.fn(async (path: string, content: string) => { files.set(path, content); }),
            readFile: vi.fn(async (path: string) => {
                const value = files.get(path);
                if (value === undefined) throw new Error(`missing: ${path}`);
                return value;
            }),
            readFileTextLimited: vi.fn(async () => ({
                content: JSON.stringify({ name: 'demo-plugin', version: plugin?.version, url: plugin?.repoURL }),
                byteLength: 100,
            })),
            readFileBinaryLimited: vi.fn(async (path: string) => {
                const content = path.endsWith('.zip')
                    ? (corruptBackup ? new Uint8Array(VALID_EMPTY_ZIP.length).fill(8) : VALID_EMPTY_ZIP)
                    : new TextEncoder().encode(JSON.stringify({ name: 'demo-plugin', version: plugin?.version, url: plugin?.repoURL }));
                return { content, byteLength: content.byteLength };
            }),
        };
        const rejectedPlan = await planChange(client as never, {
            kind: 'plugin_install',
            packageName: 'demo-plugin',
            repoURL: 'https://github.com/example/demo-plugin',
            repoHash: '1234567890abcde',
        });
        await expect(applyChange(client as never, rejectedPlan.id)).rejects.toThrow('invalid zip');
        expect(request).not.toHaveBeenCalledWith('/api/bazaar/installBazaarPlugin', expect.anything());

        rejectValidationUnzip = false;
        const plan = await planChange(client as never, {
            kind: 'plugin_install',
            packageName: 'demo-plugin',
            repoURL: 'https://github.com/example/demo-plugin',
            repoHash: '1234567890abcde',
        });
        const applied = await applyChange(client as never, plan.id);

        expect(request.mock.invocationCallOrder[request.mock.calls.findIndex(([endpoint]) => endpoint === '/api/archive/zip')])
            .toBeLessThan(request.mock.invocationCallOrder[request.mock.calls.findIndex(([endpoint]) => endpoint === '/api/bazaar/installBazaarPlugin')]);
        corruptBackup = true;
        await expect(rollbackChange(client as never, String(applied.id))).rejects.toThrow('integrity');
        expect(JSON.parse(String(files.get(`/data/storage/petal/siyuan-plugins-mcp-sisyphus/control-plane/changes/${String(applied.id)}.json`))).status)
            .toBe('rollback_failed');
        expect(plugin).toEqual(expect.objectContaining({ version: '2.0.0' }));
        corruptBackup = false;
        failRestoreUnzip = true;
        await expect(rollbackChange(client as never, String(applied.id))).rejects.toThrow('restore unzip failed');
        expect(plugin).toBeNull();
        expect(JSON.parse(String(files.get(`/data/storage/petal/siyuan-plugins-mcp-sisyphus/control-plane/changes/${String(applied.id)}.json`))).status)
            .toBe('rollback_failed');
        failRestoreUnzip = false;
        await rollbackChange(client as never, String(applied.id));
        expect(plugin).toEqual(expect.objectContaining({ version: '1.0.0', enabled: true }));
        expect(request).toHaveBeenCalledWith('/api/archive/unzip', expect.objectContaining({ path: '/data/plugins' }));
    });

    it('refuses a package snapshot containing a symbolic link before update execution', async () => {
        const files = new Map<string, string>();
        const request = vi.fn(async (endpoint: string, body?: Record<string, unknown>) => {
            if (endpoint === '/api/file/renameFile' || endpoint === '/api/file/removeFile') return null;
            if (endpoint === '/api/bazaar/getInstalledPlugin') {
                return { packages: [{ name: 'demo-plugin', version: '1.0.0', repoURL: 'https://github.com/example/demo-plugin', repoHash: 'abcdef1', enabled: true, installSize: 1024 }] };
            }
            if (endpoint === '/api/file/readDir' && body?.path === '/data/plugins') return [{ name: 'demo-plugin', isDir: true, isSymlink: true }];
            if (endpoint === '/api/archive/zip') return null;
            throw new Error(`Unexpected endpoint: ${endpoint}`);
        });
        const client = {
            request,
            requestRead: request,
            requestWrite: request,
            createDirectory: vi.fn(async () => undefined),
            writeFile: vi.fn(async (path: string, content: string) => { files.set(path, content); }),
            readFile: vi.fn(async (path: string) => files.get(path) ?? Promise.reject(new Error('missing'))),
            readFileTextLimited: vi.fn(async () => ({ content: '{"name":"demo-plugin","version":"1.0.0"}', byteLength: 41 })),
        };

        await expect(planChange(client as never, {
            kind: 'plugin_install', packageName: 'demo-plugin', repoURL: 'https://github.com/example/demo-plugin', repoHash: '1234567890abcde',
        })).rejects.toThrow('symbolic link');
        expect(request).not.toHaveBeenCalledWith('/api/archive/zip', expect.anything());
        expect(request).not.toHaveBeenCalledWith('/api/bazaar/installBazaarPlugin', expect.anything());
    });

    it('restores the complete snippet collection after an upsert', async () => {
        let snippets = [{ id: 'old', name: 'Old', type: 'css' as const, enabled: true, disabledInPublish: false, content: 'body{}' }];
        const files = new Map<string, string>();
        const request = vi.fn(async (endpoint: string, body?: Record<string, unknown>) => {
            if (endpoint === '/api/file/renameFile' || endpoint === '/api/file/removeFile') return null;
            if (endpoint === '/api/snippet/getSnippet') return { snippets };
            if (endpoint === '/api/snippet/setSnippet') { snippets = structuredClone(body?.snippets as typeof snippets); return null; }
            throw new Error(`Unexpected endpoint: ${endpoint}`);
        });
        const client = {
            request,
            requestRead: request,
            requestWrite: request,
            createDirectory: vi.fn(async () => undefined),
            writeFile: vi.fn(async (path: string, content: string) => { files.set(path, content); }),
            readFile: vi.fn(async (path: string) => files.get(path) ?? Promise.reject(new Error('missing'))),
        };
        const before = structuredClone(snippets);
        const plan = await planChange(client as never, {
            kind: 'snippet_upsert',
            snippet: { id: 'new', name: 'New', type: 'js', enabled: false, disabledInPublish: true, content: 'console.log("safe")' },
        });
        const applied = await applyChange(client as never, plan.id);
        expect(snippets.map((snippet) => snippet.id)).toEqual(['old', 'new']);

        await rollbackChange(client as never, String(applied.id));
        expect(snippets).toEqual(before);
    });

    it('refuses rollback when a newer snippet change exists', async () => {
        let snippets = [{ id: 'old', name: 'Old', type: 'css' as const, enabled: true, disabledInPublish: false, content: 'body{}' }];
        const files = new Map<string, string>();
        const request = vi.fn(async (endpoint: string, body?: Record<string, unknown>) => {
            if (endpoint === '/api/file/renameFile' || endpoint === '/api/file/removeFile') return null;
            if (endpoint === '/api/snippet/getSnippet') return { snippets };
            if (endpoint === '/api/snippet/setSnippet') { snippets = structuredClone(body?.snippets as typeof snippets); return null; }
            throw new Error(`Unexpected endpoint: ${endpoint}`);
        });
        const client = {
            request,
            requestRead: request,
            requestWrite: request,
            createDirectory: vi.fn(async () => undefined),
            writeFile: vi.fn(async (path: string, content: string) => { files.set(path, content); }),
            readFile: vi.fn(async (path: string) => files.get(path) ?? Promise.reject(new Error('missing'))),
        };
        const plan = await planChange(client as never, {
            kind: 'snippet_upsert',
            snippet: { id: 'planned', name: 'Planned', type: 'js', enabled: false, disabledInPublish: true, content: 'console.log("safe")' },
        });
        const applied = await applyChange(client as never, plan.id);
        snippets.push({ id: 'newer', name: 'Newer', type: 'css', enabled: true, disabledInPublish: false, content: '.newer{}' });

        await expect(rollbackChange(client as never, String(applied.id))).rejects.toThrow('newer changes');
        expect(snippets.map((snippet) => snippet.id)).toEqual(['old', 'planned', 'newer']);
    });

    it('deep-merges an allowed setting section and restores the exact section', async () => {
        let appearance: Record<string, unknown> = { mode: 0, fontSize: 16, fontFamily: 'system' };
        const files = new Map<string, string>();
        const request = vi.fn(async (endpoint: string, body?: Record<string, unknown>) => {
            if (endpoint === '/api/file/renameFile' || endpoint === '/api/file/removeFile') return null;
            if (endpoint === '/api/system/getConf') return { conf: { appearance } };
            if (endpoint === '/api/setting/setAppearance') { appearance = structuredClone(body ?? {}); return appearance; }
            throw new Error(`Unexpected endpoint: ${endpoint}`);
        });
        const client = {
            request,
            requestRead: request,
            requestWrite: request,
            createDirectory: vi.fn(async () => undefined),
            writeFile: vi.fn(async (path: string, content: string) => { files.set(path, content); }),
            readFile: vi.fn(async (path: string) => files.get(path) ?? Promise.reject(new Error('missing'))),
        };
        const before = structuredClone(appearance);
        const plan = await planChange(client as never, {
            kind: 'setting_patch',
            section: 'appearance',
            patch: { mode: 1 },
        });
        const applied = await applyChange(client as never, plan.id);
        expect(appearance).toEqual({ mode: 1, fontSize: 16, fontFamily: 'system' });

        await rollbackChange(client as never, String(applied.id));
        expect(appearance).toEqual(before);
    });

    it('replaces and restores one bounded plugin text configuration', async () => {
        let configContent = '{"enabled":false}';
        const files = new Map<string, string>();
        const request = vi.fn(async (endpoint: string, body?: Record<string, unknown>) => {
            if (endpoint === '/api/file/renameFile' || endpoint === '/api/file/removeFile') return null;
            if (endpoint === '/api/bazaar/getInstalledPlugin') return { packages: [{ name: 'demo-plugin', enabled: true, installSize: 1024 }] };
            if (endpoint === '/api/file/readDir' && body?.path === '/data/storage/petal') return [{ name: 'demo-plugin', isDir: true, isSymlink: false }];
            if (endpoint === '/api/file/readDir') return [{ name: 'config.json', isDir: false, isSymlink: false }];
            throw new Error(`Unexpected endpoint: ${endpoint} ${String(body?.path)}`);
        });
        const client = {
            request,
            requestRead: request,
            requestWrite: request,
            createDirectory: vi.fn(async () => undefined),
            writeFile: vi.fn(async (path: string, content: string) => {
                if (path === '/data/storage/petal/demo-plugin/config.json') configContent = content;
                else files.set(path, content);
            }),
            readFile: vi.fn(async (path: string) => files.get(path) ?? Promise.reject(new Error('missing'))),
            readFileTextLimited: vi.fn(async () => ({ content: configContent, byteLength: new TextEncoder().encode(configContent).byteLength })),
        };
        const plan = await planChange(client as never, {
            kind: 'plugin_storage_write', pluginName: 'demo-plugin', path: 'config.json', content: '{"enabled":true}',
        });
        const applied = await applyChange(client as never, plan.id);
        expect(configContent).toBe('{"enabled":true}');

        await rollbackChange(client as never, String(applied.id));
        expect(configContent).toBe('{"enabled":false}');
    });
});

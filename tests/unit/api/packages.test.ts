import { describe, expect, it, vi } from 'vitest';

import {
    getBazaarPackageReadme,
    getBazaarPackages,
    getBazaarPlugins,
    getInstalledPackages,
} from '@/api/packages';

describe('packages api wrappers', () => {
    it.each([
        ['plugin', '/api/bazaar/getInstalledPlugin'],
        ['widget', '/api/bazaar/getInstalledWidget'],
        ['theme', '/api/bazaar/getInstalledTheme'],
        ['icon', '/api/bazaar/getInstalledIcon'],
        ['template', '/api/bazaar/getInstalledTemplate'],
    ] as const)('maps %s to the installed-package endpoint', async (kind, endpoint) => {
        const request = vi.fn().mockResolvedValueOnce({ packages: [{ name: `${kind}-demo` }] });
        const client = { request, requestRead: request } as never;

        await expect(getInstalledPackages(client, kind, 'demo', 'desktop')).resolves.toEqual([
            { name: `${kind}-demo` },
        ]);
        expect(request).toHaveBeenCalledWith(endpoint, {
            frontend: 'desktop',
            keyword: 'demo',
        });
    });

    it('returns an empty list for a malformed SiYuan response', async () => {
        const request = vi.fn().mockResolvedValueOnce({ packages: null });
        const client = { request, requestRead: request } as never;

        await expect(getInstalledPackages(client, 'plugin')).resolves.toEqual([]);
    });

    it('reads online plugin revisions for explicit update planning', async () => {
        const request = vi.fn().mockResolvedValueOnce({ packages: [{ name: 'demo', version: '2.0.0', repoHash: 'abcdef1' }] });
        const client = { request, requestRead: request } as never;

        await expect(getBazaarPlugins(client, '', 'desktop')).resolves.toEqual([{ name: 'demo', version: '2.0.0', repoHash: 'abcdef1' }]);
        expect(request).toHaveBeenCalledWith('/api/bazaar/getBazaarPlugin', { frontend: 'desktop', keyword: '' });
    });

    it.each([
        ['plugin', '/api/bazaar/getBazaarPlugin', { frontend: 'desktop', keyword: 'graph' }],
        ['widget', '/api/bazaar/getBazaarWidget', { keyword: 'graph' }],
        ['theme', '/api/bazaar/getBazaarTheme', { keyword: 'graph' }],
        ['icon', '/api/bazaar/getBazaarIcon', { keyword: 'graph' }],
        ['template', '/api/bazaar/getBazaarTemplate', { keyword: 'graph' }],
    ] as const)('maps %s to the online bazaar endpoint', async (kind, endpoint, body) => {
        const request = vi.fn().mockResolvedValueOnce({ packages: [{ name: `${kind}-demo` }] });
        const client = { request, requestRead: request } as never;

        await expect(getBazaarPackages(client, kind, 'graph', 'desktop')).resolves.toEqual([
            { name: `${kind}-demo` },
        ]);
        expect(request).toHaveBeenCalledWith(endpoint, body);
    });

    it('reads one bazaar README using a server-resolved repository revision', async () => {
        const request = vi.fn().mockResolvedValueOnce({ html: '<h1>Demo</h1>' });
        const client = { request, requestRead: request } as never;

        await expect(getBazaarPackageReadme(client, {
            kind: 'plugin',
            repoURL: 'https://github.com/example/demo',
            repoHash: 'abcdef1',
        })).resolves.toBe('<h1>Demo</h1>');
        expect(request).toHaveBeenCalledWith('/api/bazaar/getBazaarPackageREADME', {
            repoURL: 'https://github.com/example/demo',
            repoHash: 'abcdef1',
            packageType: 'plugins',
        });
    });
});

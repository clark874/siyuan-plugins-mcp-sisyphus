import { describe, expect, it, vi } from 'vitest';

import { getBazaarPlugins, getInstalledPackages } from '@/api/packages';

describe('packages api wrappers', () => {
    it.each([
        ['plugin', '/api/bazaar/getInstalledPlugin'],
        ['widget', '/api/bazaar/getInstalledWidget'],
        ['theme', '/api/bazaar/getInstalledTheme'],
        ['icon', '/api/bazaar/getInstalledIcon'],
        ['template', '/api/bazaar/getInstalledTemplate'],
    ] as const)('maps %s to the installed-package endpoint', async (kind, endpoint) => {
        const request = vi.fn().mockResolvedValueOnce({ packages: [{ name: `${kind}-demo` }] });
        const client = { request } as never;

        await expect(getInstalledPackages(client, kind, 'demo', 'desktop')).resolves.toEqual([
            { name: `${kind}-demo` },
        ]);
        expect(request).toHaveBeenCalledWith(endpoint, {
            frontend: 'desktop',
            keyword: 'demo',
        });
    });

    it('returns an empty list for a malformed SiYuan response', async () => {
        const client = { request: vi.fn().mockResolvedValueOnce({ packages: null }) } as never;

        await expect(getInstalledPackages(client, 'plugin')).resolves.toEqual([]);
    });

    it('reads online plugin revisions for explicit update planning', async () => {
        const request = vi.fn().mockResolvedValueOnce({ packages: [{ name: 'demo', version: '2.0.0', repoHash: 'abcdef1' }] });
        const client = { request } as never;

        await expect(getBazaarPlugins(client, '', 'desktop')).resolves.toEqual([{ name: 'demo', version: '2.0.0', repoHash: 'abcdef1' }]);
        expect(request).toHaveBeenCalledWith('/api/bazaar/getBazaarPlugin', { frontend: 'desktop', keyword: '' });
    });
});

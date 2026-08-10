import type { SiYuanClient } from './client';

export const INSTALLED_PACKAGE_KINDS = ['plugin', 'widget', 'theme', 'icon', 'template'] as const;

export type InstalledPackageKind = typeof INSTALLED_PACKAGE_KINDS[number];

const INSTALLED_PACKAGE_ENDPOINTS: Record<InstalledPackageKind, string> = {
    plugin: '/api/bazaar/getInstalledPlugin',
    widget: '/api/bazaar/getInstalledWidget',
    theme: '/api/bazaar/getInstalledTheme',
    icon: '/api/bazaar/getInstalledIcon',
    template: '/api/bazaar/getInstalledTemplate',
};

export async function getInstalledPackages(
    client: SiYuanClient,
    kind: InstalledPackageKind,
    keyword = '',
    frontend = 'desktop',
): Promise<Record<string, unknown>[]> {
    const response = await client.request<unknown>(INSTALLED_PACKAGE_ENDPOINTS[kind], {
        frontend,
        keyword,
    });
    if (response === null || typeof response !== 'object') return [];
    const packages = (response as { packages?: unknown }).packages;
    return Array.isArray(packages)
        ? packages.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
        : [];
}

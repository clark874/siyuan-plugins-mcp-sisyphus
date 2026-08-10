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

export async function getInstalledPlugin(
    client: SiYuanClient,
    name: string,
    frontend = 'desktop',
): Promise<Record<string, unknown> | null> {
    const packages = await getInstalledPackages(client, 'plugin', name, frontend);
    return packages.find((pkg) => pkg.name === name) ?? null;
}

export async function getBazaarPlugins(
    client: SiYuanClient,
    keyword = '',
    frontend = 'desktop',
): Promise<Record<string, unknown>[]> {
    const response = await client.request<unknown>('/api/bazaar/getBazaarPlugin', { frontend, keyword });
    if (response === null || typeof response !== 'object') return [];
    const packages = (response as { packages?: unknown }).packages;
    return Array.isArray(packages)
        ? packages.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
        : [];
}

export async function setPluginEnabled(
    client: SiYuanClient,
    packageName: string,
    enabled: boolean,
    app = '',
): Promise<unknown> {
    return client.request('/api/petal/setPetalEnabled', { packageName, enabled, app });
}

export async function installPlugin(
    client: SiYuanClient,
    input: { frontend: string; repoURL: string; repoHash: string; packageName: string; keyword?: string },
): Promise<unknown> {
    return client.request('/api/bazaar/installBazaarPlugin', {
        frontend: input.frontend,
        keyword: input.keyword ?? '',
        repoURL: input.repoURL,
        repoHash: input.repoHash,
        packageName: input.packageName,
    });
}

export async function uninstallPlugin(
    client: SiYuanClient,
    packageName: string,
    frontend = '',
): Promise<unknown> {
    return client.request('/api/bazaar/uninstallBazaarPlugin', {
        packageName,
        frontend,
        keyword: '',
    });
}

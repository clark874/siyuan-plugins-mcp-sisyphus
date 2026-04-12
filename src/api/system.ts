import { SiYuanClient } from './client';

export async function getWorkspaceInfo(client: SiYuanClient): Promise<unknown> {
    return client.request('/api/system/getWorkspaceInfo', {});
}

export async function getNetwork(client: SiYuanClient): Promise<unknown> {
    return client.request('/api/system/getNetwork', {});
}

export async function getChangelog(client: SiYuanClient): Promise<unknown> {
    return client.request('/api/system/getChangelog', {});
}

export async function getConf(client: SiYuanClient): Promise<unknown> {
    return client.request('/api/system/getConf', {});
}

export async function getSysFonts(client: SiYuanClient): Promise<unknown> {
    return client.request('/api/system/getSysFonts', {});
}

export async function getBootProgress(client: SiYuanClient): Promise<{ progress: number; details: string }> {
    return client.request<{ progress: number; details: string }>('/api/system/bootProgress', {});
}

export async function reloadUI(client: SiYuanClient): Promise<null> {
    return client.request<null>('/api/ui/reloadUI', {});
}

export async function reloadIcon(client: SiYuanClient): Promise<null> {
    return client.request<null>('/api/ui/reloadIcon', {});
}

export async function reloadFiletree(client: SiYuanClient): Promise<null> {
    return client.request<null>('/api/ui/reloadFiletree', {});
}

export async function reloadProtyle(client: SiYuanClient, id: string): Promise<null> {
    return client.request<null>('/api/ui/reloadProtyle', { id });
}

export async function reloadAttributeView(client: SiYuanClient, id: string): Promise<null> {
    return client.request<null>('/api/ui/reloadAttributeView', { id });
}

export async function reloadTag(client: SiYuanClient): Promise<null> {
    return client.request<null>('/api/ui/reloadTag', {});
}

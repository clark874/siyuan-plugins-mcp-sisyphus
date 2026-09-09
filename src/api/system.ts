import type { SiYuanClient } from './client';

export async function getConf(client: SiYuanClient): Promise<unknown> {
    return client.requestRead('/api/system/getConf', {});
}

export async function getVersion(client: SiYuanClient): Promise<string> {
    return client.requestRead<string>('/api/system/version');
}

export async function getCurrentTime(client: SiYuanClient): Promise<number> {
    return client.requestRead<number>('/api/system/currentTime');
}

export async function reloadIcon(client: SiYuanClient): Promise<null> {
    return client.requestWrite<null>('/api/ui/reloadIcon', {});
}

export async function reloadFiletree(client: SiYuanClient): Promise<null> {
    return client.requestWrite<null>('/api/ui/reloadFiletree', {});
}

export async function reloadProtyle(client: SiYuanClient, id: string): Promise<null> {
    return client.requestWrite<null>('/api/ui/reloadProtyle', { id });
}

export async function reloadAttributeView(client: SiYuanClient, id: string): Promise<null> {
    return client.requestWrite<null>('/api/ui/reloadAttributeView', { id });
}

export async function reloadTag(client: SiYuanClient): Promise<null> {
    return client.requestWrite<null>('/api/ui/reloadTag', {});
}

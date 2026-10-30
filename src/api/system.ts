import type { SiYuanClient } from './client';

/** 新接口不允许在旧内核上静默忽略参数。 */
export async function requireKernel389(client: SiYuanClient): Promise<void> {
    if (!await supportsKernel389(client)) throw new Error('此功能需要思源 3.8.9 或更新版本；未执行写入或未筛选查询。');
}

export async function supportsKernel389(client: SiYuanClient): Promise<boolean> {
    const version = await client.requestRead<string>('/api/system/version');
    const match = /^(\d+)\.(\d+)\.(\d+)(?:$|[-+])/.exec(String(version));
    if (!match) throw new Error('无法确认思源内核版本，停止使用新增接口。');
    return Number(match[1]) > 3 || Number(match[1]) === 3 && (Number(match[2]) > 8 || Number(match[2]) === 8 && Number(match[3]) >= 9);
}

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

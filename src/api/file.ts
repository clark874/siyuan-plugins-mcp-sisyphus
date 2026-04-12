import { SiYuanClient } from './client';
import type {
    IReqRenderTemplate,
    IReqRenderSprig,
    IReqExportMdContent,
    IReqExportResources,
    IReqPushMsg,
    IReqPushErrMsg,
    IResPushMsg,
    IResExportMdContent,
    IResExportResources,
    IResVersion,
    IResCurrentTime,
} from '../types/api';

/**
 * Upload an asset file to the specified assets directory
 */
export async function uploadAsset(
    client: SiYuanClient,
    assetsDirPath: string,
    fileContent: Uint8Array,
    fileName: string,
): Promise<{ errFiles: string[]; succMap: { [key: string]: string } }> {
    const formData = new FormData();
    const file = new File([fileContent], fileName);
    formData.append('assetsDirPath', assetsDirPath);
    formData.append('file[]', file, fileName);

    const url = `${client.getBaseUrl()}/api/asset/upload`;
    const headers = client.getAuthHeaders();

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
    });

    if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (result.code !== 0) {
        throw new Error(`SiYuan API error: ${result.code} - ${result.msg}`);
    }

    return result.data;
}

/**
 * Render a template by ID or path
 */
export async function renderTemplate(
    client: SiYuanClient,
    id: string,
    path: string
): Promise<string> {
    const request: IReqRenderTemplate = {
        id,
        path,
    };
    return client.request<string>('/api/template/render', request);
}

/**
 * Render a Sprig template
 */
export async function renderSprig(
    client: SiYuanClient,
    template: string
): Promise<string> {
    const request: IReqRenderSprig = {
        template,
    };
    return client.request<string>('/api/template/renderSprig', request);
}

/**
 * Export document content as Markdown
 */
export async function exportMdContent(
    client: SiYuanClient,
    id: string
): Promise<IResExportMdContent> {
    const request: IReqExportMdContent = {
        id,
    };
    return client.request<IResExportMdContent>('/api/export/exportMdContent', request);
}

/**
 * Export resources (files) as a ZIP archive
 */
export async function exportResources(
    client: SiYuanClient,
    paths: string[],
    name?: string
): Promise<IResExportResources> {
    const request: IReqExportResources = {
        paths,
        name,
    };
    return client.request<IResExportResources>('/api/export/exportResources', request);
}

/**
 * Push a notification message
 */
export async function pushMsg(
    client: SiYuanClient,
    msg: string,
    timeout?: number
): Promise<IResPushMsg> {
    const request: IReqPushMsg = {
        msg,
        timeout,
    };
    return client.request<IResPushMsg>('/api/notification/pushMsg', request);
}

/**
 * Push an error notification message
 */
export async function pushErrMsg(
    client: SiYuanClient,
    msg: string,
    timeout?: number
): Promise<IResPushMsg> {
    const request: IReqPushErrMsg = {
        msg,
        timeout,
    };
    return client.request<IResPushMsg>('/api/notification/pushErrMsg', request);
}

/**
 * Get the SiYuan system version
 */
export async function getVersion(client: SiYuanClient): Promise<string> {
    return client.request<string>('/api/system/version');
}

/**
 * Get the current system time (Unix timestamp in milliseconds)
 */
export async function getCurrentTime(client: SiYuanClient): Promise<number> {
    return client.request<number>('/api/system/currentTime');
}

export async function getUnusedAssets(client: SiYuanClient): Promise<unknown> {
    return client.request('/api/asset/getUnusedAssets', {});
}

export async function getDocAssets(client: SiYuanClient, id: string): Promise<unknown> {
    return client.request('/api/asset/getDocAssets', { id });
}

export async function getDocImageAssets(client: SiYuanClient, id: string): Promise<unknown> {
    return client.request('/api/asset/getDocImageAssets', { id });
}

export async function getImageOCRText(client: SiYuanClient, path?: string): Promise<{ text: string }> {
    return client.request<{ text: string }>('/api/asset/getImageOCRText', path ? { path } : {});
}

export async function removeUnusedAssets(client: SiYuanClient): Promise<unknown> {
    return client.request('/api/asset/removeUnusedAssets', {});
}

export async function renameAsset(
    client: SiYuanClient,
    oldPath: string,
    newName: string,
): Promise<{ newPath?: string }> {
    return client.request('/api/asset/renameAsset', { oldPath, newName });
}

export async function deleteAsset(
    client: SiYuanClient,
    path: string,
): Promise<unknown> {
    return client.request('/api/asset/deleteAsset', { path });
}

export async function setImageAlpha(
    client: SiYuanClient,
    path: string,
    alpha: number,
): Promise<unknown> {
    return client.request('/api/asset/setImageAlpha', { path, alpha });
}

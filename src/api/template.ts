import type { SiYuanClient } from './client';
import type {
    IReqRenderTemplate,
    IReqRenderSprig,
} from '../types/api';

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

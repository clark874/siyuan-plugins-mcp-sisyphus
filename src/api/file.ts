import type { SiYuanClient } from './client';
import type {
    IReqExportMdContent,
    IResExportMdContent,
} from '../types/api';

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
    return client.requestRead<IResExportMdContent>('/api/export/exportMdContent', request);
}

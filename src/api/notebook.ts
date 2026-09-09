import { SiYuanClient } from './client';
import type { IReslsNotebooks, IResGetNotebookConf, IResSetNotebookConf } from '../types/api';
import type { NotebookConf } from '../types/shared';

/**
 * List all notebooks
 */
export async function listNotebooks(client: SiYuanClient): Promise<IReslsNotebooks> {
    return client.requestRead<IReslsNotebooks>('/api/notebook/lsNotebooks');
}

/**
 * Get notebook configuration
 */
export async function getNotebookConf(client: SiYuanClient, notebook: string): Promise<IResGetNotebookConf> {
    return client.requestRead<IResGetNotebookConf>('/api/notebook/getNotebookConf', { notebook });
}

/**
 * Set notebook configuration
 */
export async function setNotebookConf(client: SiYuanClient, notebook: string, conf: Partial<NotebookConf>): Promise<IResSetNotebookConf> {
    return client.requestWrite<IResSetNotebookConf>('/api/notebook/setNotebookConf', { notebook, conf });
}

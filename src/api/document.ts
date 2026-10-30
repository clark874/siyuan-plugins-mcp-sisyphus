import { SiYuanClient } from './client';
import { randomBytes } from 'node:crypto';
import { requireKernel389 } from './system';
import type {
    IReqCreateDocWithMd,
    IReqGetIDsByHPath,
    IReqGetHPathByID,
    IReqGetHPathByPath,
    IReqGetPathByID,
    IReqListDocsByPath,
    IReqMoveDocs,
    IReqMoveDocsByID,
    IReqRemoveDocByID,
    IReqRenameDoc,
    IReqRenameDocByID,
    IResListDocsByPath,
    IResGetPathByID,
    IResDocOutlinePath,
} from '../types/api';

export interface DocumentIdentity {
    notebook: string;
    id: string;
    parentID: string | null;
    path: string;
    title: { format: 'plain'; text: string; empty: boolean };
    segments: Array<{ id: string; text: string; empty: boolean }>;
    depth: number;
    displayPath: string;
    revision: string;
}

export function isDocumentAddressingError(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'reason' in error &&
        ['pathAmbiguous', 'legacyPathUnsupported', 'indexUnavailable', 'unsupportedTitleFormat', 'targetModeUnsupported'].includes(String(error.reason)));
}

export async function resolveDocPath(client: SiYuanClient, notebook: string, segments: string[], parentID?: string) {
    await requireKernel389(client);
    return client.requestRead<{ status: 'resolved' | 'missing' | 'ambiguous'; resolved: DocumentIdentity | null; candidates: DocumentIdentity[]; candidatesTruncated: boolean }>(
        '/api/filetree/resolveDocPath', { notebook, start: parentID ? { kind: 'document', id: parentID } : { kind: 'root' }, segments });
}

export async function getDocIdentity(client: SiYuanClient, notebook: string, id: string): Promise<DocumentIdentity> {
    await requireKernel389(client);
    const result = await client.requestRead<{ documents: DocumentIdentity[] }>('/api/filetree/getDocPaths', { notebook, ids: [id] });
    const document = result.documents.find(row => row.id === id && row.notebook === notebook);
    if (!document) throw new Error('文档身份不存在或不属于指定笔记本。');
    return document;
}

export async function createDocByParent(client: SiYuanClient, notebook: string, parentID: string | null, title: string, markdown: string, expectedParentRevision?: string) {
    await requireKernel389(client);
    const now = new Date();
    const prefix = [now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()]
        .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0')).join('');
    const id = `${prefix}-${randomBytes(5).toString('hex').slice(0, 7)}`;
    let result: { id: string; document: DocumentIdentity };
    try {
        result = await client.requestWrite('/api/filetree/createDocByParent', {
            notebook, parentID, id, title: { format: 'plain', text: title }, markdown,
            ...(expectedParentRevision ? { expectedParentRevision } : {}),
        });
    } catch (error) {
        if (error instanceof Error) error.message += `；既定文档 ID：${id}。请先按 ID 回读确认结果，不要自动重复创建。`;
        throw error;
    }
    if (result.id !== id) throw new Error('结构化创建回读的文档标识不一致，请按返回状态核对，勿重复创建。');
    return result;
}


/**
 * Create a new document with markdown content
 * @returns Document ID (string)
 */
export async function createDoc(
    client: SiYuanClient,
    notebook: string,
    path: string,
    markdown: string
): Promise<string> {
    return client.requestWrite<string>('/api/filetree/createDocWithMd', {
        notebook,
        path,
        markdown,
    } as IReqCreateDocWithMd);
}

/**
 * Rename a document by path
 */
export async function renameDoc(
    client: SiYuanClient,
    notebook: string,
    path: string,
    title: string
): Promise<null> {
    return client.requestWrite<null>('/api/filetree/renameDoc', {
        notebook,
        path,
        title,
    } as IReqRenameDoc);
}

/**
 * Rename a document by ID
 */
export async function renameDocByID(
    client: SiYuanClient,
    id: string,
    title: string
): Promise<null> {
    return client.requestWrite<null>('/api/filetree/renameDocByID', {
        id,
        title,
    } as IReqRenameDocByID);
}

/**
 * Remove a document by ID
 */
export async function removeDocByID(
    client: SiYuanClient,
    id: string
): Promise<null> {
    return client.requestWrite<null>('/api/filetree/removeDocByID', {
        id,
    } as IReqRemoveDocByID);
}

/**
 * Move multiple documents to a new location
 */
export async function moveDocs(
    client: SiYuanClient,
    fromPaths: string[],
    toNotebook: string,
    toPath: string
): Promise<null> {
    return client.requestWrite<null>('/api/filetree/moveDocs', {
        fromPaths,
        toNotebook,
        toPath,
    } as IReqMoveDocs);
}

/**
 * Move multiple documents by ID to a new parent
 */
export async function moveDocsByID(
    client: SiYuanClient,
    fromIDs: string[],
    toID: string
): Promise<null> {
    return client.requestWrite<null>('/api/filetree/moveDocsByID', {
        fromIDs,
        toID,
    } as IReqMoveDocsByID);
}

/**
 * Get hierarchical path by file path
 */
export async function getHPathByPath(
    client: SiYuanClient,
    notebook: string,
    path: string
): Promise<string> {
    return client.requestRead<string>('/api/filetree/getHPathByPath', {
        notebook,
        path,
    } as IReqGetHPathByPath);
}

/**
 * Get hierarchical path by document ID
 */
export async function getHPathByID(
    client: SiYuanClient,
    id: string
): Promise<string> {
    return client.requestRead<string>('/api/filetree/getHPathByID', {
        id,
    } as IReqGetHPathByID);
}

/**
 * Get file path by document ID
 */
export async function getPathByID(
    client: SiYuanClient,
    id: string
): Promise<IResGetPathByID> {
    return client.requestRead<IResGetPathByID>('/api/filetree/getPathByID', {
        id,
    } as IReqGetPathByID);
}

/**
 * Get document IDs by hierarchical path
 */
export async function getIDsByHPath(
    client: SiYuanClient,
    path: string,
    notebook: string
): Promise<string[]> {
    return client.requestRead<string[]>('/api/filetree/getIDsByHPath', {
        path,
        notebook,
    } as IReqGetIDsByHPath);
}

/**
 * List direct child documents by notebook + storage path
 */
export async function listDocsByPath(
    client: SiYuanClient,
    notebook: string,
    path: string,
    options: Omit<IReqListDocsByPath, 'notebook' | 'path'> = {},
): Promise<IResListDocsByPath> {
    return client.requestRead<IResListDocsByPath>('/api/filetree/listDocsByPath', {
        notebook,
        path,
        ...options,
    } as IReqListDocsByPath);
}

export async function changeFileTreeSort(client: SiYuanClient, notebook: string, paths: string[]): Promise<null> {
    return client.requestWrite<null>('/api/filetree/changeSort', { notebook, paths });
}

/**
 * Set a document's direct-child sort mode. Pass null to restore inheritance.
 * Available in SiYuan 3.8.1 and later.
 */
export async function setDocSortMode(client: SiYuanClient, id: string, sortMode: number | null): Promise<null> {
    return client.requestWrite<null>('/api/filetree/setDocSortMode', { id, sortMode });
}

export async function listDocTree(
    client: SiYuanClient,
    notebook: string,
    path: string,
): Promise<unknown> {
    return client.requestRead('/api/filetree/listDocTree', { notebook, path });
}

export async function searchDocs(
    client: SiYuanClient,
    keyword: string,
    excludeIDs?: string[],
): Promise<unknown> {
    return client.requestRead('/api/filetree/searchDocs', {
        k: keyword,
        excludeIDs,
    });
}

export async function getDoc(
    client: SiYuanClient,
    id: string,
    mode?: number,
    size?: number,
): Promise<unknown> {
    return client.requestRead('/api/filetree/getDoc', {
        id,
        mode,
        size,
    });
}

export async function getDocOutline(
    client: SiYuanClient,
    id: string,
    preview = false,
    notebook?: string,
): Promise<IResDocOutlinePath[]> {
    return client.requestRead<IResDocOutlinePath[]>('/api/outline/getDocOutline', {
        id,
        preview,
        ...(notebook ? { notebook } : {}),
    });
}

export async function createEmptyDoc(
    client: SiYuanClient,
    notebook: string,
    path: string,
    title: string,
    md = '',
    sorts?: string[],
): Promise<{ id: string }> {
    return client.requestWrite('/api/filetree/createDoc', { notebook, path, title, md, sorts });
}

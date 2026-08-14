import type { SiYuanClient } from './client';

export interface WorkspaceDirEntry {
    name: string;
    isDir: boolean;
    isSymlink: boolean;
    updated?: number;
}

export async function readDir(client: SiYuanClient, path: string): Promise<WorkspaceDirEntry[]> {
    const response = await client.requestRead<unknown>('/api/file/readDir', { path });
    if (!Array.isArray(response)) return [];
    return response.flatMap((value) => {
        if (value === null || typeof value !== 'object') return [];
        const entry = value as Record<string, unknown>;
        if (typeof entry.name !== 'string') return [];
        return [{
            name: entry.name,
            isDir: entry.isDir === true,
            isSymlink: entry.isSymlink === true,
            updated: typeof entry.updated === 'number' ? entry.updated : undefined,
        }];
    });
}

export async function removeFile(client: SiYuanClient, path: string): Promise<void> {
    await client.requestWrite<null>('/api/file/removeFile', { path });
}

export async function renameFile(client: SiYuanClient, path: string, newPath: string): Promise<void> {
    await client.requestWrite<null>('/api/file/renameFile', { path, newPath });
}

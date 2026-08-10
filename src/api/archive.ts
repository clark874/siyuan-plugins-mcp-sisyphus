import type { SiYuanClient } from './client';

export async function zipWorkspaceEntry(client: SiYuanClient, path: string, zipPath: string): Promise<void> {
    await client.request<null>('/api/archive/zip', { path, zipPath });
}

export async function unzipWorkspaceEntry(client: SiYuanClient, zipPath: string, path: string): Promise<void> {
    await client.request<null>('/api/archive/unzip', { zipPath, path });
}

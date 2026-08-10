import type { SiYuanClient } from '../api/client';
import * as workspaceFilesApi from '../api/workspace-files';
import { secureRandomUUID, sha256Hex } from '../shared/crypto';

export const CONTROL_PLANE_ROOT = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/control-plane';

export interface ControlTargetLock {
    owner: string;
    target: string;
    path: string;
    createdAt: string;
}

function assertRecordID(id: string): string {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid control-plane record ID.');
    return id;
}

function recordPath(kind: 'plans' | 'changes', id: string): string {
    return `${CONTROL_PLANE_ROOT}/${kind}/${assertRecordID(id)}.json`;
}

export async function writeRecord(client: SiYuanClient, kind: 'plans' | 'changes', id: string, value: unknown): Promise<void> {
    await client.writeFile(recordPath(kind, id), JSON.stringify(value, null, 2));
}

export async function readRecord<T>(client: SiYuanClient, kind: 'plans' | 'changes', id: string): Promise<T> {
    const raw = await client.readFile(recordPath(kind, id));
    return JSON.parse(raw) as T;
}

export async function removeRecord(client: SiYuanClient, kind: 'plans' | 'changes', id: string): Promise<void> {
    await workspaceFilesApi.removeFile(client, recordPath(kind, id));
}

export async function listRecordIDs(client: SiYuanClient, kind: 'plans' | 'changes'): Promise<string[]> {
    try {
        const entries = await workspaceFilesApi.readDir(client, `${CONTROL_PLANE_ROOT}/${kind}`);
        return entries
            .filter((entry) => !entry.isDir && !entry.isSymlink && /^[0-9a-f-]{36}\.json$/.test(entry.name))
            .map((entry) => entry.name.slice(0, -5));
    } catch {
        return [];
    }
}

async function removeIfPresent(client: SiYuanClient, path: string): Promise<void> {
    await workspaceFilesApi.removeFile(client, path).catch(() => undefined);
}

export async function acquireTargetLock(client: SiYuanClient, target: string): Promise<ControlTargetLock> {
    const owner = secureRandomUUID();
    const path = `${CONTROL_PLANE_ROOT}/locks/${sha256Hex(target)}`;
    const candidatePath = `${CONTROL_PLANE_ROOT}/lock-candidates/${owner}`;
    const lock: ControlTargetLock = {
        owner,
        target,
        path,
        createdAt: new Date().toISOString(),
    };
    await client.createDirectory(candidatePath);
    await client.writeFile(`${candidatePath}/owner.json`, JSON.stringify(lock));

    const promote = async (): Promise<void> => {
        await workspaceFilesApi.renameFile(client, candidatePath, path);
    };
    try {
        await promote();
        return lock;
    } catch {
        await removeIfPresent(client, candidatePath);
        throw new Error(`A persistent control-plane operation is already in progress for target: ${target}. Locks are fail-closed and require manual audit after an abnormal process exit.`);
    }
}

export async function releaseTargetLock(client: SiYuanClient, lock: ControlTargetLock): Promise<void> {
    try {
        const raw = await client.readFileTextLimited(`${lock.path}/owner.json`, 16 * 1024);
        const current = JSON.parse(raw.content) as Partial<ControlTargetLock>;
        if (current.owner !== lock.owner) return;
    } catch {
        return;
    }
    await workspaceFilesApi.removeFile(client, lock.path);
}

import fs from 'fs';
import path from 'path';

import type { SiYuanClient } from '../api/client';

export type NotebookPermission = 'none' | 'r' | 'rw' | 'rwd';
const VALID_NOTEBOOK_PERMISSIONS: NotebookPermission[] = ['none', 'r', 'rw', 'rwd'];
const LEGACY_NOTEBOOK_PERMISSION_MAP = {
    none: 'none',
    readonly: 'r',
    write: 'rw',
} as const;

const PERMISSIONS_FILENAME = 'notebookPermissions';
const PERMISSIONS_API_PATH = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/notebookPermissions';
const DEBUG_PERMISSIONS = process.env.SIYUAN_MCP_DEBUG_PERMISSIONS === '1';

export type PermissionsSource =
    | { kind: 'api' }
    | { kind: 'fs'; path: string }
    | { kind: 'none'; attemptedPaths: string[] };

function logPermissionDebug(...args: unknown[]) {
    if (DEBUG_PERMISSIONS) {
        console.error('[MCP]', ...args);
    }
}

function isNotebookPermission(value: unknown): value is NotebookPermission {
    return typeof value === 'string' && VALID_NOTEBOOK_PERMISSIONS.includes(value as NotebookPermission);
}

function migrateNotebookPermission(value: unknown): NotebookPermission {
    if (isNotebookPermission(value)) {
        return value;
    }
    if (typeof value === 'string' && value in LEGACY_NOTEBOOK_PERMISSION_MAP) {
        return LEGACY_NOTEBOOK_PERMISSION_MAP[value as keyof typeof LEGACY_NOTEBOOK_PERMISSION_MAP];
    }
    return 'none';
}

function normalizePermissionsRecord(value: unknown): Record<string, NotebookPermission> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(value).map(([notebookId, permission]) => [
            notebookId,
            migrateNotebookPermission(permission),
        ]),
    );
}

function hasPermissionRecordChanged(rawValue: unknown, normalizedValue: Record<string, NotebookPermission>): boolean {
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
        return false;
    }

    const rawEntries = Object.entries(rawValue);
    if (rawEntries.length !== Object.keys(normalizedValue).length) {
        return true;
    }

    return rawEntries.some(([notebookId, permission]) => normalizedValue[notebookId] !== permission);
}

function resolvePermissionsPaths(): string[] {
    const paths: string[] = [];
    const envDataDir = process.env.SIYUAN_DATA_DIR;
    if (envDataDir) {
        paths.push(path.join(envDataDir, 'data', 'storage', 'petal', 'siyuan-plugins-mcp-sisyphus', PERMISSIONS_FILENAME));
        paths.push(path.join(envDataDir, 'storage', 'petal', 'siyuan-plugins-mcp-sisyphus', PERMISSIONS_FILENAME));
    }
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    if (homeDir) {
        paths.push(path.join(homeDir, 'SiYuan', 'data', 'storage', 'petal', 'siyuan-plugins-mcp-sisyphus', PERMISSIONS_FILENAME));
        paths.push(path.join(homeDir, '.siyuan', 'data', 'storage', 'petal', 'siyuan-plugins-mcp-sisyphus', PERMISSIONS_FILENAME));
        if (process.platform === 'win32') {
            const appData = process.env.APPDATA || '';
            if (appData) {
                paths.push(path.join(appData, 'SiYuan', 'data', 'storage', 'petal', 'siyuan-plugins-mcp-sisyphus', PERMISSIONS_FILENAME));
            }
        }
    }
    return paths;
}

function logResolvedPermissionsSource(source: PermissionsSource): void {
    if (source.kind === 'api') {
        logPermissionDebug('Permissions source selected:', 'api');
        return;
    }

    if (source.kind === 'fs') {
        logPermissionDebug('Permissions source selected:', 'fs', source.path);
        return;
    }

    logPermissionDebug('Permissions source selected:', 'none', 'attemptedPaths=', source.attemptedPaths);
}

export class PermissionManager {
    private savePath: string | null = null;
    private permissions: Record<string, NotebookPermission> = {};
    private client: SiYuanClient | null = null;
    private loaded = false;
    private source: PermissionsSource | null = null;
    private resolvedApiContent: string | null = null;

    constructor(client?: SiYuanClient) {
        this.client = client ?? null;
    }

    /**
     * Load permissions from SiYuan API (preferred) or filesystem
     */
    async load(): Promise<void> {
        // Already loaded, skip
        if (this.loaded) return;

        this.source = await this.resolvePermissionsSource();
        logResolvedPermissionsSource(this.source);

        if (this.source.kind === 'api' && this.client) {
            try {
                const content = this.resolvedApiContent ?? (await this.client.readFile(PERMISSIONS_API_PATH));
                const rawPermissions = JSON.parse(content);
                this.permissions = normalizePermissionsRecord(rawPermissions);
                this.loaded = true;
                if (hasPermissionRecordChanged(rawPermissions, this.permissions)) {
                    await this.save();
                }
                logPermissionDebug('Permissions loaded from API:', Object.keys(this.permissions).length, 'entries');
                return;
            } catch (e) {
                logPermissionDebug('Failed to load permissions from resolved API source:', e);
            }
        }

        if (this.source.kind === 'fs') {
            const filePath = this.source.path;
            try {
                const rawPermissions = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                this.permissions = normalizePermissionsRecord(rawPermissions);
                this.savePath = filePath;
                this.loaded = true;
                if (hasPermissionRecordChanged(rawPermissions, this.permissions)) {
                    await this.save();
                }
                logPermissionDebug('Permissions loaded from filesystem:', filePath, Object.keys(this.permissions).length, 'entries');
                return;
            } catch (e) {
                logPermissionDebug('Failed to parse permissions from resolved filesystem source:', filePath, e);
            }
        }

        this.permissions = {};
        this.loaded = true;
        this.savePath = null;
    }

    /**
     * Force reload permissions from storage
     */
    async reload(): Promise<void> {
        this.loaded = false;
        this.resolvedApiContent = null;
        await this.load();
    }

    private async resolvePermissionsSource(): Promise<PermissionsSource> {
        this.resolvedApiContent = null;
        const attemptedPaths = resolvePermissionsPaths();

        if (this.client) {
            try {
                this.resolvedApiContent = await this.client.readFile(PERMISSIONS_API_PATH);
                return { kind: 'api' };
            } catch (error) {
                logPermissionDebug('Permissions API source unavailable:', error);
            }
        }

        for (const candidatePath of attemptedPaths) {
            if (fs.existsSync(candidatePath)) {
                return { kind: 'fs', path: candidatePath };
            }
        }

        return { kind: 'none', attemptedPaths };
    }

    private getFallbackSavePath(): string {
        if (this.source?.kind === 'fs') {
            return this.source.path;
        }

        if (!this.savePath) {
            const fallbackPath =
                this.source?.kind === 'none'
                    ? this.source.attemptedPaths[0]
                    : resolvePermissionsPaths()[0];
            this.savePath = fallbackPath ?? path.join(process.cwd(), PERMISSIONS_FILENAME);
        }

        return this.savePath;
    }

    async save(): Promise<void> {
        const serialized = JSON.stringify(this.permissions, null, 2);

        if (!this.source) {
            this.source = await this.resolvePermissionsSource();
        }

        if (this.source.kind === 'api' && this.client) {
            await this.client.writeFile(PERMISSIONS_API_PATH, serialized);
            this.loaded = true;
            return;
        }

        const savePath = this.getFallbackSavePath();
        fs.mkdirSync(path.dirname(savePath), { recursive: true });
        fs.writeFileSync(savePath, serialized, 'utf-8');
        this.savePath = savePath;
        this.source = { kind: 'fs', path: savePath };
        this.loaded = true;
    }

    get(notebookId: string): NotebookPermission {
        const permission = this.permissions[notebookId];
        return isNotebookPermission(permission) ? permission : 'rwd';
    }

    async set(notebookId: string, perm: NotebookPermission): Promise<void> {
        this.permissions[notebookId] = perm;
        await this.save();
    }

    getAll(): Record<string, NotebookPermission> {
        return { ...this.permissions };
    }

    canRead(notebookId: string): boolean {
        return this.get(notebookId) !== 'none';
    }

    canWrite(notebookId: string): boolean {
        return ['rw', 'rwd'].includes(this.get(notebookId));
    }

    canDelete(notebookId: string): boolean {
        return this.get(notebookId) === 'rwd';
    }
}

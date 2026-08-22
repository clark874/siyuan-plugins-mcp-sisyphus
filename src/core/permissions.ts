import type { SiYuanClient } from '../api/client';
import { AccessPolicyEngine, type AccessPolicyDocumentContext } from './access-policy';

export type NotebookPermission = 'none' | 'r' | 'rw' | 'rwd';
const VALID_NOTEBOOK_PERMISSIONS: NotebookPermission[] = ['none', 'r', 'rw', 'rwd'];
const LEGACY_NOTEBOOK_PERMISSION_MAP = {
    none: 'none',
    readonly: 'r',
    write: 'rw',
} as const;

export const PERMISSIONS_API_PATH = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/notebookPermissions';
const DEBUG_PERMISSIONS = process.env.SIYUAN_MCP_DEBUG_PERMISSIONS === '1';
const PERMISSION_RANK: Record<NotebookPermission, number> = {
    none: 0,
    r: 1,
    rw: 2,
    rwd: 3,
};

function leastPermissive(left: NotebookPermission, right: NotebookPermission): NotebookPermission {
    return PERMISSION_RANK[left] <= PERMISSION_RANK[right] ? left : right;
}

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

export class PermissionManager {
    private permissions: Record<string, NotebookPermission> = {};
    private client: SiYuanClient | null = null;
    private accessPolicy: AccessPolicyEngine | null = null;
    private loaded = false;

    constructor(client?: SiYuanClient) {
        this.client = client ?? null;
        this.accessPolicy = client ? new AccessPolicyEngine(client) : null;
    }

    /**
     * Load permissions from SiYuan API
     */
    async load(): Promise<void> {
        // Already loaded, skip
        if (this.loaded) return;
        if (!this.client) {
            throw new Error('[Permissions] No SiYuan client available; cannot load permissions.');
        }

        let content: string;
        try {
            content = await this.client.readFile(PERMISSIONS_API_PATH);
        } catch (error) {
            logPermissionDebug('Failed to read permissions from API:', error);
            throw new Error(
                `[Permissions] Failed to read permissions from SiYuan API: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        if (!content || !content.trim()) {
            this.permissions = {};
            await this.accessPolicy?.load();
            this.loaded = true;
            logPermissionDebug('Permissions not found in API, using empty state');
            return;
        }

        let rawPermissions: unknown;
        try {
            rawPermissions = JSON.parse(content);
        } catch (error) {
            logPermissionDebug('Failed to parse permissions JSON from API:', error);
            throw new Error(
                `[Permissions] Permissions file at ${PERMISSIONS_API_PATH} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        this.permissions = normalizePermissionsRecord(rawPermissions);
        await this.accessPolicy?.load();
        this.loaded = true;
        logPermissionDebug('Permissions loaded from API:', Object.keys(this.permissions).length, 'entries');
    }

    /**
     * Force reload permissions from storage
     */
    async reload(): Promise<void> {
        this.loaded = false;
        await this.load();
    }

    async save(): Promise<void> {
        if (!this.client) {
            throw new Error('[Permissions] No SiYuan client available; cannot save permissions.');
        }

        const serialized = JSON.stringify(this.permissions, null, 2);
        await this.client.writeFile(PERMISSIONS_API_PATH, serialized);
        this.loaded = true;
    }

    get(notebookId: string): NotebookPermission {
        const permission = this.permissions[notebookId];
        return isNotebookPermission(permission) ? permission : 'r';
    }

    async set(notebookId: string, perm: NotebookPermission): Promise<void> {
        this.permissions[notebookId] = perm;
        await this.save();
    }

    getAll(): Record<string, NotebookPermission> {
        return { ...this.permissions };
    }

    hasDocumentAccessPolicies(): boolean {
        return this.accessPolicy?.hasPolicies() ?? false;
    }

    getEffectiveDocumentPermission(
        notebookId: string,
        context: AccessPolicyDocumentContext,
    ): NotebookPermission {
        const notebookPermission = this.get(notebookId);
        const documentPermission = this.accessPolicy?.getPermission(context);
        return documentPermission
            ? leastPermissive(notebookPermission, documentPermission)
            : notebookPermission;
    }

    canReadDocument(notebookId: string, context: AccessPolicyDocumentContext): boolean {
        return this.getEffectiveDocumentPermission(notebookId, context) !== 'none';
    }

    canWriteDocument(notebookId: string, context: AccessPolicyDocumentContext): boolean {
        return ['rw', 'rwd'].includes(this.getEffectiveDocumentPermission(notebookId, context));
    }

    canDeleteDocument(notebookId: string, context: AccessPolicyDocumentContext): boolean {
        return this.getEffectiveDocumentPermission(notebookId, context) === 'rwd';
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

import type { SiYuanClient } from '../api/client';

export const ACCESS_POLICIES_API_PATH = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/accessPoliciesV2';

export type AccessPolicyPermission = 'none' | 'r' | 'rw' | 'rwd';
export type AccessPolicyScope = 'document' | 'subtree';

export interface AccessPolicyRule {
    documentId: string;
    scope: AccessPolicyScope;
    permission: AccessPolicyPermission;
}

export interface AccessPolicyDocumentContext {
    documentId?: string;
    path?: string;
}

const VALID_PERMISSIONS = new Set<AccessPolicyPermission>(['none', 'r', 'rw', 'rwd']);
const VALID_SCOPES = new Set<AccessPolicyScope>(['document', 'subtree']);

function isMissingPolicyFile(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /HTTP error: 404|not found|does not exist/i.test(message);
}

function isFileApiErrorEnvelope(value: unknown): value is { code: number; msg: string } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return typeof record.code === 'number'
        && record.code !== 0
        && typeof record.msg === 'string';
}

function isMissingPolicyEnvelope(value: unknown): boolean {
    return isFileApiErrorEnvelope(value)
        && (value.code === 404 || /not found|does not exist/i.test(value.msg));
}

function documentIdsFromPath(path: string | undefined): string[] | null {
    if (typeof path !== 'string' || path.length === 0) return null;
    const ids = path
        .split('/')
        .filter(Boolean)
        .map((segment) => segment.endsWith('.sy') ? segment.slice(0, -3) : segment)
        .filter(Boolean);
    return ids.length > 0 ? ids : null;
}

function readDocumentId(value: Record<string, unknown>): string | null {
    const candidate = value.documentId ?? value.documentID ?? value.docId ?? value.docID;
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

export class AccessPolicyEngine {
    private readonly client: SiYuanClient;
    private documentRules = new Map<string, AccessPolicyPermission>();
    private subtreeRules = new Map<string, AccessPolicyPermission>();
    private malformedDocumentRules = new Set<string>();
    private malformedSubtreeRules = new Set<string>();
    private malformedUnknownScopeIds = new Set<string>();
    private malformedUnknown = false;

    constructor(client: SiYuanClient) {
        this.client = client;
    }

    async load(): Promise<void> {
        this.reset();

        let content: string;
        try {
            content = await this.client.readFile(ACCESS_POLICIES_API_PATH);
        } catch (error) {
            if (isMissingPolicyFile(error)) return;
            this.malformedUnknown = true;
            return;
        }

        if (!content || !content.trim()) return;

        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch {
            this.malformedUnknown = true;
            return;
        }
        if (isMissingPolicyEnvelope(parsed)) return;
        if (isFileApiErrorEnvelope(parsed)) {
            this.malformedUnknown = true;
            return;
        }

        const rules = this.readRulesContainer(parsed);
        if (!rules) {
            this.malformedUnknown = true;
            return;
        }

        const seenKeys = new Set<string>();
        for (const rawRule of rules) {
            if (!rawRule || typeof rawRule !== 'object' || Array.isArray(rawRule)) {
                this.malformedUnknown = true;
                continue;
            }

            const value = rawRule as Record<string, unknown>;
            const documentId = readDocumentId(value);
            const scope = value.scope;
            const permission = value.permission;
            if (!documentId) {
                this.malformedUnknown = true;
                continue;
            }
            if (!VALID_SCOPES.has(scope as AccessPolicyScope)) {
                this.malformedUnknownScopeIds.add(documentId);
                continue;
            }
            if (!VALID_PERMISSIONS.has(permission as AccessPolicyPermission)) {
                if (scope === 'document') {
                    this.malformedDocumentRules.add(documentId);
                } else {
                    this.malformedSubtreeRules.add(documentId);
                }
                continue;
            }

            const key = `${documentId}\0${scope}`;
            if (seenKeys.has(key)) {
                if (scope === 'document') {
                    this.malformedDocumentRules.add(documentId);
                    this.documentRules.delete(documentId);
                } else {
                    this.malformedSubtreeRules.add(documentId);
                    this.subtreeRules.delete(documentId);
                }
                continue;
            }
            seenKeys.add(key);

            if (scope === 'document') {
                this.documentRules.set(documentId, permission as AccessPolicyPermission);
            } else {
                this.subtreeRules.set(documentId, permission as AccessPolicyPermission);
            }
        }
    }

    hasPolicies(): boolean {
        return this.malformedUnknown
            || this.malformedDocumentRules.size > 0
            || this.malformedSubtreeRules.size > 0
            || this.malformedUnknownScopeIds.size > 0
            || this.documentRules.size > 0
            || this.subtreeRules.size > 0;
    }

    getPermission(context: AccessPolicyDocumentContext): AccessPolicyPermission | null {
        if (!this.hasPolicies()) return null;
        if (this.malformedUnknown) return 'none';

        const pathDocumentIds = documentIdsFromPath(context.path);
        const currentDocumentId = pathDocumentIds?.at(-1) ?? context.documentId;
        if (!currentDocumentId) return 'none';

        if (this.malformedDocumentRules.has(currentDocumentId)) return 'none';
        if (pathDocumentIds?.some((documentId) => (
            this.malformedSubtreeRules.has(documentId)
            || this.malformedUnknownScopeIds.has(documentId)
        ))) {
            return 'none';
        }
        if (!pathDocumentIds && this.malformedUnknownScopeIds.has(currentDocumentId)) return 'none';

        const exactRule = this.documentRules.get(currentDocumentId);
        if (exactRule) return exactRule;

        if (!pathDocumentIds) {
            return this.subtreeRules.size > 0
                || this.malformedSubtreeRules.size > 0
                || this.malformedUnknownScopeIds.size > 0
                ? 'none'
                : null;
        }

        for (let index = pathDocumentIds.length - 1; index >= 0; index -= 1) {
            const inheritedRule = this.subtreeRules.get(pathDocumentIds[index]);
            if (inheritedRule) return inheritedRule;
        }
        return null;
    }

    private readRulesContainer(parsed: unknown): unknown[] | null {
        if (Array.isArray(parsed)) return parsed;
        if (!parsed || typeof parsed !== 'object') return null;
        const record = parsed as Record<string, unknown>;
        if (record.version !== undefined && record.version !== 2) return null;
        return Array.isArray(record.rules) ? record.rules : null;
    }

    private reset(): void {
        this.documentRules = new Map();
        this.subtreeRules = new Map();
        this.malformedDocumentRules = new Set();
        this.malformedSubtreeRules = new Set();
        this.malformedUnknownScopeIds = new Set();
        this.malformedUnknown = false;
    }
}

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SiYuanClient } from '@/api/client';
import { ACCESS_POLICIES_API_PATH } from '@/core/access-policy';
import { PERMISSIONS_API_PATH, PermissionManager } from '@/core/permissions';

function createManager(notebookPermissions: unknown, policyContent: string) {
    const client = {
        readFile: vi.fn(async (path: string) => {
            if (path === PERMISSIONS_API_PATH) return JSON.stringify(notebookPermissions);
            if (path === ACCESS_POLICIES_API_PATH) return policyContent;
            throw new Error(`Unexpected path: ${path}`);
        }),
        writeFile: vi.fn(),
    } as unknown as SiYuanClient;
    return { client, manager: new PermissionManager(client) };
}

describe('document/subtree access policies', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('inherits the nearest subtree rule and lets an exact document rule override it', async () => {
        const { manager } = createManager({ notebook: 'rwd' }, JSON.stringify({
            version: 2,
            rules: [
                { documentId: 'parent', scope: 'subtree', permission: 'r' },
                { documentId: 'child', scope: 'document', permission: 'rw' },
                { documentId: 'child', scope: 'subtree', permission: 'none' },
            ],
        }));
        await manager.load();

        expect(manager.getEffectiveDocumentPermission('notebook', {
            documentId: 'parent',
            path: '/parent.sy',
        })).toBe('r');
        expect(manager.getEffectiveDocumentPermission('notebook', {
            documentId: 'child',
            path: '/parent/child.sy',
        })).toBe('rw');
        expect(manager.getEffectiveDocumentPermission('notebook', {
            documentId: 'grandchild',
            path: '/parent/child/grandchild.sy',
        })).toBe('none');
    });

    it('never lets a document rule exceed the notebook outer boundary', async () => {
        const { manager } = createManager({ notebook: 'r' }, JSON.stringify({
            version: 2,
            rules: [
                { documentId: 'doc', scope: 'document', permission: 'rwd' },
            ],
        }));
        await manager.load();

        expect(manager.getEffectiveDocumentPermission('notebook', {
            documentId: 'doc',
            path: '/doc.sy',
        })).toBe('r');
        expect(manager.canWriteDocument('notebook', { documentId: 'doc', path: '/doc.sy' })).toBe(false);
    });

    it('fails closed for a malformed matching rule and unknown document context', async () => {
        const { manager } = createManager({ notebook: 'rwd' }, JSON.stringify({
            version: 2,
            rules: [
                { documentId: 'secret', scope: 'subtree', permission: 'admin' },
            ],
        }));
        await manager.load();

        expect(manager.canReadDocument('notebook', {
            documentId: 'secret-child',
            path: '/secret/secret-child.sy',
        })).toBe(false);
        expect(manager.canReadDocument('notebook', {
            documentId: 'public',
            path: '/public.sy',
        })).toBe(true);
        expect(manager.canReadDocument('notebook', {})).toBe(false);
    });

    it('fails closed for every document when the policy JSON is malformed', async () => {
        const { manager } = createManager({ notebook: 'rwd' }, '{not-json');
        await manager.load();

        expect(manager.canReadDocument('notebook', { documentId: 'doc', path: '/doc.sy' })).toBe(false);
    });

    it.each([
        { kind: 'HTTP 404', missingValue: new Error('HTTP error: 404 Not Found') },
        { kind: 'SiYuan file envelope', missingValue: JSON.stringify({ code: 404, msg: 'file not found', data: null }) },
    ])('treats a missing optional policy file returned as $kind as no document policy', async ({ missingValue }) => {
        const client = {
            readFile: vi.fn(async (path: string) => {
                if (path === PERMISSIONS_API_PATH) return JSON.stringify({ notebook: 'rw' });
                if (missingValue instanceof Error) throw missingValue;
                return missingValue;
            }),
            writeFile: vi.fn(),
        } as unknown as SiYuanClient;
        const manager = new PermissionManager(client);

        await manager.load();

        expect(manager.hasDocumentAccessPolicies()).toBe(false);
        expect(manager.getEffectiveDocumentPermission('notebook', {})).toBe('rw');
    });
});

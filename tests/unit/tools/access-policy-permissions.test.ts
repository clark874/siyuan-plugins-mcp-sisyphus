import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SiYuanClient } from '@/api/client';
import * as searchApi from '@/api/search';
import { ACCESS_POLICIES_API_PATH } from '@/core/access-policy';
import { PERMISSIONS_API_PATH, PermissionManager } from '@/core/permissions';
import { ensurePermissionForDocumentId } from '@/tools/internal/context';
import { filterItemsByPermission } from '@/tools/search';

import { parseResult } from '../../helpers/parse-result';

function createFixture(rules: unknown[]) {
    const client = {
        readFile: vi.fn(async (path: string) => {
            if (path === PERMISSIONS_API_PATH) return JSON.stringify({ notebook: 'rwd' });
            if (path === ACCESS_POLICIES_API_PATH) return JSON.stringify({ version: 2, rules });
            throw new Error(`Unexpected path: ${path}`);
        }),
        writeFile: vi.fn(),
    } as unknown as SiYuanClient;
    return { client, manager: new PermissionManager(client) };
}

describe('centralized document access policy enforcement', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('denies delete through ensurePermissionForDocumentId when the effective policy is rw', async () => {
        const { client, manager } = createFixture([
            { documentId: 'doc', scope: 'document', permission: 'rw' },
        ]);
        vi.spyOn(searchApi, 'querySQL').mockResolvedValue([{
            id: 'block',
            root_id: 'doc',
            box: 'notebook',
            path: '/doc.sy',
            content: 'Document',
            type: 'p',
        }]);

        const { context, denied } = await ensurePermissionForDocumentId(client, manager, 'block', 'delete');

        expect(context.documentId).toBe('doc');
        expect(denied).not.toBeNull();
        expect(parseResult(denied!).error).toMatchObject({
            type: 'permission_denied',
            current_permission: 'rw',
            required_permission: 'delete',
        });
    });

    it('hides search rows denied by a document policy even when their notebook is readable', async () => {
        const { client, manager } = createFixture([
            { documentId: 'secret', scope: 'subtree', permission: 'none' },
        ]);
        await manager.load();
        vi.spyOn(searchApi, 'querySQL').mockImplementation(async (_client, stmt) => stmt.includes("id = 'secret-only-block'")
            ? [{
                id: 'secret-only-block',
                root_id: 'secret',
                box: 'notebook',
                path: '/secret.sy',
                content: 'hidden without direct provenance',
                type: 'p',
            }]
            : []);

        const filtered = await filterItemsByPermission(client, [
            { id: 'public-block', root_id: 'public', box: 'notebook', path: '/public.sy', content: 'visible' },
            { id: 'secret-block', root_id: 'secret', box: 'notebook', path: '/secret.sy', content: 'hidden' },
            { id: 'child-block', root_id: 'secret-child', box: 'notebook', path: '/secret/secret-child.sy', content: 'also hidden' },
            { id: 'secret-only-block', box: 'notebook', content: 'must resolve ownership' },
        ], manager);

        expect(filtered.items).toEqual([
            expect.objectContaining({ id: 'public-block' }),
        ]);
        expect(filtered.removedCount).toBe(3);
        expect(filtered.permissionDeniedCount).toBe(3);
    });
});

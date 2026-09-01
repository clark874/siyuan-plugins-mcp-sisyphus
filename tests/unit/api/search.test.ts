import { describe, expect, it, vi } from 'vitest';

import { getBacklinkDoc, getBackmentionDoc, getCriteria, querySQL, setCriterion } from '@/api/search';

describe('search api wrappers', () => {
    it('preserves null backlink payloads so MCP fallback can run', async () => {
        const request = vi.fn().mockResolvedValueOnce(null);
        const client = { request, requestRead: request } as any;

        await expect(getBacklinkDoc(client, 'target-id')).resolves.toBeNull();
        expect(client.request).toHaveBeenCalledWith('/api/ref/getBacklinkDoc', {
            defID: 'target-id',
            keyword: undefined,
            refTreeID: undefined,
        });
    });

    it('preserves null backmention payloads so MCP fallback can run', async () => {
        const request = vi.fn().mockResolvedValueOnce(null);
        const client = { request, requestRead: request } as any;

        await expect(getBackmentionDoc(client, 'target-id')).resolves.toBeNull();
        expect(client.request).toHaveBeenCalledWith('/api/ref/getBackmentionDoc', {
            defID: 'target-id',
            keyword: undefined,
            refTreeID: undefined,
        });
    });

    it('normalizes null SQL payloads to an empty list', async () => {
        const request = vi.fn().mockResolvedValueOnce(null);
        const client = { request, requestRead: request } as any;

        await expect(querySQL(client, 'SELECT 1')).resolves.toEqual([]);
        expect(client.request).toHaveBeenCalledWith('/api/query/sql', {
            stmt: 'SELECT 1',
        });
    });

    it('normalizes kernel criteria into a stable name plus opaque object contract', async () => {
        const request = vi.fn().mockResolvedValueOnce([
            { name: 'wiki-docs', k: 'docs', method: 0, types: { d: true } },
        ]);
        const client = { request, requestRead: request } as any;

        await expect(getCriteria(client)).resolves.toEqual([
            { name: 'wiki-docs', obj: { k: 'docs', method: 0, types: { d: true } } },
        ]);
    });

    it('flattens the opaque object into the kernel criterion and keeps the explicit name authoritative', async () => {
        const request = vi.fn().mockResolvedValueOnce(null);
        const client = { request, requestWrite: request } as any;

        await expect(setCriterion(client, {
            name: 'wiki-docs',
            obj: { name: 'stale-name', k: 'docs', method: 0 },
        })).resolves.toBeNull();
        expect(request).toHaveBeenCalledWith('/api/storage/setCriterion', {
            criterion: { name: 'wiki-docs', k: 'docs', method: 0 },
        });
    });
});

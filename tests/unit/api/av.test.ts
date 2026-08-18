import { describe, expect, it, vi } from 'vitest';

import { getAttributeViewFilterSort, renderAttributeView } from '@/api/av';

describe('av api', () => {
    it('forwards ignoreRows for schema-only rendering', async () => {
        const request = vi.fn().mockResolvedValue({ rows: [], rowCount: 12 });
        const client = { request, requestWrite: request } as never;

        await renderAttributeView(client, { id: 'av-1', ignoreRows: true });

        expect(request).toHaveBeenCalledWith('/api/av/renderAttributeView', {
            id: 'av-1',
            ignoreRows: true,
        });
    });

    it('sends an empty blockID for getAttributeViewFilterSort when omitted', async () => {
        const request = vi.fn().mockResolvedValue({ filters: [], sorts: [] });
        const client = { request, requestRead: request } as never;

        await getAttributeViewFilterSort(client, { id: 'av-1' });

        expect(request).toHaveBeenCalledWith('/api/av/getAttributeViewFilterSort', {
            id: 'av-1',
            blockID: '',
        });
    });
});

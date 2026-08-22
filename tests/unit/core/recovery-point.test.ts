import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/timeline-service', () => ({
    listTimelineNodes: vi.fn(),
    createTimelineNode: vi.fn(),
}));

import { createDestructiveRecoveryPoint } from '@/core/recovery-point';
import { createTimelineNode, listTimelineNodes } from '@/shared/timeline-service';

describe('destructive recovery point', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates a deterministic global timeline node', async () => {
        vi.mocked(listTimelineNodes).mockResolvedValue({ nodes: [], page: 1, pageSize: 200, total: 0, pageCount: 0, hasMore: false });
        vi.mocked(createTimelineNode).mockResolvedValue({
            node: { name: 'placeholder', created: 1, snapshotId: 'snapshot-1', tag: 'tag-1', scope: 'global' },
        });

        const result = await createDestructiveRecoveryPoint({} as never, {
            requestId: '019c1234-5678-7abc-8def-0123456789ab',
            tool: 'block',
            action: 'delete',
            targetIds: ['block-1'],
        });

        expect(createTimelineNode).toHaveBeenCalledWith({}, {
            name: 'sisyphus-prewrite block.delete 019c1234-5678-7abc-8def-0123456789ab',
            scope: 'global',
        });
        expect(result).toMatchObject({ created: true, replayed: false, snapshotId: 'snapshot-1', tag: 'tag-1' });
    });

    it('reuses an existing recovery point for the same requestId', async () => {
        vi.mocked(listTimelineNodes).mockResolvedValue({
            nodes: [{
                name: 'sisyphus-prewrite document.remove 019c1234-5678-7abc-8def-0123456789ab',
                created: 1,
                snapshotId: 'snapshot-existing',
                tag: 'tag-existing',
                scope: 'global',
            }],
            page: 1,
            pageSize: 200,
            total: 1,
            pageCount: 1,
            hasMore: false,
        });

        const result = await createDestructiveRecoveryPoint({} as never, {
            requestId: '019c1234-5678-7abc-8def-0123456789ab',
            tool: 'document',
            action: 'remove',
            targetIds: ['doc-1'],
        });

        expect(createTimelineNode).not.toHaveBeenCalled();
        expect(result).toMatchObject({ created: false, replayed: true, snapshotId: 'snapshot-existing', tag: 'tag-existing' });
    });
});

import { describe, expect, it, vi } from 'vitest';

import {
    cleanupTempSnapshot,
    createTempSnapshotTag,
    isTempSnapshotTag,
    tagTempSnapshot,
} from '@/ui/version-control/temp-snapshot';

describe('version control temp snapshot lifecycle', () => {
    it('creates safe unique temp tags', () => {
        const tag = createTempSnapshotTag(1234567890, 0.42);

        expect(tag).toMatch(/^sisyphus-temp-diff-1234567890-[a-z0-9]+$/);
        expect(isTempSnapshotTag(tag)).toBe(true);
        expect(isTempSnapshotTag('release')).toBe(false);
    });

    it('tags only safe temp snapshot tags', async () => {
        const post = vi.fn(async () => null);

        await tagTempSnapshot(post, 'snapshot-1', 'sisyphus-temp-diff-1-abc');
        await tagTempSnapshot(post, 'snapshot-1', 'release');
        await tagTempSnapshot(post, '', 'sisyphus-temp-diff-1-def');

        expect(post.mock.calls).toEqual([
            ['/api/repo/tagSnapshot', { id: 'snapshot-1', name: 'sisyphus-temp-diff-1-abc' }],
        ]);
    });

    it('cleans temp snapshots by removing tag before purging repo', async () => {
        const post = vi.fn(async () => null);

        await cleanupTempSnapshot(post, 'sisyphus-temp-diff-1-abc');

        expect(post.mock.calls).toEqual([
            ['/api/repo/removeRepoTagSnapshot', { tag: 'sisyphus-temp-diff-1-abc' }],
            ['/api/repo/purgeRepo', {}],
        ]);
    });

    it('does not clean non-temp tags', async () => {
        const post = vi.fn(async () => null);

        await cleanupTempSnapshot(post, 'release');

        expect(post).not.toHaveBeenCalled();
    });
});

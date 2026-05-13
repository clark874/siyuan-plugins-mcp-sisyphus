const TEMP_TAG_PREFIX = 'sisyphus-temp-diff-';

export type VersionControlPost = <T>(endpoint: string, data?: Record<string, unknown>) => Promise<T>;

export function createTempSnapshotTag(now = Date.now(), random = Math.random()): string {
    const suffix = Math.floor(random * 0xffffff).toString(36).padStart(5, '0');
    return `${TEMP_TAG_PREFIX}${now}-${suffix}`;
}

export function isTempSnapshotTag(tag: string): boolean {
    return tag.startsWith(TEMP_TAG_PREFIX);
}

export async function tagTempSnapshot(post: VersionControlPost, snapshotId: string, tag: string): Promise<void> {
    if (!snapshotId || !isTempSnapshotTag(tag)) return;
    await post('/api/repo/tagSnapshot', { id: snapshotId, name: tag });
}

export async function cleanupTempSnapshot(post: VersionControlPost, tag: string): Promise<void> {
    if (!isTempSnapshotTag(tag)) return;
    await post('/api/repo/removeRepoTagSnapshot', { tag });
    await post('/api/repo/purgeRepo', {});
}

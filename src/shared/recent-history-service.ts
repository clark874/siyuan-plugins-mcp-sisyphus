import * as blockApi from '../api/block';
import type { SiYuanClient } from '../api/client';
import * as historyApi from '../api/history';
import {
    attachBlockSectionPaths,
    diffSnapshotBlocks,
    getBlockDiffLineStats,
    type BlockDiffEntry,
    type SnapshotBlock,
} from '../ui/version-control/block-diff';

export type RecentHistoryReason =
    | 'no_history'
    | 'history_insufficient'
    | 'same_content_checkpoint'
    | 'title_changed';
export type RecentHistoryChangeKind = 'content' | 'title';

export interface RecentHistoryBaseline {
    created: string;
    createdAt: string;
    title: string;
    op: string;
}

export interface RecentHistoryComparisonBlock {
    id?: string;
    parentID?: string;
    rootID?: string;
    type?: string;
    subtype?: string;
    markdown: string;
    order: number;
    depth: number;
}

export interface RecentHistoryComparisonChange {
    changeKey: string;
    status: BlockDiffEntry['status'];
    sectionPath: string[];
    old?: RecentHistoryComparisonBlock;
    current?: RecentHistoryComparisonBlock;
}

export interface RecentHistoryComparisonResult {
    source: 'recent_history';
    documentId: string;
    baseline: RecentHistoryBaseline | null;
    current: { updated: string; title: string; path: string };
    scannedCandidates: number;
    noChanges: boolean;
    reason?: RecentHistoryReason;
    changeKinds: RecentHistoryChangeKind[];
    stats: {
        addedLines: number;
        removedLines: number;
        changedBlocks: number;
    };
    changes: RecentHistoryComparisonChange[];
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
    hasMore: boolean;
}

export interface RecentHistoryDiffResult extends RecentHistoryComparisonResult {
    oldContent: string;
    newContent: string;
    allEntries: BlockDiffEntry[];
}

export interface RecentHistoryCompareOptions {
    documentId: string;
    currentUpdated?: string;
    page?: number;
    pageSize?: number;
    maxCandidates?: number;
}

const DEFAULT_MAX_CANDIDATES = 5;

export async function resolveRecentDocumentHistoryDiff(
    client: SiYuanClient,
    options: RecentHistoryCompareOptions,
): Promise<RecentHistoryDiffResult> {
    const current = await blockApi.getBlockDOM(client, options.documentId);
    const currentContent = current?.dom ?? '';
    const currentInfo = asCurrentDocumentInfo(await blockApi.getBlockInfo(client, options.documentId));
    const historySearch = await historyApi.searchHistory(client, {
        query: options.documentId,
        type: 3,
        op: 'all',
        page: 1,
    });
    const timestamps = Array.isArray(historySearch?.histories)
        ? historySearch.histories.filter((value): value is string => typeof value === 'string')
        : [];
    const maxCandidates = Math.min(20, Math.max(1, Math.floor(options.maxCandidates ?? DEFAULT_MAX_CANDIDATES)));
    let scannedCandidates = 0;
    let sameCheckpoint: {
        baseline: RecentHistoryBaseline;
        oldContent: string;
        allEntries: BlockDiffEntry[];
    } | null = null;

    for (const created of timestamps) {
        if (scannedCandidates >= maxCandidates) break;
        const historyItems = await historyApi.getHistoryItems(client, {
            created,
            query: options.documentId,
            type: 3,
            op: 'all',
        });
        const items = Array.isArray(historyItems?.items) ? historyItems.items : [];

        for (const item of items) {
            if (scannedCandidates >= maxCandidates) break;
            if (!item?.path) continue;
            scannedCandidates += 1;
            const historical = await historyApi.getDocHistoryContent(client, item.path, '', false);
            if (historical?.rootID !== options.documentId && historical?.id !== options.documentId) continue;
            const allEntries = attachBlockSectionPaths(diffSnapshotBlocks(historical?.content ?? '', currentContent));
            const changedEntries = allEntries.filter((entry) => entry.status !== 'unchanged');
            const baseline = {
                created,
                createdAt: epochSecondsToIso(created),
                title: item.title || options.documentId,
                op: item.op || '',
            };
            const metadataKinds = detectTitleChange(baseline, currentInfo);
            if (changedEntries.length === 0 && metadataKinds.length === 0) {
                sameCheckpoint ??= {
                    baseline,
                    oldContent: historical?.content ?? '',
                    allEntries,
                };
                continue;
            }
            return buildResult({
                options,
                currentInfo,
                baseline,
                scannedCandidates,
                oldContent: historical.content ?? '',
                newContent: currentContent,
                allEntries,
                changeKinds: [
                    ...(changedEntries.length > 0 ? ['content' as const] : []),
                    ...metadataKinds,
                ],
                ...(changedEntries.length === 0 ? { reason: 'title_changed' as const } : {}),
            });
        }
    }

    if (sameCheckpoint) {
        return buildResult({
            options,
            currentInfo,
            baseline: sameCheckpoint.baseline,
            scannedCandidates,
            oldContent: sameCheckpoint.oldContent,
            newContent: currentContent,
            allEntries: sameCheckpoint.allEntries,
            changeKinds: [],
            reason: 'same_content_checkpoint',
        });
    }

    return buildResult({
        options,
        currentInfo,
        baseline: null,
        scannedCandidates,
        oldContent: '',
        newContent: currentContent,
        allEntries: [],
        changeKinds: [],
        reason: timestamps.length === 0 ? 'no_history' : 'history_insufficient',
    });
}

export async function compareRecentDocumentHistory(
    client: SiYuanClient,
    options: RecentHistoryCompareOptions,
): Promise<RecentHistoryComparisonResult> {
    const result = await resolveRecentDocumentHistoryDiff(client, options);
    const { oldContent: _oldContent, newContent: _newContent, allEntries: _allEntries, ...publicResult } = result;
    return publicResult;
}

function buildResult(input: {
    options: RecentHistoryCompareOptions;
    currentInfo: { title: string; path: string };
    baseline: RecentHistoryBaseline | null;
    scannedCandidates: number;
    oldContent: string;
    newContent: string;
    allEntries: BlockDiffEntry[];
    changeKinds: RecentHistoryChangeKind[];
    reason?: RecentHistoryReason;
}): RecentHistoryDiffResult {
    const changedEntries = input.allEntries.filter((entry) => entry.status !== 'unchanged');
    const page = paginate(changedEntries, input.options.page, input.options.pageSize);
    const lineStats = getBlockDiffLineStats(input.allEntries);
    return {
        source: 'recent_history',
        documentId: input.options.documentId,
        baseline: input.baseline,
        current: {
            updated: input.options.currentUpdated ?? '',
            title: input.currentInfo.title,
            path: input.currentInfo.path,
        },
        scannedCandidates: input.scannedCandidates,
        noChanges: input.changeKinds.length === 0,
        ...(input.reason ? { reason: input.reason } : {}),
        changeKinds: input.changeKinds,
        stats: {
            addedLines: lineStats.added,
            removedLines: lineStats.removed,
            changedBlocks: changedEntries.length,
        },
        changes: page.items.map(publicChange),
        page: page.page,
        pageSize: page.pageSize,
        total: page.total,
        pageCount: page.pageCount,
        hasMore: page.hasMore,
        oldContent: input.oldContent,
        newContent: input.newContent,
        allEntries: input.allEntries,
    };
}

function asCurrentDocumentInfo(value: unknown): { title: string; path: string } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { title: '', path: '' };
    const record = value as Record<string, unknown>;
    return {
        title: typeof record.rootTitle === 'string' ? record.rootTitle.trim() : '',
        path: normalizeStoragePath(record.path),
    };
}

function detectTitleChange(
    baseline: RecentHistoryBaseline,
    current: { title: string; path: string },
): RecentHistoryChangeKind[] {
    const changes: RecentHistoryChangeKind[] = [];
    if (baseline.title && current.title && baseline.title !== current.title) changes.push('title');
    return changes;
}

function normalizeStoragePath(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) return '';
    const normalized = value.trim().replace(/\/{2,}/g, '/');
    return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function paginate<T>(items: T[], pageValue = 1, pageSizeValue = 20) {
    const page = Math.max(1, Math.floor(pageValue));
    const pageSize = Math.min(100, Math.max(1, Math.floor(pageSizeValue)));
    const total = items.length;
    const pageCount = total === 0 ? 0 : Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    return {
        items: items.slice(start, start + pageSize),
        page,
        pageSize,
        total,
        pageCount,
        hasMore: page < pageCount,
    };
}

function publicChange(entry: BlockDiffEntry): RecentHistoryComparisonChange {
    return {
        changeKey: entry.key,
        status: entry.status,
        sectionPath: entry.sectionPath ?? [],
        ...(entry.oldBlock ? { old: publicBlock(entry.oldBlock) } : {}),
        ...(entry.newBlock ? { current: publicBlock(entry.newBlock) } : {}),
    };
}

function publicBlock(block: SnapshotBlock): RecentHistoryComparisonBlock {
    return {
        ...(block.id ? { id: block.id } : {}),
        ...(block.parentID ? { parentID: block.parentID } : {}),
        ...(block.rootID ? { rootID: block.rootID } : {}),
        ...(block.type ? { type: block.type } : {}),
        ...(block.subtype ? { subtype: block.subtype } : {}),
        markdown: block.markdown || block.text,
        order: block.order,
        depth: block.depth,
    };
}

function epochSecondsToIso(value: string): string {
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) return '';
    return new Date(seconds * 1000).toISOString();
}

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

export type RecentHistoryEmptyReason = 'no_history' | 'no_different_history';

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
    current: { updated: string };
    scannedCandidates: number;
    noChanges: boolean;
    reason?: RecentHistoryEmptyReason;
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
            if (changedEntries.length === 0) continue;
            return buildResult({
                options,
                baseline: {
                    created,
                    createdAt: epochSecondsToIso(created),
                    title: item.title || options.documentId,
                    op: item.op || '',
                },
                scannedCandidates,
                oldContent: historical.content ?? '',
                newContent: currentContent,
                allEntries,
            });
        }
    }

    return buildResult({
        options,
        baseline: null,
        scannedCandidates,
        oldContent: '',
        newContent: currentContent,
        allEntries: [],
        reason: timestamps.length === 0 ? 'no_history' : 'no_different_history',
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
    baseline: RecentHistoryBaseline | null;
    scannedCandidates: number;
    oldContent: string;
    newContent: string;
    allEntries: BlockDiffEntry[];
    reason?: RecentHistoryEmptyReason;
}): RecentHistoryDiffResult {
    const changedEntries = input.allEntries.filter((entry) => entry.status !== 'unchanged');
    const page = paginate(changedEntries, input.options.page, input.options.pageSize);
    const lineStats = getBlockDiffLineStats(input.allEntries);
    return {
        source: 'recent_history',
        documentId: input.options.documentId,
        baseline: input.baseline,
        current: { updated: input.options.currentUpdated ?? '' },
        scannedCandidates: input.scannedCandidates,
        noChanges: changedEntries.length === 0,
        ...(input.reason ? { reason: input.reason } : {}),
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

import type { SiYuanClient } from '../../api/client';
import type { PermissionManager } from '../../core/permissions';
import PromiseLimitPool from '../../shared/promise-pool';
import { createResultResolutionCache, resolveResultItemContext } from '../internal/context';

export interface PermissionFilterResult {
    items: unknown[];
    removedCount: number;
    permissionDeniedCount: number;
    unresolvedContextFilteredCount: number;
    unattributedRowsIncluded: number;
}

export function hasRestrictedNotebookPermissions(permMgr: PermissionManager): boolean {
    const getAll = (permMgr as PermissionManager & { getAll?: () => Record<string, string> }).getAll;
    if (typeof getAll !== 'function') return true;
    return Object.values(getAll.call(permMgr)).some((permission) => permission === 'none');
}

function getNotebookIdFromItem(item: unknown): string | undefined {
    if (!item || typeof item !== 'object') return undefined;
    const typedItem = item as Record<string, unknown>;
    const candidates = [typedItem.notebook, typedItem.box, typedItem.boxID, typedItem.notebookId];
    return candidates.find((value): value is string => typeof value === 'string' && value.length > 0);
}

function filterReadableItems(items: unknown[], permMgr: PermissionManager): { items: unknown[]; removedCount: number } {
    const filteredItems = items.filter((item) => {
        const notebookId = getNotebookIdFromItem(item);
        return !notebookId || permMgr.canRead(notebookId);
    });
    return {
        items: filteredItems,
        removedCount: items.length - filteredItems.length,
    };
}

export function createPartialMetadata(removedCount: number): {
    partial?: boolean;
    filteredOutCount?: number;
    reason?: 'permission_filtered';
    permissionSummary?: {
        filteredOutCount: number;
        reason: 'permission_filtered';
        suggestion: string;
    };
} {
    return removedCount > 0
        ? {
            partial: true,
            filteredOutCount: removedCount,
            reason: 'permission_filtered',
            permissionSummary: {
                filteredOutCount: removedCount,
                reason: 'permission_filtered',
                suggestion: 'Some results were hidden due to notebook permissions. Use notebook(action="get_permissions") to review access before retrying broader searches.',
            },
        }
        : {};
}

export function isPermissionRelatedApiError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return /permission[_\s-]?denied|has permission|read access is required|write access is required/i.test(error.message);
}

export async function filterItemsByPermission(
    client: SiYuanClient,
    items: unknown[],
    permMgr: PermissionManager,
): Promise<PermissionFilterResult> {
    const hasRestrictedNotebook = hasRestrictedNotebookPermissions(permMgr);
    if (!hasRestrictedNotebook) {
        return {
            items: [...items],
            removedCount: 0,
            permissionDeniedCount: 0,
            unresolvedContextFilteredCount: 0,
            unattributedRowsIncluded: items.filter((item) => !getNotebookIdFromItem(item)).length,
        };
    }

    const cache = createResultResolutionCache();
    const keep = new Array<boolean>(items.length).fill(false);
    const unresolvedIndexes: number[] = [];
    let removedCount = 0;
    let permissionDeniedCount = 0;
    let unresolvedContextFilteredCount = 0;

    for (let index = 0; index < items.length; index += 1) {
        const notebookId = getNotebookIdFromItem(items[index]);
        if (notebookId) {
            if (permMgr.canRead(notebookId)) {
                keep[index] = true;
            } else {
                permissionDeniedCount += 1;
                removedCount += 1;
            }
            continue;
        }
        unresolvedIndexes.push(index);
    }

    const pool = new PromiseLimitPool<{ index: number; notebook?: string }>(8);
    for (const index of unresolvedIndexes) {
        pool.add(async () => {
            const context = await resolveResultItemContext(client, items[index], cache);
            return { index, notebook: context?.notebook };
        });
    }

    const resolved = await pool.awaitAll();
    for (const entry of resolved) {
        if (entry.notebook) {
            if (permMgr.canRead(entry.notebook)) {
                keep[entry.index] = true;
            } else {
                permissionDeniedCount += 1;
                removedCount += 1;
            }
            continue;
        }

        unresolvedContextFilteredCount += 1;
        removedCount += 1;
    }

    return {
        items: items.filter((_item, index) => keep[index]),
        removedCount,
        permissionDeniedCount,
        unresolvedContextFilteredCount,
        unattributedRowsIncluded: 0,
    };
}

export async function filterItemsByPermissionAndPath(
    client: SiYuanClient,
    items: unknown[],
    permMgr: PermissionManager,
    scopePath?: string,
): Promise<{ items: unknown[]; permissionFilteredOutCount: number; pathFilteredOutCount: number }> {
    const cache = createResultResolutionCache();
    const filteredItems: unknown[] = [];
    let permissionFilteredOutCount = 0;
    let pathFilteredOutCount = 0;

    const normalizedScopePath = typeof scopePath === 'string' && scopePath.length > 0 ? (scopePath.startsWith('/') ? scopePath : `/${scopePath}`) : undefined;

    for (const item of items) {
        const context = await resolveResultItemContext(client, item, cache);
        if (!context?.notebook || !permMgr.canRead(context.notebook)) {
            permissionFilteredOutCount += 1;
            continue;
        }
        if (normalizedScopePath) {
            if (!context.path || !(context.path === normalizedScopePath || context.path.startsWith(`${normalizedScopePath}/`))) {
                pathFilteredOutCount += 1;
                continue;
            }
        }
        filteredItems.push(item);
    }

    return { items: filteredItems, permissionFilteredOutCount, pathFilteredOutCount };
}

export function filterFullTextSearchResultByPermission<T extends {
    blocks?: unknown[];
    matchedBlockCount?: number;
    matchedRootCount?: number;
}>(result: T, permMgr: PermissionManager): T & { filteredOutBlockCount?: number } {
    if (!Array.isArray(result.blocks)) return result;

    const { items: blocks, removedCount } = filterReadableItems(result.blocks, permMgr);
    const uniqueRoots = new Set<string>();
    for (const block of blocks) {
        if (!block || typeof block !== 'object') continue;
        const typedBlock = block as Record<string, unknown>;
        const rootId = [typedBlock.rootID, typedBlock.rootId, typedBlock.root_id, typedBlock.id, typedBlock.path]
            .find((value): value is string => typeof value === 'string' && value.length > 0);
        if (rootId) uniqueRoots.add(rootId);
    }

    return {
        ...result,
        blocks,
        matchedBlockCount: blocks.length,
        matchedRootCount: uniqueRoots.size,
        ...(removedCount > 0 ? { filteredOutBlockCount: removedCount } : {}),
    };
}

export function filterBacklinkResultByPermission<T extends {
    backlinks?: unknown[];
    backmentions?: unknown[];
}>(result: T, permMgr: PermissionManager): T & { filteredOutCount?: number } {
    const backlinks = Array.isArray(result.backlinks) ? filterReadableItems(result.backlinks, permMgr) : undefined;
    const backmentions = Array.isArray(result.backmentions) ? filterReadableItems(result.backmentions, permMgr) : undefined;
    const removedCount = (backlinks?.removedCount ?? 0) + (backmentions?.removedCount ?? 0);

    return {
        ...result,
        ...(backlinks ? { backlinks: backlinks.items } : {}),
        ...(backmentions ? { backmentions: backmentions.items } : {}),
        ...createPartialMetadata(removedCount),
    };
}

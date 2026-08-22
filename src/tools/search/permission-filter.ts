import type { SiYuanClient } from '../../api/client';
import type { PermissionManager } from '../../core/permissions';
import PromiseLimitPool from '../../shared/promise-pool';
import {
    createResultResolutionCache,
    resolveResultItemContext,
    type ResultItemContext,
} from '../internal/context';

export interface PermissionFilterResult {
    items: unknown[];
    removedCount: number;
    permissionDeniedCount: number;
    unresolvedContextFilteredCount: number;
    unattributedRowsIncluded: number;
}

type DocumentAwarePermissionManager = PermissionManager & {
    hasDocumentAccessPolicies?: () => boolean;
    canReadDocument?: PermissionManager['canReadDocument'];
};

export function hasDocumentAccessPolicies(permMgr: PermissionManager): boolean {
    const manager = permMgr as DocumentAwarePermissionManager;
    return typeof manager.hasDocumentAccessPolicies === 'function'
        ? manager.hasDocumentAccessPolicies()
        : false;
}

export function hasRestrictedNotebookPermissions(permMgr: PermissionManager): boolean {
    const getAll = (permMgr as PermissionManager & { getAll?: () => Record<string, string> }).getAll;
    if (typeof getAll !== 'function') return true;
    return hasDocumentAccessPolicies(permMgr)
        || Object.values(getAll.call(permMgr)).some((permission) => permission === 'none');
}

function getResultItemContext(item: unknown): ResultItemContext | null {
    if (!item || typeof item !== 'object') return null;
    const typedItem = item as Record<string, unknown>;
    const notebook = [typedItem.notebook, typedItem.box, typedItem.boxID, typedItem.notebookId]
        .find((value): value is string => typeof value === 'string' && value.length > 0);
    const path = typeof typedItem.path === 'string' && typedItem.path.length > 0
        ? typedItem.path
        : undefined;
    const documentId = [
        typedItem.rootID,
        typedItem.rootId,
        typedItem.root_id,
        typedItem.docID,
        typedItem.docId,
    ].find((value): value is string => typeof value === 'string' && value.length > 0);
    return notebook || path || documentId ? { notebook, path, documentId } : null;
}

function getNotebookIdFromItem(item: unknown): string | undefined {
    return getResultItemContext(item)?.notebook;
}

function canReadResultContext(permMgr: PermissionManager, context: ResultItemContext | null): boolean {
    if (!context?.notebook) return false;
    const manager = permMgr as DocumentAwarePermissionManager;
    return typeof manager.canReadDocument === 'function'
        ? manager.canReadDocument(context.notebook, {
            documentId: context.documentId,
            path: context.path,
        })
        : permMgr.canRead(context.notebook);
}

function filterReadableItems(items: unknown[], permMgr: PermissionManager): { items: unknown[]; removedCount: number } {
    const documentPoliciesPresent = hasDocumentAccessPolicies(permMgr);
    const filteredItems = items.filter((item) => {
        const context = getResultItemContext(item);
        if (!context?.notebook) return !documentPoliciesPresent;
        return canReadResultContext(permMgr, context);
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
                suggestion: 'Some results were hidden due to notebook or document access policies. Review the configured access scope before retrying broader searches.',
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
    const documentPoliciesPresent = hasDocumentAccessPolicies(permMgr);
    const keep = new Array<boolean>(items.length).fill(false);
    const unresolvedIndexes: number[] = [];
    let removedCount = 0;
    let permissionDeniedCount = 0;
    let unresolvedContextFilteredCount = 0;

    for (let index = 0; index < items.length; index += 1) {
        const context = getResultItemContext(items[index]);
        if (context?.notebook && (!documentPoliciesPresent || context.path || context.documentId)) {
            if (canReadResultContext(permMgr, context)) {
                keep[index] = true;
            } else {
                permissionDeniedCount += 1;
                removedCount += 1;
            }
            continue;
        }
        unresolvedIndexes.push(index);
    }

    const pool = new PromiseLimitPool<{ index: number; context: ResultItemContext | null }>(8);
    for (const index of unresolvedIndexes) {
        pool.add(async () => ({
            index,
            context: await resolveResultItemContext(client, items[index], cache),
        }));
    }

    const resolved = await pool.awaitAll();
    for (const entry of resolved) {
        if (entry.context?.notebook) {
            if (canReadResultContext(permMgr, entry.context)) {
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
        if (!canReadResultContext(permMgr, context)) {
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

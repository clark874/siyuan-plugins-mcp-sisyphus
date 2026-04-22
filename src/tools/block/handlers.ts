import type { SiYuanClient } from '../../api/client';
import * as attributeApi from '../../api/block';
import * as blockApi from '../../api/block';
import type { BlockAction } from '../../core/config';
import { normalizeKramdownResult, stripZeroWidthChars } from '../../core/normalize';
import type { PermissionManager } from '../../core/permissions';
import {
    BlockActionSchema,
    BlockAppendSchema,
    BlockAppendDailyNoteSchema,
    BlockBatchInsertSchema,
    BlockBatchUpdateSchema,
    BlockBreadcrumbSchema,
    BlockDeleteSchema,
    BlockDocInfoSchema,
    BlockDomSchema,
    BlockDocsInfoSchema,
    BlockExistsSchema,
    BlockSetFoldStateSchema,
    BlockGetAttrsSchema,
    BlockGetChildrenSchema,
    BlockGetKramdownSchema,
    BlockInfoSchema,
    BlockInsertSchema,
    BlockMoveSchema,
    BlockPrependSchema,
    BlockPrependDailyNoteSchema,
    BlockRecentUpdatedSchema,
    BlockSetAttrsSchema,
    BlockTransferRefSchema,
    BlockUpdateSchema,
    BlockWordCountSchema,
} from '../../core/types';
import { createResultResolutionCache, ensurePermissionForDocumentId, ensurePermissionForNotebook, resolveDocumentContextById, resolveResultItemContext } from '../context';
import { filterItemsByPermission } from '../search';
import { isMissingBlockError } from '../errorTranslation';
import { createJsonResult, createPaginatedResult, createWriteSuccessResult, paginate, type ToolResult } from '../shared';
import { applyUiRefresh } from '../ui-refresh';


type RecentUpdatedDocumentSummary = {
    documentId: string;
    notebook: string;
    path: string;
    hPath?: string;
    name?: string;
    updatedBlockCount: number;
    sampleBlocks: Array<{
        id?: string;
        type?: string;
        subtype?: string;
        content?: string;
        path?: string;
    }>;
};

function isLowLevelRecentBlockType(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return value !== 'd';
}

function createRecentUpdatedSampleBlock(item: unknown): {
    id?: string;
    type?: string;
    subtype?: string;
    content?: string;
    path?: string;
} {
    if (!item || typeof item !== 'object') return {};
    const typed = item as Record<string, unknown>;
    return {
        ...(typeof typed.id === 'string' ? { id: typed.id } : {}),
        ...(typeof typed.type === 'string' ? { type: typed.type } : {}),
        ...(typeof typed.subtype === 'string' ? { subtype: typed.subtype } : {}),
        ...(typeof typed.content === 'string' ? { content: typed.content } : {}),
        ...(typeof typed.path === 'string' ? { path: typed.path } : {}),
    };
}

async function aggregateRecentUpdatedDocuments(
    client: SiYuanClient,
    items: unknown[],
): Promise<{ documents: RecentUpdatedDocumentSummary[]; containsLowLevelBlocks: boolean }> {
    const cache = createResultResolutionCache();
    const grouped = new Map<string, RecentUpdatedDocumentSummary>();
    let containsLowLevelBlocks = false;

    for (const item of items) {
        if (item && typeof item === 'object') {
            const typedItem = item as Record<string, unknown>;
            if (isLowLevelRecentBlockType(typedItem.type)) {
                containsLowLevelBlocks = true;
            }
        }

        const context = await resolveResultItemContext(client, item, cache);
        if (!context?.documentId || !context.notebook || !context.path) continue;

        let group = grouped.get(context.documentId);
        if (!group) {
            let name: string | undefined;
            let hPath: string | undefined;
            try {
                const resolved = await resolveDocumentContextById(client, context.documentId);
                name = resolved.name;
                hPath = resolved.hPath;
            } catch {
                name = undefined;
                hPath = undefined;
            }

            group = {
                documentId: context.documentId,
                notebook: context.notebook,
                path: context.path,
                ...(hPath ? { hPath } : {}),
                ...(name ? { name } : {}),
                updatedBlockCount: 0,
                sampleBlocks: [],
            };
            grouped.set(context.documentId, group);
        }

        group.updatedBlockCount += 1;
        if (group.sampleBlocks.length < 3) {
            group.sampleBlocks.push(createRecentUpdatedSampleBlock(item));
        }
    }

    return {
        documents: [...grouped.values()],
        containsLowLevelBlocks,
    };
}

function createSlimWriteResult(
    rawResult: unknown,
    context: {
        action: 'insert' | 'prepend' | 'append';
        dataType: string;
        parentID?: string;
        previousID?: string;
        nextID?: string;
    },
): ToolResult {
    const operationBatch = Array.isArray(rawResult) ? rawResult[0] : rawResult;
    const firstOperation = operationBatch && typeof operationBatch === 'object' && Array.isArray((operationBatch as { doOperations?: unknown[] }).doOperations)
        ? (operationBatch as { doOperations: Array<Record<string, unknown>> }).doOperations[0]
        : undefined;

    const id = typeof firstOperation?.id === 'string' ? firstOperation.id : undefined;
    const parentID = typeof firstOperation?.parentID === 'string' ? firstOperation.parentID : context.parentID;
    const previousID = typeof firstOperation?.previousID === 'string' ? firstOperation.previousID : context.previousID;
    const nextID = typeof firstOperation?.nextID === 'string' ? firstOperation.nextID : context.nextID;

    return createWriteSuccessResult({
        action: context.action,
        ...(id ? { id } : {}),
        ...(parentID ? { parentID } : {}),
        ...(previousID ? { previousID } : {}),
        ...(nextID ? { nextID } : {}),
        dataType: context.dataType,
    });
}

function createUpdateResult(
    rawResult: unknown,
    context: {
        id: string;
        dataType: 'markdown' | 'dom';
        data: string;
    },
): ToolResult {
    const payload: Record<string, unknown> = {
        success: true,
        id: context.id,
        dataType: context.dataType,
    };

    if (context.dataType === 'markdown') {
        payload.markdown = stripZeroWidthChars(context.data);
    }

    if (rawResult && typeof rawResult === 'object' && !Array.isArray(rawResult)) {
        const updated = (rawResult as Record<string, unknown>).updated;
        if (updated !== undefined) {
            payload.updated = updated;
        }
    }

    if (context.dataType === 'markdown' && /[\r\n]/.test(context.data)) {
        payload.warning = 'block(update) is best for single-block replacement. Multi-line markdown may be truncated to the first line by SiYuan; use block(append), block(prepend), or block(insert) when you need multiple blocks or tables.';
    }

    return createJsonResult(payload);
}

interface BlockHandlerContext {
    client: SiYuanClient;
    permMgr: PermissionManager;
    rawArgs: Record<string, unknown>;
}

type BlockActionHandler = (ctx: BlockHandlerContext) => Promise<ToolResult>;

const handleInsert: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockInsertSchema.parse(rawArgs);
    const refId = parsed.nextID || parsed.previousID || parsed.parentID;
    let targetDocumentId: string | undefined;
    if (refId) {
        const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, refId, 'write');
        if (denied) return denied;
        targetDocumentId = context.documentId;
    }
    const result = await blockApi.insertBlock(client, parsed.dataType, parsed.data, parsed.nextID, parsed.previousID, parsed.parentID);
    return applyUiRefresh(client, createSlimWriteResult(result, {
        action: 'insert',
        dataType: parsed.dataType,
        parentID: parsed.parentID,
        previousID: parsed.previousID,
        nextID: parsed.nextID,
    }), targetDocumentId ? [{ type: 'reloadProtyle', id: targetDocumentId }] : []);
};

const handlePrepend: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockPrependSchema.parse(rawArgs);
    const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, parsed.parentID, 'write');
    if (denied) return denied;
    const result = await blockApi.prependBlock(client, parsed.dataType, parsed.data, parsed.parentID);
    return applyUiRefresh(client, createSlimWriteResult(result, {
        action: 'prepend',
        dataType: parsed.dataType,
        parentID: parsed.parentID,
    }), [{ type: 'reloadProtyle', id: context.documentId }]);
};

const handleAppend: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockAppendSchema.parse(rawArgs);
    const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, parsed.parentID, 'write');
    if (denied) return denied;
    const result = await blockApi.appendBlock(client, parsed.dataType, parsed.data, parsed.parentID);
    return applyUiRefresh(client, createSlimWriteResult(result, {
        action: 'append',
        dataType: parsed.dataType,
        parentID: parsed.parentID,
    }), [{ type: 'reloadProtyle', id: context.documentId }]);
};

const handleUpdate: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockUpdateSchema.parse(rawArgs);
    const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'write');
    if (denied) return denied;
    const result = await blockApi.updateBlock(client, parsed.dataType, parsed.data, parsed.id);
    return applyUiRefresh(client, createUpdateResult(result, {
        id: parsed.id,
        dataType: parsed.dataType,
        data: parsed.data,
    }), [{ type: 'reloadProtyle', id: context.documentId }]);
};

const handleDelete: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockDeleteSchema.parse(rawArgs);
    const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'delete');
    if (denied) return denied;
    await blockApi.deleteBlock(client, parsed.id);
    return applyUiRefresh(client, createJsonResult({ success: true, id: parsed.id }), [{ type: 'reloadProtyle', id: context.documentId }]);
};

const handleMove: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockMoveSchema.parse(rawArgs);
    const source = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'write');
    if (source.denied) return source.denied;
    if (parsed.parentID) {
        const destination = await ensurePermissionForDocumentId(client, permMgr, parsed.parentID, 'write');
        if (destination.denied) return destination.denied;
    }
    if (parsed.previousID) {
        const sibling = await ensurePermissionForDocumentId(client, permMgr, parsed.previousID, 'write');
        if (sibling.denied) return sibling.denied;
    }
    const result = await blockApi.moveBlock(client, parsed.id, parsed.previousID, parsed.parentID);
    const operations = [{ type: 'reloadProtyle' as const, id: source.context.documentId }];
    if (parsed.parentID) {
        const destination = await ensurePermissionForDocumentId(client, permMgr, parsed.parentID, 'write');
        if (destination.denied) return destination.denied;
        operations.push({ type: 'reloadProtyle', id: destination.context.documentId });
    }
    if (parsed.previousID) {
        const sibling = await ensurePermissionForDocumentId(client, permMgr, parsed.previousID, 'write');
        if (sibling.denied) return sibling.denied;
        operations.push({ type: 'reloadProtyle', id: sibling.context.documentId });
    }
    return applyUiRefresh(client, createWriteSuccessResult({
        id: parsed.id,
        ...(parsed.previousID ? { previousID: parsed.previousID } : {}),
        ...(parsed.parentID ? { parentID: parsed.parentID } : {}),
    }, result), operations);
};

const handleSetFoldState: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockSetFoldStateSchema.parse(rawArgs);
    const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'write');
    if (denied) return denied;
    if (parsed.folded) {
        await blockApi.foldBlock(client, parsed.id);
    } else {
        await blockApi.unfoldBlock(client, parsed.id);
    }
    return applyUiRefresh(client, createJsonResult({ success: true, id: parsed.id, folded: parsed.folded }), [{ type: 'reloadProtyle', id: context.documentId }]);
};

const handleGetKramdown: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockGetKramdownSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
    if (denied) return denied;
    const result = normalizeKramdownResult(await blockApi.getBlockKramdown(client, parsed.id));
    return createJsonResult(result);
};

const handleGetChildren: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockGetChildrenSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
    if (denied) return denied;
    const result = await blockApi.getChildBlocks(client, parsed.id);
    const children = Array.isArray(result) ? result : [];
    const paged = paginate(children, parsed.page ?? 1, parsed.pageSize ?? 50);
    return createPaginatedResult(paged.items, paged, {
        ...(paged.truncated ? {
            hint: 'Use page/pageSize to paginate. For focused reads, use block(action="get_kramdown") or search(action="query_sql") with a parent_id filter.',
        } : {}),
    });
};

const handleTransferRef: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockTransferRefSchema.parse(rawArgs);
    const source = await ensurePermissionForDocumentId(client, permMgr, parsed.fromID, 'write');
    if (source.denied) return source.denied;
    const target = await ensurePermissionForDocumentId(client, permMgr, parsed.toID, 'write');
    if (target.denied) return target.denied;
    await blockApi.transferBlockRef(client, parsed.fromID, parsed.toID, parsed.refIDs);
    return applyUiRefresh(client, createJsonResult({ success: true, fromID: parsed.fromID, toID: parsed.toID }), [
        { type: 'reloadProtyle', id: source.context.documentId },
        { type: 'reloadProtyle', id: target.context.documentId },
    ]);
};

const handleSetAttrs: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockSetAttrsSchema.parse(rawArgs);
    const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'write');
    if (denied) return denied;
    await attributeApi.setBlockAttrs(client, parsed.id, parsed.attrs);
    return applyUiRefresh(client, createJsonResult({ success: true, id: parsed.id, attrs: parsed.attrs }), [{ type: 'reloadProtyle', id: context.documentId }]);
};

const handleGetAttrs: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockGetAttrsSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
    if (denied) return denied;
    const result = await attributeApi.getBlockAttrs(client, parsed.id);
    return createJsonResult(result);
};

const handleExists: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockExistsSchema.parse(rawArgs);
    try {
        const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
        if (denied) return denied;
    } catch (err) {
        if (isMissingBlockError(err)) {
            return createJsonResult({ id: parsed.id, exists: false });
        }
        throw err;
    }
    const exists = await blockApi.checkBlockExist(client, parsed.id);
    return createJsonResult({ id: parsed.id, exists });
};

const handleInfo: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockInfoSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
    if (denied) return denied;
    const result = await blockApi.getBlockInfo(client, parsed.id);
    return createJsonResult(result);
};

const handleBreadcrumb: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockBreadcrumbSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
    if (denied) return denied;
    const result = await blockApi.getBlockBreadcrumb(client, parsed.id, parsed.excludeTypes);
    return createJsonResult(result);
};

const handleDom: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockDomSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
    if (denied) return denied;
    const result = await blockApi.getBlockDOM(client, parsed.id);
    return createJsonResult(result);
};

const handleRecentUpdated: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockRecentUpdatedSchema.parse(rawArgs);
    const result = await blockApi.getRecentUpdatedBlocks(client);
    const items = Array.isArray(result) ? result : [];
    const filtered = await filterItemsByPermission(client, items, permMgr);
    const count = typeof parsed.count === 'number' ? parsed.count : undefined;
    const truncatedItems = typeof count === 'number' ? filtered.items.slice(0, count) : filtered.items;
    const aggregated = await aggregateRecentUpdatedDocuments(client, truncatedItems);
    return createJsonResult({
        documents: aggregated.documents,
        documentCount: aggregated.documents.length,
        count: truncatedItems.length,
        containsLowLevelBlocks: aggregated.containsLowLevelBlocks,
        grouping: 'document',
        primaryView: 'documents',
        items: truncatedItems,
        hint: 'documents is the user-facing summary grouped by root document; items remains the raw recent block stream for advanced consumers.',
        ...(filtered.removedCount > 0 ? {
            partial: true,
            filteredOutCount: filtered.removedCount,
            reason: 'permission_filtered',
        } : {}),
    });
};

const handleWordCount: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockWordCountSchema.parse(rawArgs);
    for (const id of parsed.ids) {
        const { denied } = await ensurePermissionForDocumentId(client, permMgr, id, 'read');
        if (denied) return denied;
    }
    const result = await blockApi.getBlocksWordCount(client, parsed.ids);
    return createJsonResult(result);
};

const handleBatchInsert: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockBatchInsertSchema.parse(rawArgs);
    const reloadIds = new Set<string>();
    for (const block of parsed.blocks) {
        const refId = block.nextID || block.previousID || block.parentID;
        if (!refId) continue;
        const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, refId, 'write');
        if (denied) return denied;
        reloadIds.add(context.documentId);
    }
    const result = await blockApi.batchInsertBlock(client, parsed.blocks);
    return applyUiRefresh(client, createJsonResult({
        success: true,
        action: 'batch_insert',
        count: parsed.blocks.length,
        transactions: result,
    }), [...reloadIds].map((id) => ({ type: 'reloadProtyle' as const, id })));
};

const handleBatchUpdate: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockBatchUpdateSchema.parse(rawArgs);
    const reloadIds = new Set<string>();
    for (const block of parsed.blocks) {
        const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, block.id, 'write');
        if (denied) return denied;
        reloadIds.add(context.documentId);
    }
    const result = await blockApi.batchUpdateBlock(client, parsed.blocks);
    return applyUiRefresh(client, createJsonResult({
        success: true,
        action: 'batch_update',
        count: parsed.blocks.length,
        transactions: result,
    }), [...reloadIds].map((id) => ({ type: 'reloadProtyle' as const, id })));
};

const handleAppendDailyNote: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockAppendDailyNoteSchema.parse(rawArgs);
    const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'write');
    if (denied) return denied;
    const result = await blockApi.appendDailyNoteBlock(client, parsed.notebook, parsed.dataType, parsed.data);
    return applyUiRefresh(client, createJsonResult({
        success: true,
        action: 'append_daily_note',
        notebook: parsed.notebook,
        dataType: parsed.dataType,
        transactions: result,
    }), [{ type: 'reloadFiletree' }]);
};

const handlePrependDailyNote: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockPrependDailyNoteSchema.parse(rawArgs);
    const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'write');
    if (denied) return denied;
    const result = await blockApi.prependDailyNoteBlock(client, parsed.notebook, parsed.dataType, parsed.data);
    return applyUiRefresh(client, createJsonResult({
        success: true,
        action: 'prepend_daily_note',
        notebook: parsed.notebook,
        dataType: parsed.dataType,
        transactions: result,
    }), [{ type: 'reloadFiletree' }]);
};

const handleDocInfo: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockDocInfoSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
    if (denied) return denied;
    const result = await blockApi.getDocInfo(client, parsed.id);
    return createJsonResult(result);
};

const handleDocsInfo: BlockActionHandler = async ({ client, permMgr, rawArgs }) => {
    const parsed = BlockDocsInfoSchema.parse(rawArgs);
    for (const id of parsed.ids) {
        const { denied } = await ensurePermissionForDocumentId(client, permMgr, id, 'read');
        if (denied) return denied;
    }
    const result = await blockApi.getDocsInfo(client, parsed.ids, parsed.refCount ?? false, parsed.av ?? false);
    return createJsonResult(result);
};

export const BLOCK_ACTION_HANDLERS: Record<BlockAction, BlockActionHandler> = {
    insert: handleInsert,
    prepend: handlePrepend,
    append: handleAppend,
    update: handleUpdate,
    delete: handleDelete,
    move: handleMove,
    set_fold_state: handleSetFoldState,
    get_kramdown: handleGetKramdown,
    get_children: handleGetChildren,
    transfer_ref: handleTransferRef,
    set_attrs: handleSetAttrs,
    get_attrs: handleGetAttrs,
    exists: handleExists,
    info: handleInfo,
    breadcrumb: handleBreadcrumb,
    dom: handleDom,
    recent_updated: handleRecentUpdated,
    word_count: handleWordCount,
    batch_insert: handleBatchInsert,
    batch_update: handleBatchUpdate,
    append_daily_note: handleAppendDailyNote,
    prepend_daily_note: handlePrependDailyNote,
    doc_info: handleDocInfo,
    docs_info: handleDocsInfo,
};

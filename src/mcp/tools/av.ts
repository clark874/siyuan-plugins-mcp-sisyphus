import type { SiYuanClient } from '../../api/client';
import * as avApi from '../../api/av';
import * as blockApi from '../../api/block';
import * as transactionApi from '../../api/transaction';
import type { AvAction, CategoryToolConfig } from '../config';
import { AV_ACTION_HINTS, AV_GUIDANCE } from '../help';
import type { PermissionManager } from '../permissions';
import {
    AvActionSchema,
    AvAddColumnSchema,
    AvAddRowsSchema,
    AvBatchSetCellsSchema,
    AvDuplicateBlockSchema,
    AvGetPrimaryKeyValuesSchema,
    AvGetSchema,
    AvRemoveColumnSchema,
    AvRemoveRowsSchema,
    AvSearchSchema,
    AvSetCellSchema,
} from '../types';
import { createResultResolutionCache, ensurePermissionForDocumentId, resolveDocumentContextById, resolveResultItemContext } from './context';
import { isMissingBlockError } from './block';
import { buildAggregatedTool, createActionSchema, createDisabledActionResult, createErrorResult, createJsonResult, createWriteSuccessResult, tryHandleHelpAction, type ActionVariant, type ToolResult } from './shared';
import { applyUiRefresh } from './ui-refresh';

export const AV_TOOL_NAME = 'av';

type StrongCellValueInput = {
    valueType: 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'multi_select' | 'relation' | 'url' | 'email' | 'phone' | 'mAsset';
    text?: string;
    number?: number;
    numberFormat?: string;
    date?: string | number;
    endDate?: string | number;
    includeTime?: boolean;
    checked?: boolean;
    option?: string;
    options?: string[];
    relationBlockIDs?: string[];
    url?: string;
    email?: string;
    phone?: string;
    assets?: Array<{
        type: 'image' | 'file';
        content: string;
        name?: string;
    }>;
};

export const AV_VARIANTS: ActionVariant<AvAction>[] = [
    {
        action: 'get',
        schema: createActionSchema('get', {
            id: { type: 'string', description: 'Attribute view ID' },
        }, ['id'], 'Get the full attribute view payload by AV ID.'),
    },
    {
        action: 'search',
        schema: createActionSchema('search', {
            keyword: { type: 'string', description: 'Keyword to search in attribute view names' },
            excludes: { type: 'array', items: { type: 'string' }, description: 'Optional AV IDs to exclude' },
        }, ['keyword'], 'Search attribute views by keyword.'),
    },
    {
        action: 'add_rows',
        schema: createActionSchema('add_rows', {
            avID: { type: 'string', description: 'Attribute view ID' },
            blockIDs: { type: 'array', items: { type: 'string' }, description: 'Existing block IDs to add as rows' },
            blockID: { type: 'string', description: 'Optional database block ID' },
            viewID: { type: 'string', description: 'Optional target view ID' },
            groupID: { type: 'string', description: 'Optional target group ID' },
            previousID: { type: 'string', description: 'Optional previous row item ID' },
            ignoreDefaultFill: { type: 'boolean', description: 'Skip default fill from filters/groups' },
        }, ['avID', 'blockIDs'], 'Add existing blocks as rows in an attribute view.'),
    },
    {
        action: 'remove_rows',
        schema: createActionSchema('remove_rows', {
            avID: { type: 'string', description: 'Attribute view ID' },
            srcIDs: { type: 'array', items: { type: 'string' }, description: 'Bound row block/item IDs to remove' },
        }, ['avID', 'srcIDs'], 'Remove rows from an attribute view by source IDs.'),
    },
    {
        action: 'add_column',
        schema: createActionSchema('add_column', {
            avID: { type: 'string', description: 'Attribute view ID' },
            keyID: { type: 'string', description: 'Optional new column key ID; MCP generates one when omitted' },
            keyName: { type: 'string', description: 'New column name' },
            keyType: { type: 'string', enum: ['text', 'number', 'date', 'select', 'mSelect', 'url', 'email', 'phone', 'mAsset', 'template', 'created', 'updated', 'checkbox', 'relation', 'rollup', 'lineNumber'], description: 'Column type' },
            keyIcon: { type: 'string', description: 'Optional column icon' },
            previousKeyID: { type: 'string', description: 'Insert after this key ID' },
        }, ['avID', 'keyName', 'keyType'], 'Add a column to an attribute view.'),
    },
    {
        action: 'remove_column',
        schema: createActionSchema('remove_column', {
            avID: { type: 'string', description: 'Attribute view ID' },
            keyID: { type: 'string', description: 'Column key ID' },
            columnID: { type: 'string', description: 'Alias of keyID' },
            removeRelationDest: { type: 'boolean', description: 'Also remove reverse relation metadata' },
        }, ['avID'], 'Remove a column from an attribute view.'),
    },
    {
        action: 'set_cell',
        schema: createActionSchema('set_cell', {
            avID: { type: 'string', description: 'Attribute view ID' },
            rowID: { type: 'string', description: 'Row item ID' },
            columnID: { type: 'string', description: 'Column key ID' },
            valueType: { type: 'string', enum: ['text', 'number', 'date', 'checkbox', 'select', 'multi_select', 'relation', 'url', 'email', 'phone', 'mAsset'], description: 'Cell value type' },
            text: { type: 'string', description: 'Text value when valueType=text' },
            number: { type: 'number', description: 'Number value when valueType=number' },
            numberFormat: { type: 'string', description: 'Optional number format such as commas, percent, USD, or CNY' },
            date: { description: 'Date/time value as ISO text or epoch milliseconds when valueType=date' },
            endDate: { description: 'Optional end date as ISO text or epoch milliseconds for ranged dates' },
            includeTime: { type: 'boolean', description: 'When false, store only the date component' },
            checked: { type: 'boolean', description: 'Checkbox state when valueType=checkbox' },
            option: { type: 'string', description: 'Selected option label when valueType=select' },
            options: { type: 'array', items: { type: 'string' }, description: 'Selected option labels when valueType=multi_select' },
            relationBlockIDs: { type: 'array', items: { type: 'string' }, description: 'Related block IDs when valueType=relation' },
            url: { type: 'string', description: 'URL value when valueType=url' },
            email: { type: 'string', description: 'Email value when valueType=email' },
            phone: { type: 'string', description: 'Phone value when valueType=phone' },
            assets: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        type: { type: 'string', enum: ['image', 'file'], description: 'Asset entry type' },
                        content: { type: 'string', description: 'Asset path stored by SiYuan, e.g. assets/foo.png' },
                        name: { type: 'string', description: 'Optional display name' },
                    },
                    required: ['type', 'content'],
                },
                description: 'Asset entries when valueType=mAsset',
            },
        }, ['avID', 'rowID', 'columnID', 'valueType'], 'Update one attribute view cell using a strong typed input shape.'),
    },
    {
        action: 'batch_set_cells',
        schema: createActionSchema('batch_set_cells', {
            avID: { type: 'string', description: 'Attribute view ID' },
            items: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        rowID: { type: 'string', description: 'Row item ID' },
                        columnID: { type: 'string', description: 'Column key ID' },
                        valueType: { type: 'string', enum: ['text', 'number', 'date', 'checkbox', 'select', 'multi_select', 'relation', 'url', 'email', 'phone', 'mAsset'], description: 'Cell value type' },
                        text: { type: 'string', description: 'Text value when valueType=text' },
                        number: { type: 'number', description: 'Number value when valueType=number' },
                        numberFormat: { type: 'string', description: 'Optional number format such as commas, percent, USD, or CNY' },
                        date: { description: 'Date/time value as ISO text or epoch milliseconds when valueType=date' },
                        endDate: { description: 'Optional end date as ISO text or epoch milliseconds for ranged dates' },
                        includeTime: { type: 'boolean', description: 'When false, store only the date component' },
                        checked: { type: 'boolean', description: 'Checkbox state when valueType=checkbox' },
                        option: { type: 'string', description: 'Selected option label when valueType=select' },
                        options: { type: 'array', items: { type: 'string' }, description: 'Selected option labels when valueType=multi_select' },
                        relationBlockIDs: { type: 'array', items: { type: 'string' }, description: 'Related block IDs when valueType=relation' },
                        url: { type: 'string', description: 'URL value when valueType=url' },
                        email: { type: 'string', description: 'Email value when valueType=email' },
                        phone: { type: 'string', description: 'Phone value when valueType=phone' },
                        assets: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    type: { type: 'string', enum: ['image', 'file'], description: 'Asset entry type' },
                                    content: { type: 'string', description: 'Asset path stored by SiYuan, e.g. assets/foo.png' },
                                    name: { type: 'string', description: 'Optional display name' },
                                },
                                required: ['type', 'content'],
                            },
                            description: 'Asset entries when valueType=mAsset',
                        },
                    },
                    required: ['rowID', 'columnID', 'valueType'],
                },
                description: 'Batch cell updates',
            },
        }, ['avID', 'items'], 'Batch update multiple attribute view cells.'),
    },
    {
        action: 'duplicate_block',
        schema: createActionSchema('duplicate_block', {
            avID: { type: 'string', description: 'Source attribute view ID' },
            previousID: { type: 'string', description: 'Optional block ID to insert the duplicated database block after' },
        }, ['avID'], 'Duplicate a database block from an existing attribute view. By default MCP inserts the duplicate after the source database block; previousID overrides that insertion target.'),
    },
    {
        action: 'get_primary_key_values',
        schema: createActionSchema('get_primary_key_values', {
            avID: { type: 'string', description: 'Attribute view ID' },
            keyword: { type: 'string', description: 'Optional keyword filter for primary key values' },
            page: { type: 'number', description: 'Page number (1-based), default 1' },
            pageSize: { type: 'number', description: 'Rows per page, default all' },
        }, ['avID'], 'Get primary key values for an attribute view.'),
    },
];

export function listAvTools(config: CategoryToolConfig<AvAction>) {
    return buildAggregatedTool(
        AV_TOOL_NAME,
        '🗃️ Grouped attribute-view (database) operations.',
        config,
        AV_VARIANTS,
        {
            guidance: AV_GUIDANCE,
            actionHints: AV_ACTION_HINTS,
        },
    );
}

interface AvHandlerContext {
    client: SiYuanClient;
    permMgr: PermissionManager;
    rawArgs: Record<string, unknown>;
}

function generateSiYuanNodeId(now = new Date()): string {
    const pad = (value: number, length = 2) => String(value).padStart(length, '0');
    const timestamp = [
        now.getFullYear(),
        pad(now.getMonth() + 1),
        pad(now.getDate()),
        pad(now.getHours()),
        pad(now.getMinutes()),
        pad(now.getSeconds()),
    ].join('');
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let suffix = '';
    for (let index = 0; index < 7; index += 1) {
        suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return `${timestamp}-${suffix}`;
}

type AvContextResolution = {
    avData: unknown;
    blockID?: string;
};

type AvRowBinding = {
    rowID?: string;
    sourceBlockID?: string;
    valueIDs: string[];
};

type AvRowLookup = {
    rows: AvRowBinding[];
    rowIDs: Set<string>;
    sourceBlockToRowIDs: Map<string, string[]>;
    valueIdToRowIDs: Map<string, string[]>;
};

type AddRowsResolution = {
    rows: Array<{ blockID: string; rowID?: string; rowIDs?: string[]; status?: 'resolved' | 'missing' | 'ambiguous' }>;
    unresolvedBlockIDs: string[];
};

const ADD_ROWS_POLL_ATTEMPTS = 6;
const ADD_ROWS_POLL_DELAY_MS = 500;

function extractFirstRowBlockId(avData: unknown): string | undefined {
    if (!avData || typeof avData !== 'object') return undefined;
    const keyValues = (avData as { keyValues?: unknown }).keyValues;
    if (!Array.isArray(keyValues)) return undefined;

    for (const entry of keyValues) {
        if (!entry || typeof entry !== 'object') continue;
        const typedEntry = entry as {
            key?: { type?: string };
            values?: Array<{ block?: { id?: string } }>;
        };
        if (typedEntry.key?.type !== 'block' || !Array.isArray(typedEntry.values)) continue;
        const blockValue = typedEntry.values.find((value) => typeof value?.block?.id === 'string' && value.block.id.length > 0);
        if (blockValue?.block?.id) return blockValue.block.id;
    }
    return undefined;
}

function getStringField(value: unknown, fieldNames: string[]): string | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const record = value as Record<string, unknown>;
    for (const fieldName of fieldNames) {
        const fieldValue = record[fieldName];
        if (typeof fieldValue === 'string' && fieldValue.length > 0) {
            return fieldValue;
        }
    }
    return undefined;
}

function getNestedStringField(value: unknown, path: string[]): string | undefined {
    let current = value;
    for (const segment of path) {
        if (!current || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[segment];
    }
    return typeof current === 'string' && current.length > 0 ? current : undefined;
}

function extractRowIdFromValue(value: unknown): string | undefined {
    return getStringField(value, ['blockID', 'itemId', 'itemID', 'rowID'])
        ?? getNestedStringField(value, ['block', 'blockID']);
}

function extractSourceBlockIdFromBlockValue(value: unknown): string | undefined {
    return getNestedStringField(value, ['block', 'id'])
        ?? getStringField(value, ['srcID', 'srcId']);
}

function extractValueIdFromValue(value: unknown): string | undefined {
    return getStringField(value, ['id']);
}

function extractAvRowLookup(avData: unknown): AvRowLookup {
    const rowsById = new Map<string, AvRowBinding>();
    const rowsInOrder: AvRowBinding[] = [];
    if (!avData || typeof avData !== 'object') {
        return { rows: [], rowIDs: new Set<string>(), sourceBlockToRowIDs: new Map<string, string[]>(), valueIdToRowIDs: new Map<string, string[]>() };
    }

    const keyValues = (avData as { keyValues?: unknown }).keyValues;
    if (!Array.isArray(keyValues)) {
        return { rows: [], rowIDs: new Set<string>(), sourceBlockToRowIDs: new Map<string, string[]>(), valueIdToRowIDs: new Map<string, string[]>() };
    }

    for (const entry of keyValues) {
        if (!entry || typeof entry !== 'object') continue;
        const typedEntry = entry as { key?: { type?: string }; values?: unknown };
        const values = typedEntry.values;
        if (!Array.isArray(values)) continue;

        values.forEach((value) => {
            const rowID = extractRowIdFromValue(value);
            if (!rowID) return;

            let row = rowsById.get(rowID);
            if (!row) {
                row = { rowID, valueIDs: [] };
                rowsById.set(rowID, row);
                rowsInOrder.push(row);
            }

            const valueID = extractValueIdFromValue(value);
            const sourceBlockID = typedEntry.key?.type === 'block' ? extractSourceBlockIdFromBlockValue(value) : undefined;
            if (sourceBlockID) row.sourceBlockID = sourceBlockID;
            if (valueID && !row.valueIDs.includes(valueID)) row.valueIDs.push(valueID);
        });
    }

    const rows = rowsInOrder.filter((row) => row.rowID || row.sourceBlockID || row.valueIDs.length > 0);
    const rowIDs = new Set<string>();
    const sourceBlockToRowIDs = new Map<string, string[]>();
    const valueIdToRowIDs = new Map<string, string[]>();

    for (const row of rows) {
        if (row.rowID) rowIDs.add(row.rowID);
        if (row.sourceBlockID && row.rowID) {
            const matches = sourceBlockToRowIDs.get(row.sourceBlockID) ?? [];
            if (!matches.includes(row.rowID)) {
                matches.push(row.rowID);
                sourceBlockToRowIDs.set(row.sourceBlockID, matches);
            }
        }
        if (!row.rowID) continue;
        for (const valueID of row.valueIDs) {
            const matches = valueIdToRowIDs.get(valueID) ?? [];
            if (!matches.includes(row.rowID)) {
                matches.push(row.rowID);
                valueIdToRowIDs.set(valueID, matches);
            }
        }
    }

    return { rows, rowIDs, sourceBlockToRowIDs, valueIdToRowIDs };
}

function createAvRowIdErrorResult(
    action: 'set_cell' | 'batch_set_cells',
    payload: Record<string, unknown>,
): ToolResult {
    return {
        content: [{
            type: 'text',
            text: JSON.stringify({
                error: {
                    type: 'validation_error',
                    tool: AV_TOOL_NAME,
                    action,
                    ...payload,
                },
            }, null, 2),
        }],
        isError: true,
    };
}

function createAddRowsSyncTimeoutResult(
    avID: string,
    blockIDs: string[],
    resolution: AddRowsResolution,
): ToolResult {
    return {
        content: [{
            type: 'text',
            text: JSON.stringify({
                error: {
                    type: 'api_error',
                    tool: AV_TOOL_NAME,
                    action: 'add_rows',
                    reason: 'row_id_sync_timeout',
                    message: `Added rows to attribute view "${avID}", but MCP could not observe writable row item IDs before the sync timeout expired.`,
                    avID,
                    blockIDs,
                    rows: resolution.rows,
                    unresolvedBlockIDs: resolution.unresolvedBlockIDs,
                    hint: 'Retry av(action="add_rows") or wait briefly and re-read the database. Only call set_cell after add_rows returns rows[].rowID.',
                },
            }, null, 2),
        }],
        isError: true,
    };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function resolveAddedRows(rowLookup: AvRowLookup, blockIDs: string[]): AddRowsResolution {
    const rows = blockIDs.map((blockID) => {
        const matchedRowIDs = rowLookup.sourceBlockToRowIDs.get(blockID) ?? [];
        if (matchedRowIDs.length === 1) {
            return { blockID, rowID: matchedRowIDs[0] };
        }
        if (matchedRowIDs.length > 1) {
            return { blockID, rowIDs: matchedRowIDs, status: 'ambiguous' as const };
        }
        return { blockID, status: 'missing' as const };
    });
    const unresolvedBlockIDs = rows
        .filter((row) => !('rowID' in row))
        .map((row) => row.blockID);
    return { rows, unresolvedBlockIDs };
}

async function waitForAddedRows(
    client: SiYuanClient,
    avID: string,
    blockIDs: string[],
): Promise<AddRowsResolution> {
    let lastResolution: AddRowsResolution = {
        rows: blockIDs.map((blockID) => ({ blockID })),
        unresolvedBlockIDs: [...blockIDs],
    };

    for (let attempt = 0; attempt < ADD_ROWS_POLL_ATTEMPTS; attempt += 1) {
        const refreshed = await avApi.getAttributeView(client, avID);
        lastResolution = resolveAddedRows(extractAvRowLookup(refreshed.av), blockIDs);
        if (lastResolution.unresolvedBlockIDs.length === 0) {
            return lastResolution;
        }
        if (attempt < ADD_ROWS_POLL_ATTEMPTS - 1) {
            await sleep(ADD_ROWS_POLL_DELAY_MS);
        }
    }

    return lastResolution;
}

function validateRowIdForAv(
    avID: string,
    action: 'set_cell' | 'batch_set_cells',
    rowLookup: AvRowLookup,
    requestedRowID: string,
    itemIndex?: number,
): { ok: true; rowID: string } | { ok: false; result: ToolResult } {
    if (rowLookup.rowIDs.has(requestedRowID)) {
        return { ok: true, rowID: requestedRowID };
    }

    const matchedValueRowIDs = rowLookup.valueIdToRowIDs.get(requestedRowID);
    if (matchedValueRowIDs && matchedValueRowIDs.length === 1) {
        return {
            ok: false,
            result: createAvRowIdErrorResult(action, {
                reason: 'row_id_alias_detected',
                message: `rowID "${requestedRowID}" is a cell value ID in attribute view "${avID}", not the database row item ID.`,
                avID,
                rowID: requestedRowID,
                detectedValueID: requestedRowID,
                suggestedRowID: matchedValueRowIDs[0],
                ...(itemIndex === undefined ? {} : { itemIndex }),
                hint: 'Use the AV row item ID stored in each value.blockID, or the rowID returned by av(action="add_rows"). Do not reuse value.id from set_cell responses as rowID.',
            }),
        };
    }

    if (matchedValueRowIDs && matchedValueRowIDs.length > 1) {
        return {
            ok: false,
            result: createAvRowIdErrorResult(action, {
                reason: 'row_id_alias_ambiguous',
                message: `rowID "${requestedRowID}" matches multiple cell value records in attribute view "${avID}". Pass a concrete row item ID instead.`,
                avID,
                rowID: requestedRowID,
                detectedValueID: requestedRowID,
                candidateRowIDs: matchedValueRowIDs,
                ...(itemIndex === undefined ? {} : { itemIndex }),
                hint: 'Use the row item ID stored in value.blockID, not value.id.',
            }),
        };
    }

    const matchingRowIDs = rowLookup.sourceBlockToRowIDs.get(requestedRowID);
    if (matchingRowIDs && matchingRowIDs.length === 1) {
        return {
            ok: false,
            result: createAvRowIdErrorResult(action, {
                reason: 'row_id_required',
                message: `rowID "${requestedRowID}" is a source block ID in attribute view "${avID}". Use the row item ID instead.`,
                avID,
                rowID: requestedRowID,
                detectedSourceBlockID: requestedRowID,
                suggestedRowID: matchingRowIDs[0],
                ...(itemIndex === undefined ? {} : { itemIndex }),
                hint: 'Use the row item ID stored in value.blockID, or the rowID returned by av(action="add_rows"). The source block ID lives in block.id and is not writable as rowID.',
            }),
        };
    }

    if (matchingRowIDs && matchingRowIDs.length > 1) {
        return {
            ok: false,
            result: createAvRowIdErrorResult(action, {
                reason: 'row_id_ambiguous',
                message: `rowID "${requestedRowID}" matches multiple rows in attribute view "${avID}". Pass a concrete row item ID instead of the source block ID.`,
                avID,
                rowID: requestedRowID,
                detectedSourceBlockID: requestedRowID,
                candidateRowIDs: matchingRowIDs,
                ...(itemIndex === undefined ? {} : { itemIndex }),
                hint: 'Use the exact row item ID returned by av(action="add_rows"), or inspect the AV payload to choose the intended row binding.',
            }),
        };
    }

    return {
        ok: false,
        result: createAvRowIdErrorResult(action, {
            reason: 'row_id_not_canonical',
            message: `rowID "${requestedRowID}" is not a valid database row item ID in attribute view "${avID}". Pass the canonical row item ID stored in value.blockID.`,
            avID,
            rowID: requestedRowID,
            ...(itemIndex === undefined ? {} : { itemIndex }),
            hint: 'Use the rowID returned by av(action="add_rows"), or inspect the block column in av(action="get"): value.blockID is the writable row item ID, while value.id is only the cell value ID.',
        }),
    };
}

async function resolveAvContext(
    client: SiYuanClient,
    avData: unknown,
): Promise<AvContextResolution> {
    const directContext = await resolveResultItemContext(client, avData);
    if (directContext?.documentId) {
        return { avData, blockID: directContext.documentId };
    }

    const blockID = extractFirstRowBlockId(avData);
    return { avData, blockID };
}

async function ensurePermissionForAvId(
    client: SiYuanClient,
    permMgr: PermissionManager,
    avID: string,
    required: 'read' | 'write',
): Promise<{ denied: ToolResult | null; avData: unknown }> {
    const response = await avApi.getAttributeView(client, avID);
    const avData = response.av;
    const resolved = await resolveAvContext(client, avData);
    const candidateBlockIDs = [];
    if (resolved.blockID) {
        candidateBlockIDs.push(resolved.blockID);
    }

    try {
        const mirrors = await avApi.getMirrorDatabaseBlocks(client, avID);
        for (const entry of mirrors.refDefs ?? []) {
            const refID = typeof entry?.refID === 'string' && entry.refID.length > 0 ? entry.refID : undefined;
            if (refID && !candidateBlockIDs.includes(refID)) {
                candidateBlockIDs.push(refID);
            }
        }
    } catch (error) {
        if (!isMissingBlockError(error)) {
            throw error;
        }
    }

    for (const candidateBlockID of candidateBlockIDs) {
        try {
            const { denied } = await ensurePermissionForDocumentId(client, permMgr, candidateBlockID, required);
            return { denied, avData };
        } catch (error) {
            if (isMissingBlockError(error)) continue;
            throw error;
        }
    }

    if (candidateBlockIDs.length === 0) {
        throw new Error(`Unable to resolve notebook permission scope for attribute view "${avID}". The database may have no rows yet; AV writes require a resolvable owning block context.`);
    }
    throw new Error(`Unable to resolve notebook permission scope for attribute view "${avID}" because all known owning block references are stale or missing.`);
}

async function resolveAvOwningBlockId(
    client: SiYuanClient,
    avID: string,
    avData?: unknown,
): Promise<string | undefined> {
    const resolved = await resolveAvContext(client, avData ?? (await avApi.getAttributeView(client, avID)).av);
    const candidateBlockIDs: string[] = [];
    if (resolved.blockID) {
        candidateBlockIDs.push(resolved.blockID);
    }

    try {
        const mirrors = await avApi.getMirrorDatabaseBlocks(client, avID);
        for (const entry of mirrors.refDefs ?? []) {
            const refID = typeof entry?.refID === 'string' && entry.refID.length > 0 ? entry.refID : undefined;
            if (refID && !candidateBlockIDs.includes(refID)) {
                candidateBlockIDs.push(refID);
            }
        }
    } catch (error) {
        if (!isMissingBlockError(error)) {
            throw error;
        }
    }

    return candidateBlockIDs[0];
}

async function filterAvSearchResultsByPermission(
    client: SiYuanClient,
    permMgr: PermissionManager,
    results: unknown[],
): Promise<{
    results: unknown[];
    unresolvedResults: unknown[];
    filteredOutCount: number;
    rawResultCount: number;
    unresolvedCount: number;
    permissionFilteredOutCount: number;
    partial?: boolean;
    reason?: string;
}> {
    const cache = createResultResolutionCache();
    await permMgr.reload();

    const filtered: unknown[] = [];
    const unresolvedResults: unknown[] = [];
    let filteredOutCount = 0;
    let unresolvedCount = 0;
    let permissionFilteredOutCount = 0;

    for (const result of results) {
        const context = await resolveResultItemContext(client, result, cache);
        if (!context?.notebook) {
            filteredOutCount += 1;
            unresolvedCount += 1;
            unresolvedResults.push(result);
            continue;
        }
        if (!permMgr.canRead(context.notebook)) {
            filteredOutCount += 1;
            permissionFilteredOutCount += 1;
            continue;
        }
        filtered.push(result);
    }

    return {
        results: filtered,
        unresolvedResults,
        rawResultCount: results.length,
        filteredOutCount,
        unresolvedCount,
        permissionFilteredOutCount,
        ...(filteredOutCount > 0 ? { partial: true, reason: permissionFilteredOutCount > 0 ? 'permission_filtered' : 'context_unresolved' } : {}),
    };
}

function parseDateMillis(value: string | number, fieldName: string): number {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error(`${fieldName} must be a finite epoch millisecond value.`);
        return value;
    }

    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
        throw new Error(`${fieldName} must be a valid ISO date string or epoch milliseconds.`);
    }
    return parsed;
}

function buildDuplicateAvBlockDom(blockID: string, avID: string): string {
    return `<div class="av" data-node-id="${blockID}" data-av-id="${avID}" data-type="NodeAttributeView" data-av-type="table"></div>`;
}

function buildStrongCellValue(
    columnID: string,
    rowID: string,
    input: StrongCellValueInput,
): Record<string, unknown> {
    const base: Record<string, unknown> = {
        keyID: columnID,
        blockID: rowID,
    };

    switch (input.valueType) {
        case 'text':
            return { ...base, type: 'text', text: { content: input.text } };
        case 'number':
            return {
                ...base,
                type: 'number',
                number: {
                    content: input.number,
                    isNotEmpty: true,
                    format: input.numberFormat ?? '',
                    formattedContent: '',
                },
            };
        case 'date': {
            const content = parseDateMillis(input.date!, 'date');
            const content2 = input.endDate === undefined ? 0 : parseDateMillis(input.endDate, 'endDate');
            return {
                ...base,
                type: 'date',
                date: {
                    content,
                    isNotEmpty: true,
                    hasEndDate: input.endDate !== undefined,
                    isNotTime: input.includeTime === false,
                    content2,
                    isNotEmpty2: input.endDate !== undefined,
                    formattedContent: '',
                },
            };
        }
        case 'checkbox':
            return { ...base, type: 'checkbox', checkbox: { checked: Boolean(input.checked) } };
        case 'select':
            return { ...base, type: 'select', mSelect: [{ content: input.option, color: '' }] };
        case 'multi_select':
            return { ...base, type: 'mSelect', mSelect: (input.options ?? []).map((option) => ({ content: option, color: '' })) };
        case 'relation':
            return { ...base, type: 'relation', relation: { blockIDs: input.relationBlockIDs ?? [], contents: [] } };
        case 'url':
            return { ...base, type: 'url', url: { content: input.url } };
        case 'email':
            return { ...base, type: 'email', email: { content: input.email } };
        case 'phone':
            return { ...base, type: 'phone', phone: { content: input.phone } };
        case 'mAsset': {
            const assets = (input.assets ?? []).map((asset) => ({
                type: asset.type,
                name: asset.name ?? '',
                content: asset.content,
            }));
            const markdown = input.text
                ?? assets.map((asset) => asset.type === 'image'
                    ? `![](${asset.content})`
                    : `[${asset.name || asset.content}](${asset.content})`).join('\n');
            return {
                ...base,
                type: 'mAsset',
                text: { content: markdown },
                mAsset: assets,
            };
        }
        default:
            throw new Error(`Unsupported AV valueType: ${(input as { valueType: string }).valueType}`);
    }
}

async function handleGet({ client, permMgr, rawArgs }: AvHandlerContext): Promise<ToolResult> {
    const parsed = AvGetSchema.parse(rawArgs);
    const { denied, avData } = await ensurePermissionForAvId(client, permMgr, parsed.id, 'read');
    if (denied) return denied;
    const rowLookup = extractAvRowLookup(avData);
    return createJsonResult({
        id: parsed.id,
        av: avData,
        ...(rowLookup.rows.length > 0 ? {
            resolvedRows: rowLookup.rows.map((row) => ({
                rowID: row.rowID,
                ...(row.sourceBlockID ? { sourceBlockID: row.sourceBlockID } : {}),
                ...(row.valueIDs.length > 0 ? { valueIDs: row.valueIDs } : {}),
            })),
        } : {}),
    });
}

async function handleSearch({ client, permMgr, rawArgs }: AvHandlerContext): Promise<ToolResult> {
    const parsed = AvSearchSchema.parse(rawArgs);
    const response = await avApi.searchAttributeView(client, parsed.keyword, parsed.excludes);
    const filtered = await filterAvSearchResultsByPermission(client, permMgr, response.results ?? []);
    return createJsonResult({
        keyword: parsed.keyword,
        ...filtered,
        ...(filtered.filteredOutCount > 0 ? {
            emptyReason: filtered.results.length === 0
                ? (filtered.unresolvedCount > 0 && filtered.permissionFilteredOutCount === 0 ? 'no_verified_results_unresolved_candidates_available'
                    : filtered.permissionFilteredOutCount > 0 && filtered.unresolvedCount === 0 ? 'all_results_permission_filtered'
                        : 'all_results_filtered')
                : undefined,
            unresolvedHint: filtered.unresolvedResults.length > 0
                ? 'unresolvedResults contains kernel search candidates that matched, but MCP could not verify notebook context yet.'
                : undefined,
        } : {}),
    });
}

async function handleAddRows({ client, permMgr, rawArgs }: AvHandlerContext): Promise<ToolResult> {
    const parsed = AvAddRowsSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForAvId(client, permMgr, parsed.avID, 'write');
    if (denied) return denied;

    if (parsed.blockIDs.length === 0) {
        return createWriteSuccessResult({
            action: 'add_rows',
            avID: parsed.avID,
            blockIDs: [],
            rows: [],
            added: 0,
            skipped: true,
            message: 'No blockIDs were provided, so no rows were added.',
        });
    }

    await avApi.addAttributeViewBlocks(client, {
        avID: parsed.avID,
        blockID: parsed.blockID,
        viewID: parsed.viewID,
        groupID: parsed.groupID,
        previousID: parsed.previousID,
        ignoreDefaultFill: parsed.ignoreDefaultFill,
        srcs: parsed.blockIDs.map((id) => ({ id, isDetached: false })),
    });

    const resolution = await waitForAddedRows(client, parsed.avID, parsed.blockIDs);
    if (resolution.unresolvedBlockIDs.length > 0) {
        return createAddRowsSyncTimeoutResult(parsed.avID, parsed.blockIDs, resolution);
    }

    return applyUiRefresh(client, createWriteSuccessResult({
        action: 'add_rows',
        avID: parsed.avID,
        blockIDs: parsed.blockIDs,
        rows: resolution.rows,
        added: parsed.blockIDs.length,
    }), [{ type: 'reloadAttributeView', id: parsed.avID }]);
}

async function handleRemoveRows({ client, permMgr, rawArgs }: AvHandlerContext): Promise<ToolResult> {
    const parsed = AvRemoveRowsSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForAvId(client, permMgr, parsed.avID, 'write');
    if (denied) return denied;

    await avApi.removeAttributeViewBlocks(client, parsed.avID, parsed.srcIDs);
    return applyUiRefresh(client, createWriteSuccessResult({
        action: 'remove_rows',
        avID: parsed.avID,
        srcIDs: parsed.srcIDs,
        removed: parsed.srcIDs.length,
    }), [{ type: 'reloadAttributeView', id: parsed.avID }]);
}

async function handleAddColumn({ client, permMgr, rawArgs }: AvHandlerContext): Promise<ToolResult> {
    const parsed = AvAddColumnSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForAvId(client, permMgr, parsed.avID, 'write');
    if (denied) return denied;

    const keyID = parsed.keyID ?? generateSiYuanNodeId();
    await avApi.addAttributeViewKey(client, {
        ...parsed,
        keyID,
    });
    return applyUiRefresh(client, createWriteSuccessResult({
        action: 'add_column',
        avID: parsed.avID,
        keyID,
        keyName: parsed.keyName,
        keyType: parsed.keyType,
    }), [{ type: 'reloadAttributeView', id: parsed.avID }]);
}

async function handleRemoveColumn({ client, permMgr, rawArgs }: AvHandlerContext): Promise<ToolResult> {
    const parsed = AvRemoveColumnSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForAvId(client, permMgr, parsed.avID, 'write');
    if (denied) return denied;
    const keyID = parsed.keyID ?? parsed.columnID!;

    await avApi.removeAttributeViewKey(client, parsed.avID, keyID, parsed.removeRelationDest);
    return applyUiRefresh(client, createWriteSuccessResult({
        action: 'remove_column',
        avID: parsed.avID,
        keyID,
        removeRelationDest: parsed.removeRelationDest ?? false,
    }), [{ type: 'reloadAttributeView', id: parsed.avID }]);
}

async function handleSetCell({ client, permMgr, rawArgs }: AvHandlerContext): Promise<ToolResult> {
    const parsed = AvSetCellSchema.parse(rawArgs);
    const { denied, avData } = await ensurePermissionForAvId(client, permMgr, parsed.avID, 'write');
    if (denied) return denied;
    const validatedRowID = validateRowIdForAv(parsed.avID, 'set_cell', extractAvRowLookup(avData), parsed.rowID);
    if (!validatedRowID.ok) return validatedRowID.result;

    const value = buildStrongCellValue(parsed.columnID, validatedRowID.rowID, parsed);
    const response = await avApi.setAttributeViewBlockAttr(client, {
        avID: parsed.avID,
        keyID: parsed.columnID,
        itemID: validatedRowID.rowID,
        value,
    });

    return applyUiRefresh(client, createWriteSuccessResult({
        action: 'set_cell',
        avID: parsed.avID,
        rowID: parsed.rowID,
        columnID: parsed.columnID,
        valueType: parsed.valueType,
    }, response), [{ type: 'reloadAttributeView', id: parsed.avID }]);
}

async function handleBatchSetCells({ client, permMgr, rawArgs }: AvHandlerContext): Promise<ToolResult> {
    const parsed = AvBatchSetCellsSchema.parse(rawArgs);
    const { denied, avData } = await ensurePermissionForAvId(client, permMgr, parsed.avID, 'write');
    if (denied) return denied;
    const rowLookup = extractAvRowLookup(avData);

    const values = [];
    for (let index = 0; index < parsed.items.length; index += 1) {
        const item = parsed.items[index];
        const validatedRowID = validateRowIdForAv(parsed.avID, 'batch_set_cells', rowLookup, item.rowID, index);
        if (!validatedRowID.ok) return validatedRowID.result;
        values.push(buildStrongCellValue(item.columnID, validatedRowID.rowID, item));
    }
    await avApi.batchSetAttributeViewBlockAttrs(client, parsed.avID, values);

    return applyUiRefresh(client, createWriteSuccessResult({
        action: 'batch_set_cells',
        avID: parsed.avID,
        updated: parsed.items.length,
    }), [{ type: 'reloadAttributeView', id: parsed.avID }]);
}

async function handleDuplicateBlock({ client, permMgr, rawArgs }: AvHandlerContext): Promise<ToolResult> {
    const parsed = AvDuplicateBlockSchema.parse(rawArgs);
    const { denied, avData } = await ensurePermissionForAvId(client, permMgr, parsed.avID, 'write');
    if (denied) return denied;

    const response = await avApi.duplicateAttributeViewBlock(client, parsed.avID);
    if (!response.avID || !response.blockID) {
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    error: {
                        type: 'internal_error',
                        tool: AV_TOOL_NAME,
                        action: 'duplicate_block',
                        reason: 'duplicate_identifiers_missing',
                        message: `Duplicate AV returned incomplete identifiers for source "${parsed.avID}".`,
                        sourceAvID: parsed.avID,
                        duplicatedAvID: response.avID,
                        duplicatedBlockID: response.blockID,
                    },
                }, null, 2),
            }],
            isError: true,
        };
    }

    const insertedAfter = parsed.previousID ?? await resolveAvOwningBlockId(client, parsed.avID, avData);
    if (!insertedAfter) {
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    error: {
                        type: 'internal_error',
                        tool: AV_TOOL_NAME,
                        action: 'duplicate_block',
                        reason: 'duplicate_insert_target_unresolved',
                        message: `Duplicated AV identifiers were prepared for source "${parsed.avID}", but MCP could not resolve a database block insertion target.`,
                        sourceAvID: parsed.avID,
                        duplicatedAvID: response.avID,
                        duplicatedBlockID: response.blockID,
                        hint: 'SiYuan kernel duplicateAttributeViewBlock only prepares the duplicated AV definition. Provide previousID or ensure the source AV has a resolvable owning database block in the document tree.',
                    },
                }, null, 2),
            }],
            isError: true,
        };
    }

    const destination = await ensurePermissionForDocumentId(client, permMgr, insertedAfter, 'write');
    if (destination.denied) return destination.denied;

    const dom = buildDuplicateAvBlockDom(response.blockID, response.avID);
    try {
        await transactionApi.performTransactions(client, [{
            doOperations: [{
                action: 'insert',
                id: response.blockID,
                data: dom,
                previousID: insertedAfter,
            }],
            undoOperations: [{
                action: 'delete',
                id: response.blockID,
                data: null,
            }],
        }]);
    } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    error: {
                        type: 'internal_error',
                        tool: AV_TOOL_NAME,
                        action: 'duplicate_block',
                        reason: 'duplicate_insert_failed',
                        message: normalized.message,
                        sourceAvID: parsed.avID,
                        duplicatedAvID: response.avID,
                        duplicatedBlockID: response.blockID,
                        insertedAfter,
                        hint: 'The duplicate AV definition was prepared, but MCP failed while inserting the duplicated database block into the document tree.',
                    },
                }, null, 2),
            }],
            isError: true,
        };
    }

    const blockExists = await blockApi.checkBlockExist(client, response.blockID);
    let avReadable = false;
    let verificationMessage: string | undefined;
    try {
        const verification = await ensurePermissionForAvId(client, permMgr, response.avID, 'read');
        avReadable = !verification.denied;
    } catch (error) {
        verificationMessage = error instanceof Error ? error.message : String(error);
    }

    if (!blockExists || !avReadable) {
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    error: {
                        type: 'internal_error',
                        tool: AV_TOOL_NAME,
                        action: 'duplicate_block',
                        reason: 'duplicate_insert_verification_failed',
                        message: `Duplicated AV insertion finished, but MCP could not verify the materialized result for block "${response.blockID}".`,
                        sourceAvID: parsed.avID,
                        duplicatedAvID: response.avID,
                        duplicatedBlockID: response.blockID,
                        insertedAfter,
                        verification: {
                            duplicatedBlockExists: blockExists,
                            duplicatedAvReadable: avReadable,
                            ...(verificationMessage ? { duplicatedAvReadableMessage: verificationMessage } : {}),
                        },
                        hint: 'The duplicate AV definition was inserted, but the resulting AV/block could not be verified. Check the target document tree and duplicated AV state.',
                    },
                }, null, 2),
            }],
            isError: true,
        };
    }

    return applyUiRefresh(client, createWriteSuccessResult({
        action: 'duplicate_block',
        sourceAvID: parsed.avID,
        prepared: true,
        materialized: true,
        duplicatedAvReadable: true,
        insertedAfter,
        semantics: parsed.previousID ? 'duplicated_and_inserted_with_override' : 'duplicated_and_inserted',
    }, response), [
        { type: 'reloadAttributeView', id: response.avID },
        { type: 'reloadProtyle', id: destination.context.documentId },
    ]);
}

async function handleGetPrimaryKeyValues({ client, permMgr, rawArgs }: AvHandlerContext): Promise<ToolResult> {
    const parsed = AvGetPrimaryKeyValuesSchema.parse(rawArgs);
    const { denied } = await ensurePermissionForAvId(client, permMgr, parsed.avID, 'read');
    if (denied) return denied;

    const response = await avApi.getAttributeViewPrimaryKeyValues(client, {
        id: parsed.avID,
        keyword: parsed.keyword,
        page: parsed.page,
        pageSize: parsed.pageSize,
    });

    const blockIDs = response.blockIDs ?? [];
    if (blockIDs.length > 0) {
        const cache = createResultResolutionCache();
        await permMgr.reload();
        const filteredBlockIDs: string[] = [];
        const filteredRows: unknown[] = [];
        let filteredOutCount = 0;
        for (let index = 0; index < blockIDs.length; index += 1) {
            const blockID = blockIDs[index];
            const context = await resolveResultItemContext(client, { id: blockID }, cache)
                ?? await resolveDocumentContextById(client, blockID).catch(() => null);
            const notebook = context && 'notebook' in context ? context.notebook : undefined;
            if (!notebook || !permMgr.canRead(notebook)) {
                filteredOutCount += 1;
                continue;
            }
            filteredBlockIDs.push(blockID);
            filteredRows.push(response.rows[index]);
        }

        return createJsonResult({
            avID: parsed.avID,
            name: response.name,
            blockIDs: filteredBlockIDs,
            rows: filteredRows,
            ...(filteredOutCount > 0 ? { filteredOutCount, partial: true, reason: 'permission_filtered' } : {}),
        });
    }

    return createJsonResult({
        avID: parsed.avID,
        ...response,
    });
}

const AV_ACTION_HANDLERS: Record<AvAction, (context: AvHandlerContext) => Promise<ToolResult>> = {
    get: handleGet,
    search: handleSearch,
    add_rows: handleAddRows,
    remove_rows: handleRemoveRows,
    add_column: handleAddColumn,
    remove_column: handleRemoveColumn,
    set_cell: handleSetCell,
    batch_set_cells: handleBatchSetCells,
    duplicate_block: handleDuplicateBlock,
    get_primary_key_values: handleGetPrimaryKeyValues,
};

export async function callAvTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<AvAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    const rawArgs = args ?? {};
    const action = typeof rawArgs.action === 'string' ? rawArgs.action : undefined;

    const helpResult = tryHandleHelpAction(AV_TOOL_NAME, rawArgs, config, AV_VARIANTS);
    if (helpResult) return helpResult;

    try {
        const parsedAction = AvActionSchema.parse(rawArgs.action);
        if (!config.enabled || !config.actions[parsedAction]) {
            return createDisabledActionResult(AV_TOOL_NAME, parsedAction);
        }

        const handler = AV_ACTION_HANDLERS[parsedAction];
        return await handler({ client, permMgr, rawArgs });
    } catch (error) {
        return createErrorResult(error, { tool: AV_TOOL_NAME, action, rawArgs });
    }
}

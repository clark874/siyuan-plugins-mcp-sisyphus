import { z } from 'zod';
import { requireKernel389 } from '../../api/system';
import type { SiYuanClient } from '../../api/client';
import { callOfficialMcpTool } from '../../core/official-mcp-bridge';
import type { PermissionManager } from '../../core/permissions';
import { AvAutomationRelativeDateSchema, AvAutomationValueSchema } from '../../core/types';
import { hashWriteState } from '../../core/write-safety-hash';
import { safetyError, stripSafetyFields } from '../../core/write-safety-ledger';
import type { ToolActionHandler } from '../internal/define-tool';
import { createJsonResult, type ToolResult } from '../internal/shared';
import { createSemanticError } from '../internal/validation';
import { ensurePermissionForAvId, listVerifiedAvMirrorBlockIds } from './handlers';
import { ensurePermissionForDocumentId } from '../internal/context';

const nodeId = z.string().regex(/^\d{14}-[a-z0-9]{7}$/);
const layout = z.enum(['table', 'list', 'gallery', 'kanban', 'calendar']);
const filterFields = {
    column: z.union([nodeId, z.literal('')]).optional(),
    operator: z.string().max(64).optional(),
    value: AvAutomationValueSchema.nullable().optional(),
    valueSource: z.enum(['stored', 'rendered']).optional(),
    quantifier: z.enum(['any', 'all', 'none']).optional(),
    dateEndpoint: z.enum(['start', 'end']).optional(),
    relativeDate: AvAutomationRelativeDateSchema.optional(),
    relativeDate2: AvAutomationRelativeDateSchema.optional(),
    combination: z.enum(['and', 'or']).optional(),
};
const filter = z.object({ ...filterFields, filters: z.array(z.object(filterFields).strict()).max(100).optional() }).strict();
const order = z.object({
    column: nodeId,
    order: z.enum(['ASC', 'DESC']),
    valueSource: z.enum(['stored', 'rendered']).optional(),
    dateEndpoint: z.enum(['start', 'end']).optional(),
}).strict();
const group = z.object({
    field: z.union([nodeId, z.literal('')]).optional(),
    method: z.number().int().optional(),
    range: z.object({ numStart: z.number(), numEnd: z.number(), numStep: z.number() }).strict().optional(),
    order: z.number().int().optional(),
    hideEmpty: z.boolean().optional(),
    valueSource: z.enum(['stored', 'rendered']).optional(),
}).strict();

const nativeOperations = {
    create: 'view_add', duplicate: 'view_duplicate', update: 'view_update', move: 'view_move',
    move_field: 'view_field_move', set_visibility: 'view_visibility_set', set_filters: 'view_filters_set',
    set_sorts: 'view_sorts_set', set_group: 'view_group_set', set_layout: 'view_layout_set',
} as const;
const operation = z.enum(Object.keys(nativeOperations) as [keyof typeof nativeOperations, ...Array<keyof typeof nativeOperations>]);
type ViewOperation = z.infer<typeof operation>;

const scope = {
    avID: nodeId.describe('数据库 ID。'),
    blockID: nodeId.describe('该数据库的真实载体块 ID。'),
    viewID: nodeId.optional().describe('视图 ID。读取时可省略，使用首个视图列出可选视图。'),
};

export const AvViewGetSchema = z.object({ action: z.literal('view_get'), ...scope }).strict();
const viewConfigure = z.object({
    action: z.literal('view_configure'), ...scope,
    operation: operation.describe('配置动作；每次执行一项。'),
    revision: z.string().trim().min(1).max(256).optional().describe('筛选、排序、分组和布局操作须提供 view_get 返回的 revision。'),
    name: z.string().trim().min(1).max(256).optional(),
    icon: z.string().max(256).optional(),
    desc: z.string().max(4096).optional(),
    layout: layout.optional(),
    filters: z.array(filter).max(100).optional().describe('完整筛选列表，空数组清空。'),
    sorts: z.array(order).max(100).optional().describe('完整排序列表，空数组清空。'),
    group: group.optional().describe('原生分组对象，{} 清空。'),
    viewIDs: z.array(nodeId).min(1).max(100).refine(ids => new Set(ids).size === ids.length, '可见视图 ID 不得重复。').optional().describe('载体要显示的完整视图列表，至少保留一个视图。'),
    keyID: nodeId.optional(),
    previousID: z.union([nodeId, z.literal('')]).optional().describe('移到此 ID 之后；空字符串移到第一位。'),
}).strict();
type Configure = z.infer<typeof viewConfigure>;
const fieldsByOperation: Record<ViewOperation, { required: Array<keyof Configure>; optional?: Array<keyof Configure> }> = {
    create: { required: ['name', 'layout'] },
    duplicate: { required: ['viewID'], optional: ['name'] },
    update: { required: ['viewID'], optional: ['name', 'icon', 'desc'] },
    move: { required: ['viewID', 'previousID'] },
    move_field: { required: ['viewID', 'keyID', 'previousID'] },
    set_visibility: { required: ['viewIDs'] },
    set_filters: { required: ['viewID', 'revision', 'filters'] },
    set_sorts: { required: ['viewID', 'revision', 'sorts'] },
    set_group: { required: ['viewID', 'revision', 'group'] },
    set_layout: { required: ['viewID', 'revision', 'layout'] },
};
const common = new Set(['action', 'avID', 'blockID', 'operation']);
export const AvViewConfigureSchema = viewConfigure.superRefine((value, ctx) => {
    const { required, optional = [] } = fieldsByOperation[value.operation];
    for (const key of required) {
        if (value[key] === undefined) ctx.addIssue({ code: 'custom', path: [key], message: '当前操作需要此字段。' });
    }
    for (const key of Object.keys(value) as Array<keyof Configure>) {
        if (!common.has(key) && !required.includes(key) && !optional.includes(key)) ctx.addIssue({ code: 'custom', path: [key], message: '当前操作不使用此字段。' });
    }
    if (value.operation === 'update' && !optional.some(key => value[key] !== undefined)) {
        ctx.addIssue({ code: 'custom', path: ['name'], message: '至少填写名称、图标或说明中的一项。' });
    }
});

const nativeViewResult = z.object({
    id: nodeId,
    blockID: nodeId,
    viewID: nodeId,
    revision: z.string().min(1),
    views: z.array(z.object({ id: nodeId }).passthrough()),
    visibleViewIDs: z.array(nodeId),
}).passthrough();
type NativeView = z.infer<typeof nativeViewResult>;
type Scope = { avID: string; blockID: string; viewID?: string };

function readResponse<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new Error('思源返回了无法核验的视图响应。');
    return parsed.data;
}

function readNativeData(result: ToolResult): unknown {
    if (result.isError) throw new Error(result.content[0]?.text || '思源未返回视图状态。');
    const data: unknown = JSON.parse(result.content[0]?.text ?? '');
    return readResponse(z.object({ data: z.unknown() }), data).data;
}

async function readView(client: SiYuanClient, input: Scope, viewID: string): Promise<NativeView> {
    const result = await callOfficialMcpTool(client, 'database', {
        action: 'view_get', id: input.avID, blockID: input.blockID, viewID,
    });
    const view = readResponse(nativeViewResult, readNativeData(result));
    if (view.id !== input.avID || view.blockID !== input.blockID || view.viewID !== viewID) throw new Error('原生视图回读身份与目标不一致。');
    return view;
}

async function readScopedState(client: SiYuanClient, permMgr: PermissionManager, input: Scope, change?: ViewOperation) {
    await requireKernel389(client);
    const action = change ? 'view_configure' : 'view_get';
    const { denied, avData } = await ensurePermissionForAvId(client, permMgr, input.avID, change ? 'write' : 'read', {
        blockID: input.blockID, action, databaseBlocksOnly: true,
    });
    if (denied) {
        const reported = JSON.parse(denied.content[0]?.text ?? '{}').error;
        throw createSemanticError(reported?.type === 'permission_denied' ? 'permission_denied' : 'invalid_arguments',
            '数据库载体不存在、不匹配或当前权限不足。');
    }
    const mirrorIDs = change && change !== 'set_visibility'
        ? await listVerifiedAvMirrorBlockIds(client, input.avID) : [];
    for (const mirror of mirrorIDs) {
        if (mirror === input.blockID) continue;
        if ((await ensurePermissionForDocumentId(client, permMgr, mirror, 'write')).denied) {
            throw createSemanticError('permission_denied', '共享视图存在没有写入权限的数据库镜像。');
        }
    }
    const firstId = nodeId.safeParse((avData as { views?: Array<{ id?: string }> }).views?.[0]?.id);
    const viewID = input.viewID ?? (firstId.success ? firstId.data : undefined);
    if (!viewID) throw createSemanticError('not_found', '数据库没有可供读取的视图。');
    return { mirrorIDs, view: await readView(client, input, viewID) };
}

export async function readAvViewWriteState(client: SiYuanClient, permMgr: PermissionManager, rawArgs: Record<string, unknown>) {
    const input = AvViewConfigureSchema.parse(stripSafetyFields(rawArgs));
    const state = await readScopedState(client, permMgr, input, input.operation);
    if (rawArgs.validateOnly === true && input.revision && input.revision !== state.view.revision) {
        throw safetyError('state_changed', '视图版本已变化，请重新读取视图再预检。');
    }
    const targetIds = [...new Set([input.avID, input.blockID, ...state.mirrorIDs, ...(input.viewID ? [input.viewID] : [])])].sort();
    return { hash: hashWriteState(state), targetIds, summary: { targetCount: targetIds.length, viewRevision: state.view.revision } };
}

const getView: ToolActionHandler = async ({ client, permMgr, rawArgs }) => {
    const input = AvViewGetSchema.parse(rawArgs);
    const { view } = await readScopedState(client, permMgr, input);
    return createJsonResult(view);
};

const configureView: ToolActionHandler = async ({ client, permMgr, rawArgs }) => {
    const input = AvViewConfigureSchema.parse(rawArgs);
    const { view: before } = await readScopedState(client, permMgr, input, input.operation);
    if (input.revision && input.revision !== before.revision) {
        throw createSemanticError('invalid_arguments', '视图版本已变化，请重新读取视图再预检。', 'stale_view_revision');
    }
    const { action: _action, operation, avID, ...fields } = input;
    const result = await callOfficialMcpTool(client, 'database', { ...fields, id: avID, action: nativeOperations[operation] });
    if (result.isError) return result;
    const reported = readNativeData(result);
    const created = operation === 'create' || operation === 'duplicate';
    const resultId = created ? readResponse(z.object({ viewID: nodeId }), reported).viewID : before.viewID;
    const actual = await readView(client, input, resultId);
    const matches = operation === 'set_visibility'
        ? hashWriteState(actual.visibleViewIDs) === hashWriteState(readResponse(z.object({ visibleViewIDs: z.array(nodeId) }), reported).visibleViewIDs)
        : hashWriteState(actual) === hashWriteState(readResponse(nativeViewResult, reported));
    if (!matches || (created && before.views.some(view => view.id === resultId))) throw new Error('视图写入后的独立回读与内核结果不符。请先检查目标视图。');
    return createJsonResult({ ...actual, success: true, operation, ...(created ? { created: true } : {}), verification: { status: 'verified', method: 'native-view-readback' } });
};

export const AV_VIEW_HANDLERS = { view_get: getView, view_configure: configureView };

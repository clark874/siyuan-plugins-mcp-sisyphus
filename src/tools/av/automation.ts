import { z } from 'zod';
import * as avApi from '../../api/av';
import { performTransactions } from '../../api/transaction';
import { validateAutomationConfig } from '../../core/automation-safety';
import { AvAutomationConfigSchema, AvCollectBlocksSchema, AvGetAutomationsSchema, AvPreviewCollectionSchema, AvPreviewTemplateSchema, AvSetAutomationsSchema } from '../../core/types';
import { ensurePermissionForDocumentId, ensurePermissionForNotebook } from '../internal/context';
import type { ToolActionHandler, ToolHandlerContext } from '../internal/define-tool';
import { createJsonResult, createWriteSuccessResult, type ToolResult } from '../internal/shared';
import { ensurePermissionForAvId, extractAvRowLookup } from './handlers';

type AutomationConfig = z.infer<typeof AvAutomationConfigSchema>;
type AvData = { automations?: AutomationConfig | null; keyValues?: Array<{ key?: { id?: string; type?: string; relation?: { avID?: string } } }> };

function readConfig(avData: unknown): AutomationConfig {
    return AvAutomationConfigSchema.parse((avData as AvData)?.automations ?? { spec: 4, rules: [] });
}

// 读取也检查规则引用范围，避免在预览和配置中泄露无读取权限的来源。
async function checkReadableReferences(ctx: ToolHandlerContext, avData: unknown, config: AutomationConfig): Promise<ToolResult | null> {
    for (const rule of config.rules) {
        for (const notebookID of rule.blockSource?.notebookIDs ?? []) {
            const denied = await ensurePermissionForNotebook(ctx.permMgr, notebookID, 'read');
            if (denied) return denied;
        }
        for (const documentID of rule.blockSource?.documentIDs ?? []) {
            const { denied } = await ensurePermissionForDocumentId(ctx.client, ctx.permMgr, documentID, 'read');
            if (denied) return denied;
        }
        if (rule.blockSource?.referenceID) {
            const { denied } = await ensurePermissionForDocumentId(ctx.client, ctx.permMgr, rule.blockSource.referenceID, 'read');
            if (denied) return denied;
        }
        for (const action of rule.actions) {
            const relationAvID = action.target === 'related'
                ? (avData as AvData)?.keyValues?.find(entry => entry.key?.id === action.relationKeyID)?.key?.relation?.avID
                : undefined;
            if (action.target === 'related' && !relationAvID) throw new Error('无法验证规则引用的关联数据库。');
            const targetAvID = action.target === 'filtered' ? action.avID : relationAvID;
            if (targetAvID) {
                const { denied } = await ensurePermissionForAvId(ctx.client, ctx.permMgr, targetAvID, 'read');
                if (denied) return denied;
            }
        }
    }
    return null;
}

async function getAutomations(ctx: ToolHandlerContext): Promise<ToolResult> {
    const parsed = AvGetAutomationsSchema.parse(ctx.rawArgs);
    const { denied, avData } = await ensurePermissionForAvId(ctx.client, ctx.permMgr, parsed.avID, 'read', { blockID: parsed.blockID });
    if (denied) return denied;
    const config = readConfig(avData);
    const referencesDenied = await checkReadableReferences(ctx, avData, config);
    if (referencesDenied) return referencesDenied;
    return createJsonResult({ avID: parsed.avID, config });
}

function containsRequestedConfig(saved: unknown, requested: unknown): boolean {
    // 原生 omitempty 会省略空的可选字符串和条件列表，这不改变规则语义。
    if (saved === undefined && (requested === '' || (Array.isArray(requested) && requested.length === 0))) return true;
    if (requested === null || typeof requested !== 'object') return saved === requested;
    if (Array.isArray(requested)) return Array.isArray(saved) && saved.length === requested.length && requested.every((item, i) => containsRequestedConfig(saved[i], item));
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return false;
    return Object.entries(requested).every(([key, value]) => containsRequestedConfig((saved as Record<string, unknown>)[key], value));
}

async function setAutomations(ctx: ToolHandlerContext): Promise<ToolResult> {
    const parsed = AvSetAutomationsSchema.parse(ctx.rawArgs);
    const { denied, avData } = await ensurePermissionForAvId(ctx.client, ctx.permMgr, parsed.avID, 'write', { blockID: parsed.blockID });
    if (denied) return denied;
    const validationDenied = await validateAutomationConfig(ctx.client, ctx.permMgr, parsed.avID, parsed.config);
    if (validationDenied) return validationDenied;
    await performTransactions(ctx.client, [{
        doOperations: [{ action: 'setAttrViewAutomations', avID: parsed.avID, blockID: parsed.blockID, data: parsed.config }],
        undoOperations: [{ action: 'setAttrViewAutomations', avID: parsed.avID, blockID: parsed.blockID, data: (avData as AvData)?.automations ?? { spec: 4, rules: [] } }],
    }]);
    const readback = await avApi.getAttributeView(ctx.client, parsed.avID);
    const savedConfig = readConfig(readback.av);
    // 原生内核可能补充缺省成员，因此回传实际保存配置，由调用方保留完整状态。
    if (!containsRequestedConfig(savedConfig, parsed.config)) {
        throw new Error('自动化规则保存后回读不一致，尚未完成验收。');
    }
    return createWriteSuccessResult({ action: parsed.action, avID: parsed.avID, config: savedConfig, verification: { status: 'verified', method: 'automation-config-readback' } });
}

async function previewCollection(ctx: ToolHandlerContext): Promise<ToolResult> {
    const parsed = AvPreviewCollectionSchema.parse(ctx.rawArgs);
    const { denied, avData } = await ensurePermissionForAvId(ctx.client, ctx.permMgr, parsed.avID, 'read', { blockID: parsed.blockID });
    if (denied) return denied;
    const config = readConfig(avData);
    const rule = config.rules.find(value => value.id === parsed.ruleID);
    if (!rule || !rule.enabled || rule.trigger !== 'block') throw new Error('需要已保存且启用的块收集规则。');
    const referencesDenied = await checkReadableReferences(ctx, avData, { ...config, rules: [rule] });
    if (referencesDenied) return referencesDenied;
    const result = await avApi.previewAttributeViewCollection(ctx.client, { avID: parsed.avID, ruleID: parsed.ruleID, page: parsed.page });
    for (const block of result.blocks) {
        const source = await ensurePermissionForDocumentId(ctx.client, ctx.permMgr, block.id, 'read');
        if (source.denied) return source.denied;
    }
    return createJsonResult({ avID: parsed.avID, ruleID: parsed.ruleID, page: parsed.page ?? 1, ...result });
}

async function collectBlocks(ctx: ToolHandlerContext): Promise<ToolResult> {
    const parsed = AvCollectBlocksSchema.parse(ctx.rawArgs);
    const { denied, avData } = await ensurePermissionForAvId(ctx.client, ctx.permMgr, parsed.avID, 'write', { blockID: parsed.blockID });
    if (denied) return denied;
    const config = readConfig(avData);
    const rule = config.rules.find(value => value.id === parsed.ruleID);
    if (!rule || !rule.enabled || rule.trigger !== 'block') throw new Error('需要已保存且启用的块收集规则。');
    const validationDenied = await validateAutomationConfig(ctx.client, ctx.permMgr, parsed.avID, { ...config, rules: [rule] });
    if (validationDenied) return validationDenied;
    const blockIDs = [...new Set(parsed.blockIDs)];
    for (const blockID of blockIDs) {
        const source = await ensurePermissionForDocumentId(ctx.client, ctx.permMgr, blockID, 'write');
        if (source.denied) return source.denied;
    }
    await performTransactions(ctx.client, [{ doOperations: [{ action: 'collectAttrViewBlocks', avID: parsed.avID, blockID: parsed.blockID, data: { ruleID: parsed.ruleID, blockIDs } }], undoOperations: [] }]);
    const readback = await avApi.getAttributeView(ctx.client, parsed.avID);
    const lookup = extractAvRowLookup(readback.av);
    const collectedBlockIDs = blockIDs.filter(id => lookup.sourceBlockToRowIDs.has(id));
    const skippedBlockIDs = blockIDs.filter(id => !lookup.sourceBlockToRowIDs.has(id));
    return createWriteSuccessResult({ action: parsed.action, avID: parsed.avID, ruleID: parsed.ruleID, collectedBlockIDs, skippedBlockIDs, verification: { status: skippedBlockIDs.length ? 'partial' : 'verified', method: 'bound-source-block-readback' }, ...(skippedBlockIDs.length ? { warning: '部分来源块未回读到绑定条目；可能已不匹配规则，请重新预览。' } : {}) });
}

async function previewTemplate(ctx: ToolHandlerContext): Promise<ToolResult> {
    const { action, blockID, ...parsed } = AvPreviewTemplateSchema.parse(ctx.rawArgs);
    const source = await ensurePermissionForAvId(ctx.client, ctx.permMgr, parsed.avID, 'read', { blockID });
    if (source.denied) return source.denied;
    const targetAvID = parsed.targetAvID ?? parsed.avID;
    const target = targetAvID === parsed.avID ? source : await ensurePermissionForAvId(ctx.client, ctx.permMgr, targetAvID, 'read');
    if (target.denied) return target.denied;
    const keyType = (target.avData as AvData)?.keyValues?.find(entry => entry.key?.id === parsed.keyID)?.key?.type;
    if (!keyType || !['block', 'text', 'number', 'date', 'checkbox', 'select', 'mSelect', 'url', 'email', 'phone'].includes(keyType)) {
        throw new Error('模板预览仅支持可写的文本知识字段，不支持关联、资源或计算字段。');
    }
    // 模板只能引用该源库的字段；所有绑定来源必须具有读取权限。
    for (const row of extractAvRowLookup(source.avData).rows) {
        if (!row.sourceBlockID) continue;
        const rowPermission = await ensurePermissionForDocumentId(ctx.client, ctx.permMgr, row.sourceBlockID, 'read');
        if (rowPermission.denied) return rowPermission.denied;
    }
    const value = await avApi.previewAttributeViewTemplate(ctx.client, parsed);
    if (value.type === 'mAsset' || value.type === 'relation' || 'mAsset' in value || 'relation' in value) throw new Error('模板预览返回受限的资源或关联载荷。');
    return createJsonResult({ avID: parsed.avID, targetAvID, itemID: parsed.itemID, keyID: parsed.keyID, value });
}

export const AUTOMATION_ACTION_HANDLERS = {
    get_automations: getAutomations,
    set_automations: setAutomations,
    preview_collection: previewCollection,
    collect_blocks: collectBlocks,
    preview_template: previewTemplate,
} satisfies Record<string, ToolActionHandler>;

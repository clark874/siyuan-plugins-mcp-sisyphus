import type { SiYuanClient } from '../../api/client';
import * as blocks from '../../api/block';
import { findReadableNameClaimCollisions, normalizeAnchorToken } from '../../core/attribute-governance';
import { validateKnowledgeRelationMutation } from '../../core/knowledge-relations';
import type { PermissionManager } from '../../core/permissions';
import { FsLinkKnowledgeSchema, FsWriteAtomsSchema } from '../../core/types';
import { hashWriteState, writeHashDigest } from '../../core/write-safety-hash';
import { safetyError } from '../../core/write-safety-ledger';
import type { ToolActionHandler } from '../internal/define-tool';
import { resolveFsScopePath } from '../internal/helpers/fs-path';
import { normalizeBlockRefQuoteStyle, assertSafeBlockReferenceMarkdown } from '../internal/kramdown-safe';
import { assertMarkdownInput } from '../internal/markdown-input';
import { createJsonResult } from '../internal/shared';
import { applyUiRefresh } from '../internal/ui-refresh';

const BATCH_PLAN_ATTR = 'custom-sisyphus-batch-plan';
const ATOM_ATTRIBUTES = new Set([
    'name', 'alias', 'memo',
    'custom-atom-type', 'custom-verification-status', 'custom-verification-evidence',
    'custom-knowledge-project-id', 'custom-knowledge-workstream', 'custom-reuse-scope',
    'custom-source-manifest', 'custom-source-path', 'custom-source-url', 'custom-source-hash',
    'custom-source-revision', 'custom-source-range', 'custom-source-checked', 'custom-source-id',
]);

interface WriteItem {
    id: string;
    index: number;
    itemKey?: string;
    markdown: string;
    attrs: Record<string, string>;
}

interface ItemFailure {
    index: number;
    id: string;
    itemKey?: string;
    error: string;
    diagnostics?: unknown[];
}

function stableId(documentId: string, key: unknown): string {
    const digest = writeHashDigest(hashWriteState([documentId, key]));
    const suffix = (BigInt('0x' + digest) % (36n ** 7n)).toString(36).padStart(7, '0');
    return `${documentId.slice(0, 14)}-${suffix}`;
}

function ialValue(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function encodeItem(item: WriteItem): string {
    const attributes = Object.entries({ id: item.id, ...item.attrs });
    return item.markdown + '\n{: ' + attributes.map(([name, value]) => `${name}="${ialValue(value)}"`).join(' ') + ' }';
}

function singleParagraph(markdown: string, action: string) {
    assertMarkdownInput(markdown, action);
    if (/[\x00-\x1f\x7f]|\{:[\s\w]|!\[|<\/?[A-Za-z][^>]*>|<!--|\{\{/u.test(markdown)) {
        throw new Error('每条知识记录须是单段 Markdown，属性只能通过 attrs 设置。');
    }
    const normalized = normalizeBlockRefQuoteStyle(markdown);
    assertSafeBlockReferenceMarkdown(normalized, action);
    return normalized;
}

function atomId(documentId: string, batchId: string, index: number, itemKey?: string): string {
    return stableId(documentId, ['atom', batchId, itemKey === undefined ? index : ['itemKey', itemKey]]);
}

function makeAtom(documentId: string, batchId: string, index: number, input: { itemKey?: string; markdown: string; attrs: Record<string, string> }): WriteItem {
    const { attrs } = input;
    if (Object.keys(attrs).some(name => !ATOM_ATTRIBUTES.has(name))) throw new Error('attrs 包含非知识原子属性。');
    if (Object.values(attrs).some(value => /[\x00-\x1f\x7f]|&(?:[#\w]+);|\\$/u.test(value))) {
        throw new Error('属性值须为单行文本，不能使用 HTML 实体或结尾反斜线。');
    }
    if (!attrs.name?.trim() || !attrs['custom-atom-type']?.trim()) throw new Error('须提供 name 和 custom-atom-type。');
    const status = attrs['custom-verification-status'] ?? 'draft';
    if (!['draft', 'source-checked'].includes(status)) throw new Error('新原子只接受 draft 或 source-checked。');
    const markdown = singleParagraph(input.markdown, 'fs.write_atoms');
    const id = atomId(documentId, batchId, index, input.itemKey);
    const descriptor = { ...attrs, 'custom-verification-status': status };
    return { id, index, ...(input.itemKey !== undefined ? { itemKey: input.itemKey } : {}), markdown, attrs: {
        ...descriptor,
        [BATCH_PLAN_ATTR]: hashWriteState([markdown, descriptor]),
    } };
}

async function markup(client: SiYuanClient, markdown: string): Promise<string> {
    const result = await client.requestRead<{html: string}>('/api/lute/md2html', { markdown, mode: '' });
    if (typeof result?.html !== 'string') throw new Error('思源未返回可验证的 Markdown 渲染。');
    return result.html.trim();
}

async function validateRenderedItems(client: SiYuanClient, items: WriteItem[]): Promise<boolean> {
    if (!items.length) return true;
    const html = await markup(client, items.map(encodeItem).join('\n\n'));
    const ids = [...html.matchAll(/<p\s[^>]*?\bid="(\d{14}-[a-z0-9]{7})"[^>]*>[\s\S]*?<\/p>/gu)].map(match => match[1]);
    const leftover = html.replace(/<p\s[^>]*?\bid="\d{14}-[a-z0-9]{7}"[^>]*>[\s\S]*?<\/p>/gu, '').trim();
    return !leftover && ids.length === items.length && ids.every((id, index) => id === items[index].id);
}

async function sameMarkdown(client: SiYuanClient, existing: string, proposed: string): Promise<boolean> {
    if (existing === proposed) return true;
    // HTML 预览保留了引用显示文本，但不保证保留目标 ID，必须独立比较引用目标。
    const refIds = (text: string) => [...text.matchAll(/\(\((\d{14}-[a-z0-9]{7})(?=\s|\)\))/gu)].map(match => match[1]);
    return JSON.stringify(refIds(existing)) === JSON.stringify(refIds(proposed))
        && await markup(client, existing) === await markup(client, proposed);
}

async function prepare(
    client: SiYuanClient,
    permMgr: PermissionManager,
    rawArgs: Record<string, unknown>,
) {
    const relation = rawArgs.action === 'link_knowledge' ? FsLinkKnowledgeSchema.parse(rawArgs) : undefined;
    const batch = relation ? undefined : FsWriteAtomsSchema.parse(rawArgs);
    const scope = await resolveFsScopePath(client, permMgr, relation?.path ?? batch!.path, 'write');
    if (scope.type !== 'document') throw safetyError('invalid_arguments', '请选择可写的既有文档路径。');
    if (!permMgr.canWrite(scope.notebook)) throw safetyError('permission_denied', '目标文档所在笔记本不可写。');
    const mode = batch?.mode ?? 'atomic';
    const items: WriteItem[] = [];
    const failed: ItemFailure[] = [];
    if (relation) {
        const { fromId, toId, kind, evidence } = relation;
        const id = stableId(scope.id, ['relation', fromId, kind, toId]);
        const markdown = singleParagraph(`知识关系：${kind}。((${fromId} '来源原子')) → ((${toId} '目标原子'))。${evidence}`, 'fs.link_knowledge');
        items.push({ id, index: 0, markdown, attrs: {
            'custom-relation-kind': kind,
            'custom-relation-from-id': fromId,
            'custom-relation-to-id': toId,
            'custom-relation-status': 'active',
            [BATCH_PLAN_ATTR]: hashWriteState(markdown),
        } });
    } else {
        const atoms = batch!.atoms;
        const itemKeys = atoms.flatMap(atom => atom.itemKey === undefined ? [] : [atom.itemKey]);
        if (itemKeys.length && (itemKeys.length !== atoms.length || new Set(itemKeys).size !== atoms.length)) {
            throw safetyError('invalid_arguments', '同一原子批次须给每条设置不同的 itemKey，或者全部省略并保留原有次序。');
        }
        const names = new Map<string, number>();
        for (const [index, atom] of atoms.entries()) {
            try {
                const item = makeAtom(scope.id, batch!.batchId, index, atom);
                const name = normalizeAnchorToken(item.attrs.name);
                if (names.has(name)) throw new Error(`name 与第 ${names.get(name)! + 1} 项重复。`);
                names.set(name, index);
                items.push(item);
            } catch (error) {
                const diagnostics = error && typeof error === 'object' && 'diagnostics' in error ? error.diagnostics : undefined;
                failed.push({
                    index, id: atomId(scope.id, batch!.batchId, index, atom.itemKey),
                    ...(atom.itemKey !== undefined ? { itemKey: atom.itemKey } : {}),
                    error: error instanceof Error ? error.message : String(error),
                    ...(Array.isArray(diagnostics) && { diagnostics }),
                });
            }
        }
    }
    const children = await blocks.getChildBlocks(client, scope.id) as Array<{ id: string; type: string; markdown?: string }>;
    if (!Array.isArray(children)) throw new Error('无法读回目标文档的实时子块。');
    const indexed = new Map(children.map(child => [child.id, child]));
    const attrs = await blocks.batchGetBlockAttrs(client, items.map(item => item.id));
    const reuse: WriteItem[] = [];
    const pending: WriteItem[] = [];
    let identityConflict = failed.some(item => indexed.has(item.id));
    for (const item of items) {
        const child = indexed.get(item.id);
        if (!child) {
            if (attrs?.[item.id]) {
                failed.push({ index: item.index, id: item.id, itemKey: item.itemKey, error: '稳定块 ID 已被占用，请核对原批次文档。' });
                identityConflict = true;
                continue;
            }
            pending.push(item);
            continue;
        }
        const saved = attrs?.[item.id];
        const existing = child.markdown ? normalizeBlockRefQuoteStyle(child.markdown.trim()) : '';
        const contentsMatch = existing && await sameMarkdown(client, existing, item.markdown);
        if (child.type !== 'p' || !contentsMatch || !saved || Object.entries(item.attrs).some(([key, value]) => saved[key] !== value)) {
            failed.push({ index: item.index, id: item.id, itemKey: item.itemKey, error: '稳定块已与本批计划不符，请核对既有内容、属性及批次顺序。' });
            identityConflict = true;
            continue;
        }
        reuse.push(item);
    }
    if (relation && items.length && !failed.length) {
        const item = items[0];
        await validateKnowledgeRelationMutation(client, permMgr, item.id, item.attrs, {}, new Map(), pending.length ? scope.notebook : undefined);
    }
    if (!relation && pending.length) {
        const collisions = await findReadableNameClaimCollisions(client, permMgr, pending.map(item => ({ id: item.id, name: item.attrs.name })));
        for (let index = pending.length - 1; index >= 0; index--) {
            const item = pending[index];
            if (!collisions.has(item.id)) continue;
            failed.push({ index: item.index, id: item.id, itemKey: item.itemKey, error: `知识原子 name 与既有可读块冲突：${item.attrs.name}。` });
            pending.splice(index, 1);
        }
    }
    if (pending.length && !(await validateRenderedItems(client, pending))) {
        for (let index = pending.length - 1; index >= 0; index--) {
            const item = pending[index];
            if (await validateRenderedItems(client, [item])) continue;
            failed.push({ index: item.index, id: item.id, itemKey: item.itemKey, error: '思源解析结果须恰为一个段落且保留块属性。' });
            pending.splice(index, 1);
        }
        if (pending.length && !(await validateRenderedItems(client, pending))) {
            throw safetyError('invalid_arguments', '这一组原子相邻时被思源合并或重排，请调整 Markdown 后预检。');
        }
    }
    failed.sort((a, b) => a.index - b.index);
    const ids = (entries: WriteItem[]) => entries.map(item => item.id);
    const ready = !identityConflict && pending.length > 0 && (mode === 'bestEffort' || !failed.length);
    return { scope, mode, batchId: batch?.batchId, pending, reuse, failed, ready,
        summary: {
            ...(batch ? { batchId: batch.batchId, identityBasis: batch.atoms[0].itemKey === undefined ? 'position' : 'itemKey' } : {}),
            mode,
            documentId: scope.id,
            plannedIds: ids(pending),
            existingIds: ids(reuse),
            failed,
            ready,
            rolledBack: false,
        },
    };
}

/** 预检与执行共享计划，稳定块 ID 同时作为中断后的核对清单。 */
export async function readKnowledgeFsWriteState(client: SiYuanClient, permMgr: PermissionManager, args: Record<string, unknown>) {
    const plan = await prepare(client, permMgr, args);
    return {
        hash: hashWriteState(plan.summary),
        targetIds: [plan.scope.id, ...plan.summary.plannedIds, ...plan.summary.existingIds],
        summary: plan.summary,
    };
}

export const handleKnowledgeFsWrite: ToolActionHandler = async ({ client, permMgr, rawArgs }) => {
    const plan = await prepare(client, permMgr, rawArgs);
    if (!plan.ready) {
        if (plan.failed.length) {
            return { ...createJsonResult({ ...plan.summary, success: false, ids: plan.summary.existingIds,
                error: { type: 'invalid_arguments', message: '批次预检失败，未提交新原子。' } }), isError: true };
        }
        return createJsonResult({ ...plan.summary, success: true, ids: plan.summary.existingIds, changed: false });
    }
    // 整批正文和属性由内核同一次追加操作解析，避免先写孤立正文再逐条设置属性。
    await blocks.appendBlock(client, 'markdown', plan.pending.map(encodeItem).join('\n\n'), plan.scope.id);
    let observed = plan;
    let lastError: unknown;
    const isRelation = rawArgs.action === 'link_knowledge';
    // 关系索引可能晚于文档树落盘数秒，不能拿即时索引空表当作写入失败。
    const delays = isRelation ? [0, 100, 200, 400, 800, 1600, 2500] : [0, 100, 200, 400, 800];
    for (const delay of delays) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        try {
            observed = await prepare(client, permMgr, rawArgs);
            if (!observed.pending.length && observed.reuse.length === plan.reuse.length + plan.pending.length) {
                return applyUiRefresh(client, createJsonResult({ ...observed.summary, success: true, changed: true,
                    ids: observed.summary.existingIds, partial: observed.failed.length > 0,
                    verification: isRelation ? 'endpoint-backlink-readback' : 'body-and-attribute-readback',
                }), [{ type: 'reloadProtyle', id: plan.scope.id }]);
            }
        } catch (error) {
            lastError = error;
        }
    }
    return { ...createJsonResult({ success: false, ...observed.summary, ids: observed.summary.existingIds,
        error: {
            type: 'readback_mismatch', message: '提交结果尚未完整回读。重新预检同一批次核对稳定块 ID，待结果确定后再补写。',
            ...(lastError instanceof Error && { cause: lastError.message }),
        },
    }), isError: true };
};

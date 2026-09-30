import { randomBytes } from 'node:crypto';
import type { SiYuanClient } from '../../api/client';
import * as blockApi from '../../api/block';
import { performTransactions, type TransactionOperation } from '../../api/transaction';
import { hashWriteState } from '../../core/write-safety-hash';
import type { PermissionManager } from '../../core/permissions';
import { ensurePermissionForDocumentId } from '../internal/context';

export const MINDMAP_ROOT_ATTR = 'custom-project-mindmap-root-id';
export const MINDMAP_AUTO_ATTR = 'custom-project-mindmap-auto-sync';
const STATE_ATTR = 'custom-project-mindmap-state';
const BLOCK_ID = /^\d{14}-[a-z0-9]{7}$/;

export interface MindmapNode {
    key: string;
    parent: string | null;
    label: string;
    sourceId?: string;
    id?: string;
    paragraphId?: string;
    listId?: string;
}

interface MindmapState {
    version: 1;
    projectId: string;
    pageId: string;
    rootId: string;
    nodes: MindmapNode[];
}

export interface MindmapPlan {
    projectId: string;
    pageId: string;
    title: string;
    desired: MindmapNode[];
    pageAttrs: Record<string, string>;
    rootAttrs: Record<string, string>;
    previous?: MindmapState;
    actual: Record<string, { children: string[]; dom?: string }>;
}

function text(value: unknown): string {
    return typeof value === 'string' ? value.replace(/[\u200B\uFEFF]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100) : '';
}

/** 只投影快照中的事实和来源，不生成新的项目结论。 */
export function projectMindmapNodes(snapshot: any): MindmapNode[] {
    const output: MindmapNode[] = [];
    const group = (key: string, label: string) => output.push({ key, parent: null, label });
    const source = (parent: string, key: string, row: any, fallback: string) => {
        if (!row?.id) return;
        output.push({ key, parent, sourceId: row.id, label: text(row.content ?? row.title) || fallback });
    };
    group('profile', '项目概览');
    source('profile', 'project-profile', snapshot.projections.projectProfile, '项目概览原文');
    group('stages', '阶段与当前状态');
    source('stages', 'stage-ledger', snapshot.projections.stageLedger, '阶段台账');
    source('stages', 'project-state', snapshot.projections.projectState, '当前项目状态');
    for (const row of snapshot.projections.workstreams) source('stages', `workstream:${row.id}`, row, row.workstream || '工作线');
    group('knowledge', '知识成果（快照窗口）');
    for (const row of snapshot.knowledgeProducts.slice(0, 30)) source('knowledge', `knowledge:${row.id}`, row, row.name || '知识成果');
    group('artifacts', '权威产物索引');
    source('artifacts', 'artifact-index', snapshot.projections.artifactIndex, '权威产物索引原文');
    group('events', '最近实质更新（最多十项）');
    for (const row of snapshot.events.slice(0, 10)) source('events', `event:${row.id}`, row, '项目事件');
    group('diagnostics', '诊断与下一步');
    snapshot.diagnostics.slice(0, 10).forEach((row: any, index: number) => output.push({
        key: `diagnostic:${row.code}:${row.blockId || index}`, parent: 'diagnostics',
        label: text(row.message), ...(row.blockId ? { sourceId: row.blockId } : {}),
    }));
    if (snapshot.diagnostics.length === 0) output.push({ key: 'diagnostics:clear', parent: 'diagnostics', label: '当前快照未报告异常；下一步见项目状态' });
    if (output.length > 160) throw new Error('导图超过本次同步的节点上限，未执行写入。');
    return output;
}

function decode(value: string): string {
    return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity: string) => {
        const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
        if (entity[0] !== '#') return named[entity.toLowerCase()] || '';
        const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return code <= 0x10ffff ? String.fromCodePoint(code) : '';
    });
}

function signature(dom: string) {
    const body = dom.match(/<div\b[^>]*\bcontenteditable="true"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    if (body === undefined || /<(?!\/?span\b)[^>]+>/i.test(body)) throw new Error('导图管理正文包含非生成内容，停止同步。');
    const refs = [...body.matchAll(/<span\b([^>]*)>/g)].flatMap((match) => {
        if (!/data-type="block-ref"/.test(match[1])) throw new Error('导图管理正文已被人工修改，停止同步。');
        const id = match[1].match(/data-id="([^"]+)"/)?.[1];
        return id ? [id] : [];
    });
    return { label: decode(body.replace(/<[^>]*>/g, '')).replace(/[\u200B\uFEFF]/g, '').replace(/\s+/g, ' ').trim(), refs };
}

function validateState(value: unknown, projectId: string, pageId: string, rootId: string): MindmapState {
    const state = value as MindmapState;
    if (state?.version !== 1 || state.projectId !== projectId || state.pageId !== pageId || state.rootId !== rootId
        || !Array.isArray(state.nodes) || state.nodes.length > 160) throw new Error('导图管理记录与项目不匹配，停止同步。');
    const keys = new Set<string>();
    const ids = new Set<string>([rootId]);
    for (const node of state.nodes) {
        if (typeof node.key !== 'string' || keys.has(node.key) || typeof node.label !== 'string'
            || (node.parent !== null && typeof node.parent !== 'string') || (node.sourceId !== undefined && !BLOCK_ID.test(node.sourceId))) {
            throw new Error('导图管理节点无效，停止同步。');
        }
        keys.add(node.key);
        for (const id of [node.id, node.paragraphId, ...(node.parent === null ? [node.listId] : [])]) {
            if (!id || !BLOCK_ID.test(id) || ids.has(id)) throw new Error('导图管理块标识无效或重复，停止同步。');
            ids.add(id);
        }
    }
    if (state.nodes.some((node) => node.parent !== null && !state.nodes.some((parent) => parent.key === node.parent && parent.parent === null))) {
        throw new Error('导图管理层级无效，停止同步。');
    }
    return state;
}

export async function readMindmapPlan(client: SiYuanClient, permMgr: PermissionManager, snapshot: any): Promise<MindmapPlan> {
    if (snapshot.denied || !snapshot.project || snapshot.project.bindingStatus !== 'available' || !snapshot.progressPage || snapshot.chronology?.complete !== true
        || snapshot.diagnostics.some((row: any) => row.severity === 'error' || ['project_state_lagging', 'workstream_state_lagging', 'project-progress-page_duplicate'].includes(row.code))) {
        throw new Error('项目快照不完整、进度页不唯一或状态投影待更新，未同步导图。');
    }
    const pageId = snapshot.progressPage.id;
    const permission = await ensurePermissionForDocumentId(client, permMgr, pageId, 'write');
    if (permission.denied) throw new Error('没有项目进度页的写权限。');
    const pageAttrs = await blockApi.getBlockAttrs(client, pageId);
    const rootId = pageAttrs[MINDMAP_ROOT_ATTR];
    const plan: MindmapPlan = {
        projectId: snapshot.project.projectId, pageId, title: text(snapshot.project.name) || snapshot.project.projectId,
        desired: projectMindmapNodes(snapshot), pageAttrs, rootAttrs: {}, actual: {},
    };
    if (!rootId) return plan;
    if (!BLOCK_ID.test(rootId)) throw new Error('导图根块登记无效，停止同步。');
    // 仅遍历进度页内的直接子块，拒绝把登记指针用作跨文档写入入口。
    const roots = await blockApi.getChildBlocks(client, pageId);
    if (!roots.some((row) => row.id === rootId && ['mindmap', 'NodeMindmap'].includes(row.type))) {
        throw new Error('已登记导图根块缺失、被移动或类型改变，停止同步；不会另建副本。');
    }
    plan.rootAttrs = await blockApi.getBlockAttrs(client, rootId);
    let saved: unknown;
    try { saved = JSON.parse(plan.rootAttrs[STATE_ATTR]); } catch { throw new Error('导图管理记录无法读取，停止同步。'); }
    plan.previous = validateState(saved, plan.projectId, pageId, rootId);
    const expected: Record<string, string[]> = { [rootId]: plan.previous.nodes.filter((node) => node.parent === null).map((node) => node.id!) };
    for (const node of plan.previous.nodes) {
        expected[node.id!] = [node.paragraphId!, ...(node.listId ? [node.listId] : [])];
        if (node.listId) expected[node.listId] = plan.previous.nodes.filter((child) => child.parent === node.key).map((child) => child.id!);
    }
    for (const [id, children] of Object.entries(expected)) {
        const actual = (await blockApi.getChildBlocks(client, id)).map((row) => row.id);
        if (JSON.stringify(actual) !== JSON.stringify(children)) throw new Error('导图结构已被人工修改，停止同步。');
        plan.actual[id] = { children: actual, dom: (await blockApi.getBlockDOM(client, id)).dom };
    }
    for (const node of plan.previous.nodes) {
        const dom = (await blockApi.getBlockDOM(client, node.paragraphId!)).dom;
        const actual = signature(dom);
        if (actual.label !== node.label || JSON.stringify(actual.refs) !== JSON.stringify(node.sourceId ? [node.sourceId] : [])) {
            throw new Error('导图管理正文已被人工修改，停止同步。');
        }
        plan.actual[node.paragraphId!] = { children: [], dom };
    }
    return plan;
}

function newId(): string {
    const now = new Date();
    const date = [now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()]
        .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0')).join('');
    return `${date}-${randomBytes(5).toString('hex').slice(0, 7)}`;
}

function escape(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function paragraph(node: MindmapNode, oldDom?: string): string {
    const body = node.sourceId
        ? `<span data-type="block-ref" data-subtype="s" data-id="${escape(node.sourceId)}">${escape(node.label)}</span>`
        : escape(node.label);
    if (oldDom) return oldDom.replace(/(<div\b[^>]*\bcontenteditable="true"[^>]*>)[\s\S]*?(<\/div>)/, (_match, opening, closing) => `${opening}${body}${closing}`);
    return `<div data-type="NodeParagraph" data-node-id="${node.paragraphId}" class="p"><div contenteditable="true" spellcheck="false">${body}</div></div>`;
}

function nodeDOM(node: MindmapNode, nodes: MindmapNode[]): string {
    const children = node.listId ? `<div data-type="NodeMindmap" data-node-id="${node.listId}" data-subtype="u" class="mindmap">${nodes.filter((child) => child.parent === node.key).map((child) => nodeDOM(child, nodes)).join('')}</div>` : '';
    return `<div data-type="NodeMindmapItem" data-node-id="${node.id}" data-subtype="u" class="mindmap-item"><div class="protyle-action"><span>•</span></div>${paragraph(node)}${children}</div>`;
}

export async function executeMindmapPlan(client: SiYuanClient, plan: MindmapPlan, autoSync: boolean) {
    const old = plan.previous;
    const oldByKey = new Map(old?.nodes.map((node) => [node.key, node]) || []);
    const nodes = plan.desired.map((node) => ({
        ...node, id: oldByKey.get(node.key)?.id || newId(), paragraphId: oldByKey.get(node.key)?.paragraphId || newId(),
        ...(node.parent === null ? { listId: oldByKey.get(node.key)?.listId || newId() } : {}),
    }));
    const rootId = old?.rootId || newId();
    const state: MindmapState = { version: 1, projectId: plan.projectId, pageId: plan.pageId, rootId, nodes };
    if (old && hashWriteState(old.nodes) === hashWriteState(nodes) && plan.pageAttrs[MINDMAP_AUTO_ATTR] === String(autoSync)) {
        return { status: 'unchanged', rootId, projectId: plan.projectId, autoSync, nodeCount: nodes.length };
    }
    const operations: TransactionOperation[] = [];
    if (!old) {
        const attrs = `${STATE_ATTR}="${escape(JSON.stringify(state))}" custom-sy-list-mindmap-data="${escape(JSON.stringify({ version: 1, rootTitle: plan.title, nodes: {}, relations: [] }))}"`;
        operations.push({ action: 'appendInsert', parentID: plan.pageId, data: `<div data-type="NodeMindmap" data-node-id="${rootId}" data-subtype="u" class="mindmap" ${attrs}>${nodes.filter((node) => node.parent === null).map((node) => nodeDOM(node, nodes)).join('')}</div>` });
    } else {
        const rebuiltGroups = new Set<string>();
        // 原生解析器会给孤立导图项补容器；结构变化时更新现有容器，保留存续项的 DOM 和 ID。
        for (const group of nodes.filter((node) => node.parent === null)) {
            const desired = nodes.filter((node) => node.parent === group.key);
            const previous = old.nodes.filter((node) => node.parent === group.key);
            if (JSON.stringify(desired.map((node) => node.id)) === JSON.stringify(previous.map((node) => node.id))) continue;
            rebuiltGroups.add(group.key);
            const opening = plan.actual[group.listId!].dom!.match(/^<div\b[^>]*>/)?.[0];
            if (!opening) throw new Error('导图容器正文无法读取，停止同步。');
            const children = desired.map((node) => {
                const prior = oldByKey.get(node.key);
                if (!prior) return nodeDOM(node, nodes);
                const dom = plan.actual[node.id!].dom!;
                return dom.replace(plan.actual[node.paragraphId!].dom!, () => paragraph(node, plan.actual[node.paragraphId!].dom));
            }).join('');
            operations.push({ action: 'update', id: group.listId, data: `${opening}${children}</div>` });
        }
        for (const node of nodes) {
            const previous = oldByKey.get(node.key);
            if (previous && !rebuiltGroups.has(node.parent!) && (previous.label !== node.label || previous.sourceId !== node.sourceId)) {
                operations.push({ action: 'update', id: node.paragraphId, data: paragraph(node, plan.actual[node.paragraphId!].dom) });
            }
        }
        operations.push({ action: 'setAttrs', id: rootId, data: JSON.stringify({ [STATE_ATTR]: JSON.stringify(state) }) });
    }
    operations.push({ action: 'setAttrs', id: plan.pageId, data: JSON.stringify({ [MINDMAP_ROOT_ATTR]: rootId, [MINDMAP_AUTO_ATTR]: String(autoSync) }) });
    await performTransactions(client, [{ doOperations: operations, undoOperations: [] }]);
    const attrs = await blockApi.getBlockAttrs(client, rootId);
    const pageAttrs = await blockApi.getBlockAttrs(client, plan.pageId);
    if (attrs[STATE_ATTR] !== JSON.stringify(state) || pageAttrs[MINDMAP_ROOT_ATTR] !== rootId || pageAttrs[MINDMAP_AUTO_ATTR] !== String(autoSync)) throw new Error('导图事务已提交，但管理记录回读不一致；不得盲目新建。');
    return { status: old ? 'updated' : 'created', rootId, projectId: plan.projectId, autoSync, nodeCount: nodes.length };
}

import { randomBytes } from 'node:crypto';
import type { SiYuanClient } from '../../api/client';
import * as blockApi from '../../api/block';
import { performTransactions, type TransactionOperation } from '../../api/transaction';
import { hashWriteState } from '../../core/write-safety-hash';
import type { PermissionManager } from '../../core/permissions';
import type { ProjectMindmapDisplay } from '../../core/types';
import { ensurePermissionForDocumentId } from '../internal/context';
import PromiseLimitPool from '../../shared/promise-pool';

export const MINDMAP_ROOT_ATTR = 'custom-project-mindmap-root-id';
export const MINDMAP_AUTO_ATTR = 'custom-project-mindmap-auto-sync';
const STATE_ATTR = 'custom-project-mindmap-state';
const DISPLAY_ATTR = 'custom-sy-list-mindmap-data';
const BLOCK_ID = /^\d{14}-[a-z0-9]{7}$/;

type NativeRelation = { id: string; from: string; to: string; label: string; [key: string]: unknown };
type NativeSummary = { id: string; parentId: string; nodeIds: string[]; label: string; [key: string]: unknown };
interface NativeMetadata {
    version: 1 | 2;
    nodes: Record<string, Record<string, unknown>>;
    relations: NativeRelation[];
    summaries?: NativeSummary[];
    [key: string]: unknown;
}

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
    display?: ProjectMindmapDisplay;
    actual: Record<string, { children: string[]; dom?: string }>;
}

function crossing(a: string[], b: string[]): boolean {
    const members = new Set(a);
    const common = b.filter((id) => members.has(id)).length;
    return common > 0 && common < a.length && common < b.length;
}

/** 与原生第 1/2 版校验一致，保留人工设置及较新版本的扩展字段。 */
function readNativeMetadata(value?: string): NativeMetadata {
    if (value === undefined) return { version: 1, nodes: {}, relations: [] };
    const invalid = () => new Error('原生导图显示配置无效，停止同步；不会覆盖原配置。');
    const record = (item: any) => item && typeof item === 'object' && !Array.isArray(item);
    const fields = (item: any, strings: string[], numbers: string[], booleans: string[]) => record(item)
        && strings.every((key) => !(key in item) || typeof item[key] === 'string')
        && numbers.every((key) => !(key in item) || (typeof item[key] === 'number' && Number.isFinite(item[key]) && item[key] >= 0))
        && booleans.every((key) => !(key in item) || typeof item[key] === 'boolean');
    let data: any;
    try { data = JSON.parse(value); } catch { throw invalid(); }
    if (!record(data) || ![1, 2].includes(data.version) || !record(data.nodes) || !Array.isArray(data.relations)
        || !fields(data, ['rootTitle'], [], ['viewLocked'])
        || ('connectorStyle' in data && !['spline', 'orthogonal', 'bezier', 'rounded'].includes(data.connectorStyle))) throw invalid();
    for (const [id, style] of Object.entries(data.nodes)) {
        if (!id || !fields(style, ['textColor', 'backgroundColor', 'borderColor', 'lineColor'], ['fontSize', 'borderWidth', 'borderRadius', 'lineWidth'], ['bold', 'italic', 'lineDash'])) throw invalid();
    }
    const relationIds = new Set<string>();
    for (const relation of data.relations) {
        if (!fields(relation, ['id', 'from', 'to', 'label', 'color'], ['width'], ['dash'])
            || !relation.id || !relation.from || !relation.to || typeof relation.label !== 'string' || relationIds.has(relation.id)
            || ('arrowDirection' in relation && !['forward', 'reverse', 'both', 'none'].includes(relation.arrowDirection))) throw invalid();
        for (const key of ['fromAnchor', 'toAnchor']) {
            if (!(key in relation)) continue;
            const anchor = relation[key];
            if (!record(anchor) || !['left', 'right', 'top', 'bottom'].includes(anchor.side)
                || typeof anchor.ratio !== 'number' || !Number.isFinite(anchor.ratio) || anchor.ratio < 0 || anchor.ratio > 1) throw invalid();
        }
        if ('route' in relation && (!record(relation.route) || relation.route.version !== 1 || !Array.isArray(relation.route.points)
            || !relation.route.points.length || relation.route.points.length > 64 || relation.route.points.some((point: any) => !record(point)
                || ['x', 'y', 't'].some((key) => typeof point[key] !== 'number' || !Number.isFinite(point[key]) || Math.abs(point[key]) > 1000000)
                || point.t < 0 || point.t > 1))) throw invalid();
        relationIds.add(relation.id);
    }
    if ('summaries' in data) {
        if (!Array.isArray(data.summaries)) throw invalid();
        const ids = new Set<string>();
        const members = new Set<string>();
        for (const summary of data.summaries) {
            if (!fields(summary, ['id', 'parentId', 'label', 'color'], [], []) || !summary.id || !summary.parentId
                || typeof summary.label !== 'string' || ids.has(summary.id) || !Array.isArray(summary.nodeIds) || !summary.nodeIds.length
                || new Set(summary.nodeIds).size !== summary.nodeIds.length || summary.nodeIds.some((id: any) => typeof id !== 'string' || !id || id === summary.parentId || (data.version === 1 && members.has(id)))) throw invalid();
            ids.add(summary.id);
            summary.nodeIds.forEach((id: string) => members.add(id));
        }
        if (data.version === 2 && data.summaries.some((a: NativeSummary, index: number) => data.summaries.slice(index + 1).some((b: NativeSummary) => a.parentId === b.parentId && crossing(a.nodeIds, b.nodeIds)))) throw invalid();
    }
    return data;
}

function displayMetadata(plan: MindmapPlan, nodes: MindmapNode[], rootId: string): NativeMetadata {
    const metadata = readNativeMetadata(plan.rootAttrs[DISPLAY_ATTR]);
    if (!plan.previous) metadata.rootTitle = plan.title;
    const display = plan.display || {};
    const ids = new Map(nodes.map((node) => [node.key, node.id!]));
    const resolve = (key: string): string => {
        const id = key === '$root' ? rootId : ids.get(key);
        if (!id) throw new Error(`导图显示配置引用未知节点键：${key}；未执行写入。`);
        return id;
    };
    for (const key of ['rootTitle', 'connectorStyle', 'viewLocked'] as const) {
        if (display[key] !== undefined) metadata[key] = display[key];
    }
    metadata.nodes = { ...metadata.nodes };
    for (const [key, style] of Object.entries(display.nodes || {})) {
        const id = resolve(key);
        metadata.nodes[id] = { ...metadata.nodes[id], ...style };
    }
    if (display.relations !== undefined) {
        const used = new Set<string>();
        metadata.relations = display.relations.map(({ fromKey, toKey, id, ...fields }) => {
            const from = resolve(fromKey);
            const to = resolve(toKey);
            const prior = metadata.relations.find((row) => id ? row.id === id : row.from === from && row.to === to);
            const relationId = id || prior?.id || `project-relation-${hashWriteState([fromKey, toKey]).slice(-24)}`;
            if (from === to || used.has(relationId)) throw new Error('导图关系端点相同或标识重复，未执行写入。');
            used.add(relationId);
            return { label: '', ...prior, ...fields, id: relationId, from, to };
        });
    }
    if (display.summaries !== undefined) {
        const used = new Set<string>();
        metadata.version = 2;
        metadata.summaries = display.summaries.map(({ parentKey, nodeKeys, id, ...fields }) => {
            const parentId = resolve(parentKey);
            const nodeIds = nodeKeys.map(resolve);
            const siblings = nodes.filter((node) => node.parent === (parentKey === '$root' ? null : parentKey)).map((node) => node.id!);
            const start = siblings.indexOf(nodeIds[0]);
            if (start < 0 || new Set(nodeIds).size !== nodeIds.length || JSON.stringify(siblings.slice(start, start + nodeIds.length)) !== JSON.stringify(nodeIds)) {
                throw new Error('导图概要必须是同一父节点下按顺序连续的节点范围，未执行写入。');
            }
            const prior = metadata.summaries?.find((row) => id ? row.id === id : row.parentId === parentId && JSON.stringify(row.nodeIds) === JSON.stringify(nodeIds));
            const summaryId = id || prior?.id || `project-summary-${hashWriteState([parentKey, nodeKeys]).slice(-24)}`;
            if (used.has(summaryId)) throw new Error('导图概要标识重复，未执行写入。');
            used.add(summaryId);
            return { label: '', ...prior, ...fields, id: summaryId, parentId, nodeIds };
        });
        if (metadata.summaries.some((a, index) => metadata.summaries!.slice(index + 1).some((b) => a.parentId === b.parentId
            && (crossing(a.nodeIds, b.nodeIds) || JSON.stringify(a.nodeIds) === JSON.stringify(b.nodeIds))))) throw new Error('导图概要范围交叉或重复，未执行写入。');
    }
    const validIds = new Set([rootId, ...ids.values()]);
    metadata.nodes = Object.fromEntries(Object.entries(metadata.nodes).filter(([id]) => validIds.has(id)));
    metadata.relations = metadata.relations.filter((row) => validIds.has(row.from) && validIds.has(row.to));
    if (metadata.summaries) {
        // 与原生概要规范化保持一致：删除成员后收缩到连续存续范围，插入成员只纳入原范围内部。
        const siblings = (items: MindmapNode[]) => {
            const parentIds = new Map(items.map((node) => [node.key, node.id!]));
            const groups = new Map<string, string[]>();
            for (const node of items) {
                const parentId = node.parent === null ? rootId : parentIds.get(node.parent)!;
                groups.set(parentId, [...(groups.get(parentId) || []), node.id!]);
            }
            return groups;
        };
        const current = siblings(nodes);
        const previous = siblings(plan.previous?.nodes || nodes);
        const claimed = new Set<string>();
        const originals = new Map(metadata.summaries.map((row) => [row.id, row]));
        metadata.summaries = metadata.summaries.flatMap((summary) => {
            const members = new Set(summary.nodeIds);
            const old = new Set(previous.get(summary.parentId) || []);
            const groups: string[][] = [[]];
            for (const id of current.get(summary.parentId) || []) {
                if ((metadata.version === 2 || !claimed.has(id)) && (members.has(id) || !old.has(id))) groups[groups.length - 1].push(id);
                else if (groups[groups.length - 1].length) groups.push([]);
            }
            const candidates = groups.map((group) => {
                const start = group.findIndex((id) => members.has(id));
                const end = group.length - 1 - [...group].reverse().findIndex((id) => members.has(id));
                return start < 0 ? [] : group.slice(start, end + 1);
            });
            const score = (group: string[]) => group.filter((id) => members.has(id)).length;
            const nodeIds = candidates.reduce((best, group) => score(group) > score(best) ? group : best, []);
            if (!nodeIds.length) return [];
            nodeIds.forEach((id) => claimed.add(id));
            return [{ ...summary, nodeIds }];
        });
        if (metadata.version === 2) {
            const ordered = [...metadata.summaries].sort((a, b) => originals.get(b.id)!.nodeIds.length - originals.get(a.id)!.nodeIds.length || a.id.localeCompare(b.id));
            ordered.forEach((outer, index) => ordered.slice(index + 1).forEach((inner) => {
                const originalOuter = new Set(originals.get(outer.id)!.nodeIds);
                if (outer.parentId === inner.parentId && originals.get(inner.id)!.nodeIds.every((id) => originalOuter.has(id)) && crossing(outer.nodeIds, inner.nodeIds)) {
                    const members = new Set(outer.nodeIds);
                    inner.nodeIds = inner.nodeIds.filter((id) => members.has(id));
                }
            }));
        }
    }
    return metadata;
}

function text(value: unknown): string {
    return typeof value === 'string' ? value.replace(/[\u200B\uFEFF]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100).trim() : '';
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
    // 事件目标还可能包含普通关系记录；先筛选已登记知识原子，再应用展示窗口。
    for (const row of snapshot.knowledgeProducts.filter((row: any) => row.name || row.atomType).slice(0, 30)) source('knowledge', `knowledge:${row.id}`, row, row.name || '知识成果');
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

export async function readMindmapPlan(client: SiYuanClient, permMgr: PermissionManager, snapshot: any, display?: ProjectMindmapDisplay): Promise<MindmapPlan> {
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
        desired: projectMindmapNodes(snapshot), pageAttrs, rootAttrs: {}, actual: {}, ...(display ? { display } : {}),
    };
    if (!rootId) {
        displayMetadata(plan, plan.desired.map((node) => ({ ...node, id: node.key })), '$root');
        return plan;
    }
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
    // 预检使用稳定键占位新节点，避免随机块标识使严格状态哈希失效。
    displayMetadata(plan, plan.desired.map((node) => ({ ...node, id: plan.previous!.nodes.find((old) => old.key === node.key)?.id || node.key })), rootId);
    const expected: Record<string, string[]> = { [rootId]: plan.previous.nodes.filter((node) => node.parent === null).map((node) => node.id!) };
    for (const node of plan.previous.nodes) {
        expected[node.id!] = [node.paragraphId!, ...(node.listId ? [node.listId] : [])];
        if (node.listId) expected[node.listId] = plan.previous.nodes.filter((child) => child.parent === node.key).map((child) => child.id!);
    }
    // 原生批量接口仍逐块渲染；缺失任一块即停止，不以管理属性代替正文核验。
    const domIds = [...Object.keys(expected).filter((id) => id !== rootId), ...plan.previous.nodes.map((node) => node.paragraphId!)];
    const doms = await blockApi.getBlockDOMs(client, domIds);
    if (domIds.some((id) => typeof doms[id] !== 'string' || !doms[id])) throw new Error('导图正文读取不完整，停止同步。');
    // 独立只读检查最多并发六项；不缓存或跳过任何节点的结构核验。
    const reads = new PromiseLimitPool<void>(6);
    for (const [id, children] of Object.entries(expected)) reads.add(async () => {
        const actual = (await blockApi.getChildBlocks(client, id)).map((row) => row.id);
        if (JSON.stringify(actual) !== JSON.stringify(children)) throw new Error('导图结构已被人工修改，停止同步。');
        // 根块正文不参与增量写入；其自定义属性顺序由内核渲染，不能作为稳定预检状态。
        plan.actual[id] = { children: actual, ...(id === rootId ? {} : { dom: doms[id] }) };
    });
    const desiredByKey = new Map(plan.desired.map((node) => [node.key, node]));
    await reads.awaitAll();
    for (const node of plan.previous.nodes) {
        const dom = doms[node.paragraphId!];
        const actual = signature(dom);
        const desired = desiredByKey.get(node.key);
        // 内核会刷新引用锚文本；仅接受同一来源的当前生成文本，其他人工改写仍停止。
        const refreshedSource = node.sourceId && desired?.sourceId === node.sourceId && actual.label === desired.label;
        if ((!refreshedSource && actual.label !== node.label.trim()) || JSON.stringify(actual.refs) !== JSON.stringify(node.sourceId ? [node.sourceId] : [])) {
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
    const metadata = displayMetadata(plan, nodes, rootId);
    const displayChanged = hashWriteState(metadata) !== hashWriteState(readNativeMetadata(plan.rootAttrs[DISPLAY_ATTR]));
    if (old && !displayChanged && hashWriteState(old.nodes) === hashWriteState(nodes) && plan.pageAttrs[MINDMAP_AUTO_ATTR] === String(autoSync)) {
        return { status: 'unchanged', rootId, projectId: plan.projectId, autoSync, nodeCount: nodes.length };
    }
    const operations: TransactionOperation[] = [];
    if (!old) {
        const attrs = `${STATE_ATTR}="${escape(JSON.stringify(state))}" ${DISPLAY_ATTR}="${escape(JSON.stringify(metadata))}"`;
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
        operations.push({ action: 'setAttrs', id: rootId, data: JSON.stringify({ [STATE_ATTR]: JSON.stringify(state), ...(displayChanged ? { [DISPLAY_ATTR]: JSON.stringify(metadata) } : {}) }) });
    }
    operations.push({ action: 'setAttrs', id: plan.pageId, data: JSON.stringify({ [MINDMAP_ROOT_ATTR]: rootId, [MINDMAP_AUTO_ATTR]: String(autoSync) }) });
    await performTransactions(client, [{ doOperations: operations, undoOperations: [] }]);
    const attrs = await blockApi.getBlockAttrs(client, rootId);
    const pageAttrs = await blockApi.getBlockAttrs(client, plan.pageId);
    if (attrs[STATE_ATTR] !== JSON.stringify(state) || pageAttrs[MINDMAP_ROOT_ATTR] !== rootId || pageAttrs[MINDMAP_AUTO_ATTR] !== String(autoSync)) throw new Error('导图事务已提交，但管理记录回读不一致；不得盲目新建。');
    if ((!old || displayChanged) && hashWriteState(readNativeMetadata(attrs[DISPLAY_ATTR])) !== hashWriteState(metadata)) throw new Error('导图事务已提交，但原生显示配置回读不一致；请先核实实际状态。');
    return { status: old ? 'updated' : 'created', rootId, projectId: plan.projectId, autoSync, nodeCount: nodes.length };
}

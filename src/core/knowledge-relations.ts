import type { SiYuanClient } from '../api/client';
import { querySQL, querySQLWithMeta } from '../api/search';
import { escapeSqlString } from '../tools/internal/context';
import type { PermissionManager } from './permissions';

const FROM = 'custom-relation-from-id';
const TO = 'custom-relation-to-id';
const KIND = 'custom-relation-kind';
const STATUS = 'custom-relation-status';
const BLOCK_ID = /^\d{14}-[a-z0-9]{7}$/;
const EDGE_LIMIT = 50;
const ANCHOR_LIMIT = 100;

const evidenceTypes = ['evidence', 'output', 'result'];
const methodTypes = ['recipe', 'process', 'method'];
const conclusionTypes = ['decision', 'claim', 'summary'];
const projectTypes = ['summary', 'subline', 'subproject', 'project-overview'];

const directions: Record<string, { from: string[]; to: string[] }> = {
    'produced-by': { from: evidenceTypes, to: methodTypes },
    supports: { from: evidenceTypes, to: conclusionTypes },
    'constrained-by': {
        from: [...methodTypes, ...conclusionTypes, 'implementation'],
        to: ['warning', 'constraint', 'boundary'],
    },
    implements: { from: [...methodTypes, 'implementation'], to: methodTypes },
    'part-of': { from: projectTypes, to: projectTypes },
    'active-reuse': { from: [...projectTypes, ...methodTypes, 'implementation'], to: methodTypes },
    'compatibility-reference': { from: [...projectTypes, ...methodTypes, 'implementation'], to: methodTypes },
    'historical-compatibility': { from: [...projectTypes, ...methodTypes, 'implementation'], to: methodTypes },
};

export interface KnowledgeRelation {
    relationBlockId: string;
    kind: string;
    fromId: string;
    toId: string;
}

interface RelationEndpoints {
    kind: string;
    fromId: string;
    toId: string;
}

interface RelationEndpointRow {
    id: string;
    box: string;
    atom_type?: string;
    reuse_scope?: string;
}

const sql = (value: string) => `'${escapeSqlString(value)}'`;
const sqlList = (values: string[]) => values.map(sql).join(',');
const hasKey = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

function readableBoxes(permMgr: PermissionManager, columns: string[]): string {
    const denied = typeof permMgr.getAll === 'function'
        ? Object.entries(permMgr.getAll()).filter(([, permission]) => permission === 'none').map(([box]) => box)
        : [];
    return denied.length > 0 ? columns.map(column => `AND ${column} NOT IN (${sqlList(denied)})`).join('\n') : '';
}

function directionAllowed(kind: string, fromType: string, toType: string, toScope?: string): boolean {
    if (!hasKey(directions, kind)) return false;
    const direction = directions[kind];
    const reuse = ['active-reuse', 'compatibility-reference', 'historical-compatibility'].includes(kind);
    return direction.from.includes(fromType) && direction.to.includes(toType)
        && (!reuse || toScope !== 'public-candidate');
}

function explicitEndpoints(attrs: Record<string, string>): RelationEndpoints | undefined {
    const fromId = attrs[FROM];
    const toId = attrs[TO];
    const kind = attrs[KIND];
    if (!fromId || !toId || fromId === toId || !BLOCK_ID.test(fromId) || !BLOCK_ID.test(toId)
        || !kind || !hasKey(directions, kind)) return undefined;
    return { fromId, toId, kind };
}

export async function validateKnowledgeRelationMutation(
    client: SiYuanClient,
    permMgr: PermissionManager,
    id: string,
    attrs: Record<string, string>,
    current: Record<string, string>,
    pendingAttrs: ReadonlyMap<string, Record<string, string>>,
): Promise<string | undefined> {
    if (![FROM, TO, KIND, STATUS].some(key => hasKey(attrs, key))) return undefined;
    const next = { ...current, ...attrs };
    if (![FROM, TO, STATUS].some(key => hasKey(attrs, key)) && !current[FROM] && !current[TO]
        && current[KIND] && current[KIND] === next[KIND]) return undefined;

    const endpoints = explicitEndpoints(next);
    if (!endpoints || endpoints.fromId === id || endpoints.toId === id) {
        throw new Error('知识关系须设置有效的关系类型和两个不同的原子端点。');
    }
    if (next[STATUS] && next[STATUS] !== 'active' && next[STATUS] !== 'retired') {
        throw new Error('知识关系状态须为 active 或 retired。');
    }
    const { kind, fromId, toId } = endpoints;
    await permMgr.reload();
    const rows = await querySQL(client, `
        SELECT b.id, b.box, atom.value AS atom_type, scope.value AS reuse_scope FROM blocks b
        LEFT JOIN attributes atom ON atom.block_id=b.id AND atom.name='custom-atom-type'
        LEFT JOIN attributes scope ON scope.block_id=b.id AND scope.name='custom-reuse-scope'
        WHERE b.id IN (${sqlList([id, fromId, toId])}) LIMIT 3
    `) as RelationEndpointRow[];
    const relation = rows.find(row => row.id === id);
    if (!relation?.box || !permMgr.canWrite(relation.box)) {
        throw new Error('知识关系块缺失或不可写。');
    }
    if (next[STATUS] === 'retired') {
        if ([FROM, TO, KIND].some(key => next[key] !== current[key])) {
            throw new Error('退出知识关系时须保留现有端点及类型。');
        }
        return undefined;
    }
    const from = rows.find(row => row.id === fromId);
    const to = rows.find(row => row.id === toId);
    if (!from?.box || !to?.box || !permMgr.canRead(from.box) || !permMgr.canRead(to.box)) {
        throw new Error('知识关系的端点缺失或不可读。');
    }
    const fromType = pendingAttrs.get(fromId)?.['custom-atom-type'] ?? from.atom_type ?? '';
    const toType = pendingAttrs.get(toId)?.['custom-atom-type'] ?? to.atom_type ?? '';
    const toScope = pendingAttrs.get(toId)?.['custom-reuse-scope'] ?? to.reuse_scope;
    if (!directionAllowed(kind, fromType, toType, toScope)) {
        throw new Error('知识关系类型与端点原子类型或方向不符。');
    }
    const refs = await querySQL(client, `SELECT DISTINCT def_block_id FROM refs WHERE block_id=${sql(id)}
        AND def_block_id IN (${sqlList([fromId, toId])}) LIMIT 2`) as Array<{ def_block_id: string }>;
    if (!refs.some(ref => ref.def_block_id === fromId) || !refs.some(ref => ref.def_block_id === toId)) {
        throw new Error('关系块的真实引用尚未确认两个端点。请核对正文和引用索引后重试预检。');
    }

    const duplicates = await querySQL(client, `
        SELECT b.id, b.box FROM attributes source JOIN blocks b ON b.id=source.block_id
        JOIN attributes target ON target.block_id=b.id AND target.name=${sql(TO)} AND target.value=${sql(toId)}
        JOIN attributes kind ON kind.block_id=b.id AND kind.name=${sql(KIND)} AND kind.value=${sql(kind)}
        WHERE source.name=${sql(FROM)} AND source.value=${sql(fromId)} AND b.id<>${sql(id)}
        AND NOT EXISTS (SELECT 1 FROM attributes status WHERE status.block_id=b.id AND status.name=${sql(STATUS)} AND status.value='retired')
        ${readableBoxes(permMgr, ['b.box'])} LIMIT 50
    `) as Array<{ id: string; box: string }>;
    if (duplicates.some(row => row.box && permMgr.canRead(row.box))) {
        throw new Error('已存在相同端点和类型的知识关系。请复用既有关系块。');
    }
    return `${fromId}/${kind}/${toId}`;
}

interface RelationRow {
    relation_id: string;
    relation_box: string;
    kind: string;
    from_id: string;
    from_box: string;
    from_type: string;
    to_id: string;
    to_box: string;
    to_type: string;
    to_scope?: string;
}

/** 用明确端点读取一跳关系。没有端点的旧记录仅标记为待核对。 */
export async function readKnowledgeRelations(client: SiYuanClient, permMgr: PermissionManager, ids: string[]) {
    const anchors = [...new Set(ids.filter(id => BLOCK_ID.test(id)))];
    const edges: KnowledgeRelation[] = [];
    if (anchors.length === 0) return { edges, hasMore: false, hasUnresolvedLegacy: false };
    await permMgr.reload();
    const scopedAnchors = new Set(anchors.slice(0, ANCHOR_LIMIT));
    const scopedIds = sqlList([...scopedAnchors]);
    const result = await querySQLWithMeta(client, `
        SELECT DISTINCT edge.id AS relation_id, edge.box AS relation_box, kind.value AS kind,
            origin.id AS from_id, origin.box AS from_box, originAtom.value AS from_type,
            destination.id AS to_id, destination.box AS to_box, destinationAtom.value AS to_type,
            scope.value AS to_scope
        FROM attributes anchor JOIN blocks edge ON edge.id=anchor.block_id
        JOIN attributes kind ON kind.block_id=edge.id AND kind.name=${sql(KIND)}
        JOIN attributes source ON source.block_id=edge.id AND source.name=${sql(FROM)}
        JOIN attributes target ON target.block_id=edge.id AND target.name=${sql(TO)}
        JOIN blocks origin ON origin.id=source.value
        JOIN blocks destination ON destination.id=target.value
        JOIN attributes originAtom ON originAtom.block_id=origin.id AND originAtom.name='custom-atom-type'
        JOIN attributes destinationAtom ON destinationAtom.block_id=destination.id AND destinationAtom.name='custom-atom-type'
        LEFT JOIN attributes scope ON scope.block_id=destination.id AND scope.name='custom-reuse-scope'
        WHERE anchor.name IN (${sqlList([FROM, TO])}) AND anchor.value IN (${scopedIds})
        AND origin.id<>destination.id AND edge.id<>origin.id AND edge.id<>destination.id
        AND kind.value IN (${sqlList(Object.keys(directions))})
        AND NOT EXISTS (SELECT 1 FROM attributes status WHERE status.block_id=edge.id AND status.name=${sql(STATUS)} AND status.value='retired')
        AND EXISTS (SELECT 1 FROM refs WHERE block_id=edge.id AND def_block_id=origin.id)
        AND EXISTS (SELECT 1 FROM refs WHERE block_id=edge.id AND def_block_id=destination.id)
        ${readableBoxes(permMgr, ['edge.box', 'origin.box', 'destination.box'])}
        ORDER BY edge.id LIMIT ${EDGE_LIMIT + 1}
    `);
    const found = new Set<string>();
    for (const row of result.rows as RelationRow[]) {
        if (![row.relation_box, row.from_box, row.to_box].every(box => box && permMgr.canRead(box))) continue;
        if (![row.relation_id, row.from_id, row.to_id].every(id => BLOCK_ID.test(id))
            || (!scopedAnchors.has(row.from_id) && !scopedAnchors.has(row.to_id))) continue;
        if (!directionAllowed(row.kind, row.from_type, row.to_type, row.to_scope)) continue;
        const key = `${row.from_id}/${row.kind}/${row.to_id}`;
        if (found.has(key)) continue;
        found.add(key);
        if (edges.length < EDGE_LIMIT) edges.push({ relationBlockId: row.relation_id, kind: row.kind, fromId: row.from_id, toId: row.to_id });
    }

    const legacy = await querySQL(client, `
        SELECT edge.box AS relation_box, target.box AS target_box
        FROM refs r JOIN blocks edge ON edge.id=r.block_id JOIN blocks target ON target.id=r.def_block_id
        JOIN attributes kind ON kind.block_id=edge.id AND kind.name=${sql(KIND)}
        WHERE r.def_block_id IN (${scopedIds}) AND kind.value IN (${sqlList(Object.keys(directions))})
        AND (NOT EXISTS (SELECT 1 FROM attributes a WHERE a.block_id=edge.id AND a.name=${sql(FROM)} AND a.value<>'')
            OR NOT EXISTS (SELECT 1 FROM attributes a WHERE a.block_id=edge.id AND a.name=${sql(TO)} AND a.value<>''))
        AND NOT EXISTS (SELECT 1 FROM attributes status WHERE status.block_id=edge.id AND status.name=${sql(STATUS)} AND status.value='retired')
        ${readableBoxes(permMgr, ['edge.box', 'target.box'])} LIMIT 1
    `) as Array<{ relation_box: string; target_box: string }>;
    return {
        edges,
        hasMore: anchors.length > ANCHOR_LIMIT || result.kernelTruncated || result.rows.length > EDGE_LIMIT,
        hasUnresolvedLegacy: legacy.some(row => row.relation_box && row.target_box
            && permMgr.canRead(row.relation_box) && permMgr.canRead(row.target_box)),
    };
}

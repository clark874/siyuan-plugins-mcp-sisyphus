import type { SiYuanClient } from '../api/client';
import type { PermissionManager } from './permissions';
import type { ToolCategory } from './config';
import { hashWriteState } from './write-safety-hash';

export interface VisibleReferenceImpact {
    targetId: string;
    sourceBlockId: string;
    sourceDocumentId: string;
    notebookId: string;
    hpath?: string;
    referenceType: string;
    content?: string;
}

export interface ReferenceImpact {
    targetIds: string[];
    referencedTargetIds: string[];
    externalReferenceCount: number;
    visibleReferences: VisibleReferenceImpact[];
    protectedReferenceCount: number;
    protectedDocumentCount: number;
    referenceHash: string;
}

type ReferenceRow = {
    def_block_id?: unknown;
    block_id?: unknown;
    root_id?: unknown;
    box?: unknown;
    hpath?: unknown;
    content?: unknown;
    markdown?: unknown;
    type?: unknown;
    span_markdown?: unknown;
};

const REFERENCE_QUERY_CHUNK_SIZE = 200;
const MAX_VISIBLE_REFERENCES = 100;
const SIYUAN_ID_PATTERN = /^\d{14}-[a-z0-9]{7}$/;

export async function expandDisappearingIds(
    client: SiYuanClient,
    category: ToolCategory,
    action: string,
    targetIds: string[],
): Promise<string[]> {
    const seeds = [...new Set(targetIds.filter((id) => SIYUAN_ID_PATTERN.test(id)))];
    if (seeds.length === 0) return [];
    if (category === 'block' && action === 'delete') {
        const discovered = new Set(seeds);
        const queue = [...seeds];
        while (queue.length > 0) {
            const parent = queue.shift()!;
            const children = await client.requestRead<unknown[] | null>('/api/block/getChildBlocks', { id: parent });
            for (const child of Array.isArray(children) ? children : []) {
                const id = child && typeof child === 'object' && !Array.isArray(child)
                    ? stringField((child as Record<string, unknown>).id)
                    : '';
                if (!SIYUAN_ID_PATTERN.test(id) || discovered.has(id)) continue;
                discovered.add(id);
                queue.push(id);
            }
        }
        return [...discovered].sort();
    }
    const documentRemoval = (category === 'document' && action === 'remove')
        || (category === 'fs' && (action === 'rm' || action === 'write'));
    if (!documentRemoval) return seeds.sort();
    const rootClauses = seeds.map((id) => `id = ${sqlString(id)} OR path LIKE '%/${escapeSql(id)}.sy/%'`).join(' OR ');
    const rootRows = await querySql(client, `SELECT id FROM blocks WHERE type = 'd' AND (${rootClauses}) LIMIT 10000`);
    const rootIds = [...new Set([...seeds, ...rootRows.map((row) => stringField((row as Record<string, unknown>).id)).filter(Boolean)])];
    const quotedRoots = rootIds.map(sqlString).join(', ');
    const blockRows = await querySql(client, `SELECT id FROM blocks WHERE id IN (${quotedRoots}) OR root_id IN (${quotedRoots}) LIMIT 50000`);
    return [...new Set([...rootIds, ...blockRows.map((row) => stringField((row as Record<string, unknown>).id)).filter(Boolean)])].sort();
}

export async function inspectReferenceImpact(
    client: SiYuanClient,
    permMgr: PermissionManager,
    targetIds: string[],
): Promise<ReferenceImpact> {
    const normalizedTargets = [...new Set(targetIds.map((id) => id.trim()).filter(Boolean))].sort();
    const targetSet = new Set(normalizedTargets);
    const rows: ReferenceRow[] = [];

    for (let start = 0; start < normalizedTargets.length; start += REFERENCE_QUERY_CHUNK_SIZE) {
        const chunk = normalizedTargets.slice(start, start + REFERENCE_QUERY_CHUNK_SIZE);
        const quoted = chunk.map(sqlString).join(', ');
        const refRows = await querySql(client, [
            'SELECT r.def_block_id, r.block_id, r.root_id, r.type,',
            'b.box, b.hpath, b.content, b.markdown',
            'FROM refs r LEFT JOIN blocks b ON b.id = r.block_id',
            `WHERE r.def_block_id IN (${quoted})`,
        ].join(' '));
        rows.push(...refRows);

        const conditions = chunk
            .map((id) => `instr(s.markdown, 'siyuan://blocks/${escapeSql(id)}') > 0`)
            .join(' OR ');
        const spanRows = await querySql(client, [
            'SELECT s.block_id, s.root_id, s.markdown AS span_markdown,',
            'b.box, b.hpath, b.content, b.markdown',
            'FROM spans s LEFT JOIN blocks b ON b.id = s.block_id',
            `WHERE ${conditions}`,
        ].join(' '));
        for (const row of spanRows) {
            const spanMarkdown = stringField(row.span_markdown);
            for (const match of spanMarkdown.matchAll(/siyuan:\/\/blocks\/([0-9A-Za-z-]+)/gi)) {
                if (!targetSet.has(match[1])) continue;
                rows.push({ ...row, def_block_id: match[1], type: 'block-link' });
            }
        }
    }

    const deduplicated = new Map<string, ReferenceRow>();
    for (const row of rows) {
        const targetId = stringField(row.def_block_id);
        const sourceBlockId = stringField(row.block_id);
        const sourceDocumentId = stringField(row.root_id);
        if (!targetSet.has(targetId) || !sourceBlockId) continue;
        if (targetSet.has(sourceBlockId) || targetSet.has(sourceDocumentId)) continue;
        deduplicated.set(`${targetId}\u0000${sourceBlockId}`, row);
    }

    const visibleReferences: VisibleReferenceImpact[] = [];
    const protectedDocuments = new Set<string>();
    let protectedReferenceCount = 0;
    for (const row of deduplicated.values()) {
        const notebookId = stringField(row.box);
        if (!notebookId || !permMgr.canRead(notebookId)) {
            protectedReferenceCount += 1;
            const sourceDocumentId = stringField(row.root_id);
            if (sourceDocumentId) protectedDocuments.add(sourceDocumentId);
            continue;
        }
        if (visibleReferences.length >= MAX_VISIBLE_REFERENCES) continue;
        const content = stringField(row.markdown) || stringField(row.content);
        visibleReferences.push({
            targetId: stringField(row.def_block_id),
            sourceBlockId: stringField(row.block_id),
            sourceDocumentId: stringField(row.root_id),
            notebookId,
            ...(stringField(row.hpath) ? { hpath: stringField(row.hpath) } : {}),
            referenceType: stringField(row.type) || 'reference',
            ...(content ? { content: content.slice(0, 2000) } : {}),
        });
    }

    visibleReferences.sort((left, right) => (
        left.targetId.localeCompare(right.targetId)
        || left.sourceDocumentId.localeCompare(right.sourceDocumentId)
        || left.sourceBlockId.localeCompare(right.sourceBlockId)
    ));
    const referencedTargetIds = [...new Set([...deduplicated.values()].map((row) => stringField(row.def_block_id)))].sort();
    const hashInput = {
        targetIds: normalizedTargets,
        references: [...deduplicated.values()].map((row) => ({
            targetId: stringField(row.def_block_id),
            sourceBlockId: stringField(row.block_id),
            sourceDocumentId: stringField(row.root_id),
            notebookId: stringField(row.box),
            referenceType: stringField(row.type),
        })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    };

    return {
        targetIds: normalizedTargets,
        referencedTargetIds,
        externalReferenceCount: deduplicated.size,
        visibleReferences,
        protectedReferenceCount,
        protectedDocumentCount: protectedDocuments.size,
        referenceHash: hashWriteState(hashInput),
    };
}

async function querySql(client: SiYuanClient, stmt: string): Promise<ReferenceRow[]> {
    const rows = await client.requestRead<unknown[] | null>('/api/query/sql', { stmt });
    return Array.isArray(rows)
        ? rows.filter((row): row is ReferenceRow => !!row && typeof row === 'object' && !Array.isArray(row))
        : [];
}

function stringField(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function sqlString(value: string): string {
    return `'${escapeSql(value)}'`;
}

function escapeSql(value: string): string {
    return value.replace(/'/g, "''");
}

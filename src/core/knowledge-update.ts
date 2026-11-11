import { z } from 'zod';
import type { SiYuanClient } from '../api/client';
import { getBlockAttrs } from '../api/block';
import { querySQL } from '../api/search';
import type { PermissionManager } from './permissions';
import { readProjectSourceState } from './project-sources';

export const KNOWLEDGE_UPDATE_ATTR = 'custom-knowledge-update-ledger';

const BlockId = z.string().regex(/^\d{14}-[a-z0-9]{7}$/);
const SourceVersion = z.object({
    key: z.string().trim().min(1).max(1000),
    revision: z.string().trim().min(1).max(256),
}).strict();
const PendingSource = SourceVersion.extend({
    disposition: z.enum(['pending', 'compiled', 'reused', 'excluded']),
    note: z.string().trim().min(1).max(500).optional(),
    reuseBlockId: BlockId.optional(),
    sourceBlockId: BlockId.optional(),
}).strict().refine(source => source.disposition !== 'excluded' || source.note, '排除来源须记录理由。').refine(source => source.disposition !== 'reused' || source.reuseBlockId, '复用来源须登记既有知识原子。');

const LedgerSchema = z.object({
    version: z.literal(1),
    projectId: z.string().trim().min(1).max(256),
    covered: z.array(PendingSource.refine(source => source.disposition !== 'pending', '已覆盖来源必须有处理结果。')),
    pending: z.object({
        batchId: z.string().trim().min(1).max(128),
        workstream: z.string().trim().min(1).max(128),
        phase: z.enum(['sources', 'atoms', 'relations', 'event', 'catalog', 'projection']),
        sources: z.array(PendingSource).min(1),
        atomIds: z.array(BlockId),
        relationIds: z.array(BlockId),
        eventBlockId: BlockId.optional(),
        nextStep: z.string().trim().min(1).max(500),
    }).strict().optional(),
}).strict().superRefine((ledger, ctx) => {
    for (const list of [ledger.covered, ledger.pending?.sources ?? []]) {
        if (new Set(list.map(item => item.key)).size !== list.length) {
            ctx.addIssue({ code: 'custom', message: '账本存在重复来源键。' });
        }
    }
    const targets = [...(ledger.pending?.atomIds ?? []), ...(ledger.pending?.relationIds ?? [])];
    if (new Set(targets).size !== targets.length) {
        ctx.addIssue({ code: 'custom', message: '账本存在重复对象块。' });
    }
});

type KnowledgeUpdateLedger = z.infer<typeof LedgerSchema>;

function sameSourceRevision(left: string | undefined, right: string): boolean {
    const sha = /^(?:sha256:)?([a-f0-9]{64})$/i;
    const leftHash = left?.match(sha)?.[1];
    const rightHash = right.match(sha)?.[1];
    return left === right || Boolean(leftHash && rightHash && leftHash.toLowerCase() === rightHash.toLowerCase());
}

function parseLedger(raw: string, projectId?: string): KnowledgeUpdateLedger {
    const ledger = LedgerSchema.parse(JSON.parse(raw));
    if (projectId && ledger.projectId !== projectId) throw new Error('知识更新账本项目不一致。');
    return ledger;
}

export async function readKnowledgeUpdateLedger(client: SiYuanClient, hubBlockId: string, projectId: string) {
    const attrs = await getBlockAttrs(client, hubBlockId);
    const raw = attrs?.[KNOWLEDGE_UPDATE_ATTR];
    if (raw === undefined) return { status: 'not_started' as const, hubBlockId, coveredCount: 0 };
    try {
        const ledger = parseLedger(raw, projectId);
        return {
            status: ledger.pending ? 'pending' as const : 'ready' as const,
            hubBlockId,
            coveredCount: ledger.covered.length,
            ...(ledger.pending ? { batchId: ledger.pending.batchId, phase: ledger.pending.phase } : {}),
        };
    } catch {
        return { status: 'invalid' as const, hubBlockId };
    }
}

export async function validateKnowledgeUpdateMutation(
    client: SiYuanClient,
    permMgr: PermissionManager,
    id: string,
    attrs: Record<string, string>,
    current: Record<string, string>,
): Promise<string | undefined> {
    if (!Object.prototype.hasOwnProperty.call(attrs, KNOWLEDGE_UPDATE_ATTR)) return;
    const next = parseLedger(attrs[KNOWLEDGE_UPDATE_ATTR]);
    const state = await readProjectSourceState(client, next.projectId);
    if (state.record?.hubBlockId !== id) throw new Error('知识更新账本必须保存于已登记的项目中枢。');
    const priorRaw = current[KNOWLEDGE_UPDATE_ATTR];
    const prior = priorRaw === undefined ? undefined : parseLedger(priorRaw, next.projectId);
    const pending = prior?.pending;
    if (pending && next.pending && (pending.batchId !== next.pending.batchId || pending.workstream !== next.pending.workstream)) {
        throw new Error('项目已有未完成知识批次，请先续接该批次。');
    }
    if (!pending && next.pending && next.pending.phase !== 'sources') {
        throw new Error('新知识批次必须先登记来源。');
    }
    if (pending && next.pending) {
        const checkpoint = next.pending;
        if (pending.atomIds.some(id => !checkpoint.atomIds.includes(id))
            || pending.relationIds.some(id => !checkpoint.relationIds.includes(id))
            || (pending.eventBlockId && checkpoint.eventBlockId !== pending.eventBlockId)) {
            throw new Error('续接时必须保留已写入的知识对象和事件。');
        }
        const revisions = new Map(next.pending.sources.map(source => [source.key, source.revision]));
        if (revisions.size !== pending.sources.length || pending.sources.some(source => revisions.get(source.key) !== source.revision)) {
            throw new Error('已开始批次的来源版本固定，新版本须在本批续接后另行处理。');
        }
    }

    const priorCovered = new Map(prior?.covered.map(source => [source.key, JSON.stringify(source)]));
    const nextCovered = new Map(next.covered.map(source => [source.key, JSON.stringify(source)]));
    if ([...priorCovered.keys()].some(key => !nextCovered.has(key))) {
        throw new Error('不能清空既有知识覆盖记录。');
    }
    const closing = pending && !next.pending;
    if (!closing) {
        if (next.covered.some(source => priorCovered.get(source.key) !== nextCovered.get(source.key))) {
            throw new Error('完成批次回读后才能更新来源覆盖版本。');
        }
        return;
    }
    if (pending.phase !== 'projection' || pending.sources.some(source => source.disposition === 'pending')) {
        throw new Error('知识批次仍有未验收的来源或步骤。');
    }
    const finished = new Map(pending.sources.map(source => [source.key, JSON.stringify(source)]));
    if (pending.sources.some(source => nextCovered.get(source.key) !== finished.get(source.key))
        || next.covered.some(source => priorCovered.get(source.key) !== nextCovered.get(source.key) && finished.get(source.key) !== nextCovered.get(source.key))) {
        throw new Error('来源覆盖必须与本批已验收的版本一致。');
    }

    const targets = [...pending.atomIds, ...pending.relationIds];
    if (pending.sources.some(source => source.disposition === 'compiled') && !targets.length) {
        throw new Error('标为已编译的来源须有可回读的知识对象。');
    }
    await permMgr.reload();
    for (const source of pending.sources) {
        if (source.disposition !== 'reused') continue;
        const reuseId = source.reuseBlockId!;
        const blocks = await querySQL(client, `SELECT id, box FROM blocks WHERE id='${reuseId}' LIMIT 1`) as { id: string; box: string }[];
        if (!blocks.some(row => row.id === reuseId && permMgr.canRead(row.box))) {
            throw new Error('复用知识原子不可读，保留批次待续接。');
        }
        const atom = await getBlockAttrs(client, reuseId);
        if (atom['custom-knowledge-project-id'] !== next.projectId || !atom['custom-atom-type']
            || ![atom['custom-source-hash'], atom['custom-source-revision']].some(value => sameSourceRevision(value, source.revision))) {
            throw new Error('复用知识原子的项目、类型或来源版本不一致。');
        }
    }
    if (targets.length || pending.eventBlockId) {
        const eventId = pending.eventBlockId;
        if (!eventId) throw new Error('知识对象已经变更，关闭批次前须回读知识事件。');
        const eventRows = await querySQL(client, `SELECT id, box FROM blocks WHERE id='${eventId}'
            AND root_id=(SELECT root_id FROM blocks WHERE id='${id}') LIMIT 1`) as { id: string; box: string }[];
        if (!eventRows.some(row => row.id === eventId && permMgr.canRead(row.box))) {
            throw new Error('知识事件不可读，保留批次待续接。');
        }
        const event = await getBlockAttrs(client, eventId);
        const recorded = JSON.parse(event['custom-provenance-target-atom-ids'] || '[]');
        if (event['custom-provenance-kind'] !== 'event' || event['custom-provenance-schema'] !== '1'
            || event['custom-progress-kind'] !== 'knowledge' || event['custom-progress-schema'] !== '1'
            || event['custom-provenance-project-id'] !== next.projectId
            || event['custom-provenance-event-id'] !== pending.batchId
            || event['custom-progress-workstream'] !== pending.workstream
            || !Array.isArray(recorded) || recorded.length !== targets.length || targets.some(target => !recorded.includes(target))) {
            throw new Error('知识事件与批次、工作线或对象清单不一致。');
        }
        const refs = await querySQL(client, `SELECT DISTINCT def_block_id FROM refs WHERE block_id='${eventId}'`) as { def_block_id: string }[];
        const linked = new Set(refs.map(row => row.def_block_id));
        if (targets.some(target => !linked.has(target))) throw new Error('知识事件反查引用尚未完整，保留批次待续接。');
    }
    const sourceRows = pending.sources.flatMap(source => {
        if (source.disposition === 'excluded') return [];
        const identity = BlockId.safeParse(source.key);
        if (identity.success && source.sourceBlockId && source.sourceBlockId !== identity.data) {
            throw new Error('思源来源键与已登记的资料块不一致，保留批次待续接。');
        }
        const sourceId = source.sourceBlockId ?? (identity.success ? identity.data : undefined);
        return sourceId ? [{ id: sourceId, status: source.disposition }] : [];
    });
    if (pending.atomIds.length || sourceRows.length) {
        const { verifyProjectKnowledgeCatalogBindings } = await import('../tools/project/knowledge-catalog');
        await verifyProjectKnowledgeCatalogBindings(client, permMgr, next.projectId, pending.workstream, pending.atomIds, sourceRows);
    }
    return next.projectId;
}

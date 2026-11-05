import type { SiYuanClient } from '../../api/client';
import type { PermissionManager } from '../../core/permissions';
import { getBlockKramdowns } from '../../api/block';
import { fullTextSearchBlock, querySQL, semanticSearchBlock } from '../../api/search';
import { ensurePermissionForAvId, extractAvRowLookup } from '../av/handlers';
import { escapeSqlString } from '../internal/context';
import type { ToolActionHandler } from '../internal/define-tool';
import { createJsonResult } from '../internal/shared';
import { attachKnowledgeContext, currentLiteratureRole, isLiteratureEvidenceRole, literatureRoleProjection, rerankKnowledgeCandidates } from '../search/retrieval';
import { LiteratureFindEvidenceSchema } from './schemas';

type Catalog = { id: string; av_id: string; box: string; root_id: string; title: string; projects?: string };
type DocumentRow = { id: string; box: string; path: string; content: string; updated: string };
type EvidenceRow = { id: string; root_id: string; box: string; content: string; type?: string; heading?: string; literature_role?: string; literature_role_digest?: string; updated?: string; decisionScore?: number };
type AvCell = { blockID?: string; text?: { content?: string }; mSelect?: Array<{ content?: string }>; number?: { content?: number }; select?: { content?: string } };
type AvColumn = { key?: { name?: string }; values?: AvCell[] };
const idPattern = /^\d{14}-[a-z0-9]{7}$/;
const quote = (value: string) => "'" + escapeSqlString(value) + "'";
const idsSql = (ids: string[]) => ids.map(quote).join(',');
const normalized = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const doiOf = (value: string) => normalized(value).replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi\s*:\s*)/i, '');
const projectKeys = (value: string) => value.split(/[,，;；\s/|]+/).filter(Boolean).map(normalized);
const link = (id: string) => `siyuan://blocks/${id}`;

/** 标记挂在真实 AV 块上，发现阶段不打开整张表。 */
export async function discoverLiteratureLibraries(client: SiYuanClient, permMgr: PermissionManager, projectId?: string) {
    const catalogs = await querySQL(client, `
        SELECT b.id, b.box, b.root_id, a.value AS av_id, d.content AS title,
            (SELECT p.value FROM attributes p WHERE p.block_id=b.id AND p.name='custom-literature-projects' LIMIT 1) AS projects
        FROM attributes a JOIN blocks b ON b.id=a.block_id JOIN blocks d ON d.id=b.root_id
        WHERE a.name='custom-literature-catalog' AND b.type='av' ORDER BY b.id LIMIT 50
    `) as Catalog[];
    return catalogs.filter(row => idPattern.test(row.id) && idPattern.test(row.av_id) && permMgr.canRead(row.box)
        && (!projectId || projectKeys(row.projects ?? '').includes(normalized(projectId))))
        .map(row => ({ catalogBlockId: row.id, avId: row.av_id, notebookId: row.box, documentId: row.root_id,
            title: row.title, url: link(row.id), query: { tool: 'literature', operation: 'find_evidence', catalogBlockId: row.id,
                ...(projectId ? { projectId } : {}) } }));
}

function fieldText(value: AvCell): string {
    return value.text?.content ?? value.select?.content ?? value.mSelect?.map(item => item.content ?? '').join(', ')
        ?? (value.number?.content === undefined ? '' : String(value.number.content));
}

async function readCatalog(client: SiYuanClient, permMgr: PermissionManager, catalog: Awaited<ReturnType<typeof discoverLiteratureLibraries>>[number]) {
    const permission = await ensurePermissionForAvId(client, permMgr, catalog.avId, 'read', {
        blockID: catalog.catalogBlockId, databaseBlocksOnly: true,
    });
    if (permission.denied) return null;
    const bindings = extractAvRowLookup(permission.avData).rows.filter(row => row.sourceBlockID && idPattern.test(row.sourceBlockID));
    if (bindings.length > 2000) throw Error('文献目录超过本次读取上限，请按集合拆分目录。');
    const cellsByRow = new Map<string, Record<string, string>>();
    for (const column of (permission.avData as { keyValues?: AvColumn[] }).keyValues ?? []) {
        if (!column.key?.name) continue;
        for (const value of column.values ?? []) {
            if (!value.blockID) continue;
            const cells = cellsByRow.get(value.blockID) ?? {};
            cells[normalized(column.key.name)] = fieldText(value);
            cellsByRow.set(value.blockID, cells);
        }
    }
    const ids = [...new Set(bindings.flatMap(row => row.sourceBlockID ?? []))];
    const documents: DocumentRow[] = [];
    for (let start = 0; start < ids.length; start += 150) {
        documents.push(...await querySQL(client, `SELECT id, box, path, content, updated FROM blocks
            WHERE type='d' AND id IN (${idsSql(ids.slice(start, start + 150))}) LIMIT 150`) as DocumentRow[]);
    }
    const docs = new Map(documents.filter(doc => permMgr.canRead(doc.box)).map(doc => [doc.id, doc]));
    return bindings.flatMap(({ rowID, sourceBlockID }) => {
        const doc = docs.get(sourceBlockID ?? '');
        if (!doc) return [];
        const cells = cellsByRow.get(rowID ?? '') ?? {};
        const get = (...names: string[]) => names.map(name => cells[normalized(name)]).find(Boolean) ?? '';
        return [{ rowId: rowID, documentId: doc.id, box: doc.box, path: doc.path, updated: doc.updated, url: link(doc.id),
            title: get('题名', '标题', '论文题名', 'title') || doc.content,
            author: get('作者', 'authors', 'author'), year: get('出版年份', '年份', 'year'),
            doi: get('DOI'), zoteroKey: get('Zotero 键', 'Zotero键', 'Zotero itemKey'),
            summary: get('摘要', '内容说明', 'abstract').slice(0, 600), topic: get('已核定专题', '主题'),
            projects: projectKeys(get('所属项目', '项目', 'project')),
            fulltextStatus: get('全文状态'), version: get('正文版本', '原文哈希', '原文SHA256') }];
    });
}

type Paper = NonNullable<Awaited<ReturnType<typeof readCatalog>>>[number];
const publicPaper = ({ path: _path, box: _box, ...paper }: Paper) => paper;

async function scopedRows(client: SiYuanClient, permMgr: PermissionManager, candidates: string[], papers: Paper[]) {
    const ids = [...new Set(candidates.filter(id => idPattern.test(id)))];
    if (!ids.length || !papers.length) return [];
    const docs = new Set(papers.map(paper => paper.documentId));
    const rows = await querySQL(client, `SELECT b.id,b.root_id,b.box,b.content,b.type,b.updated,
        ${literatureRoleProjection},
        COALESCE((SELECT h.content FROM blocks h WHERE h.id=b.parent_id AND h.root_id=b.root_id AND h.type='h'),
            (SELECT h.content FROM blocks h WHERE h.root_id=b.root_id AND h.parent_id=b.parent_id
                AND h.type='h' AND h.sort<=b.sort ORDER BY h.sort DESC LIMIT 1)) AS heading
        FROM blocks b WHERE b.id IN (${idsSql(ids)}) AND b.type IN ('p','m','c','t') LIMIT ${ids.length}`) as EvidenceRow[];
    const byId = new Map(rows.filter(row => docs.has(row.root_id) && permMgr.canRead(row.box)
        && row.type !== 'h' && Boolean(row.content.trim())
        && (row.literature_role || (
            !/^(?:keywords?|key words|关键词|關鍵詞)\s*[:：]/i.test(row.content.trim()) &&
            !/^(?:\d+[.\s]*)?(?:references|bibliography|参考文献|參考文獻)\s*$/i.test(row.heading?.trim() ?? '')
        ))).map(row => [row.id, row]));
    return ids.flatMap(id => byId.get(id) ?? []);
}

const kernelIds = (data: { blocks?: Array<{ id?: string }> } | null | undefined) => (data?.blocks ?? []).flatMap(block => block.id ?? []);
const pathsFor = (papers: Paper[]) => [...new Set(papers.map(paper => paper.box + paper.path))];

function weave<T>(left: T[], right: T[]) {
    const items: T[] = [];
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
        if (i < left.length) items.push(left[i]);
        if (i < right.length) items.push(right[i]);
    }
    return items;
}

async function lexicalIds(client: SiYuanClient, terms: string[], papers: Paper[], pageSize: number) {
    const paths = papers.length <= 150 ? pathsFor(papers) : [...new Set(papers.map(paper => paper.box))];
    const results = await Promise.allSettled(terms.map(query => fullTextSearchBlock(client, { query, paths, page: 1, pageSize })));
    const scores = new Map<string, number>();
    for (const data of results) if (data.status === 'fulfilled') kernelIds(data.value)
        .forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (61 + rank)));
    return { ids: [...scores].sort((a, b) => b[1] - a[1]).map(([id]) => id),
        failed: results.filter(outcome => outcome.status === 'rejected').length,
        pageTruncated: results.some(outcome => outcome.status === 'fulfilled' &&
            (kernelIds(outcome.value).length >= pageSize || Number(outcome.value?.matchedBlockCount) > kernelIds(outcome.value).length)) };
}

export const findLiteratureEvidence: ToolActionHandler = async ({ client, permMgr, rawArgs }) => {
    const args = LiteratureFindEvidenceSchema.parse(rawArgs);
    await permMgr.reload();
    const allCatalogs = await discoverLiteratureLibraries(client, permMgr);
    const catalogs = allCatalogs.filter(c => !args.catalogBlockId || c.catalogBlockId === args.catalogBlockId);
    const result = (status: string, payload = {}) => createJsonResult({ status, readOnly: true, source: 'siyuan_literature', ...payload });
    if (!catalogs.length) return result(args.catalogBlockId ? 'catalog_not_found' : 'catalog_missing', { catalogs: [] });
    if (catalogs.length > 1) return result('catalog_selection_required', { catalogs });
    const catalog = catalogs[0];
    const registered = await readCatalog(client, permMgr, catalog);
    if (!registered) return result('catalog_unavailable');
    const doi = args.doi ?? (args.query && /^10\.\d{4,9}\/\S+$/.test(doiOf(args.query)) ? args.query : undefined);
    const exact = Boolean(args.documentId || doi || args.title || args.zoteroKey);
    const papers = registered.filter(paper => (!args.projectId || paper.projects.includes(normalized(args.projectId)))
        && (!args.documentId || paper.documentId === args.documentId)
        && (!doi || doiOf(paper.doi) === doiOf(doi))
        && (!args.title || normalized(paper.title) === normalized(args.title))
        && (!args.zoteroKey || normalized(paper.zoteroKey) === normalized(args.zoteroKey))
        && (!args.author || normalized(paper.author).includes(normalized(args.author)))
        && (!args.year || paper.year === String(args.year)));
    const limit = args.limit ?? 20;
    const offset = args.offset ?? 0;
    if (!papers.length) return result(registered.length === 0 && !exact && !args.query && !args.keywords?.length
        ? 'catalog_empty' : 'not_found', { catalog, papers: [], evidence: [] });
    if (exact && new Set(papers.map(paper => paper.documentId)).size > 1) return result('ambiguous', {
        catalog, papers: papers.slice(offset, offset + limit).map(publicPaper), totalMatches: papers.length, evidence: [],
        offset, hasMore: offset + limit < papers.length, nextOffset: offset + limit < papers.length ? offset + limit : null,
    });
    const query = doi && !args.doi ? undefined : args.query;
    if (!query && !args.keywords?.length) return result(exact ? 'found' : 'catalog', {
        catalog, papers: papers.slice(offset, offset + limit).map(publicPaper), totalMatches: papers.length, evidence: [],
        offset, hasMore: offset + limit < papers.length, nextOffset: offset + limit < papers.length ? offset + limit : null,
    });
    const terms = [...new Set(args.keywords?.length ? args.keywords : [query!])];
    const semanticQuery = query ?? terms.join(' ');
    const byDocument = new Map(papers.map(paper => [paper.documentId, paper]));
    const pageSize = 100;
    const initial = await lexicalIds(client, terms, papers, pageSize);
    const lexical = await scopedRows(client, permMgr, initial.ids, papers);
    let vectorRows: EvidenceRow[] = [];
    let vectorStatus = 'not_requested';
    let vectorPageTruncated = false;
    let vectorCoverage: { indexed: number; untagged: number } | undefined;
    if (args.semantic) {
        if (papers.length > 150) vectorStatus = 'scope_too_large';
        else try {
            const stats = await querySQL(client, `SELECT count(*) AS indexed,
                coalesce(sum(CASE WHEN coalesce(e.space,'')='' THEN 1 ELSE 0 END),0) AS untagged
                FROM block_embeddings e JOIN blocks b ON b.id=e.id
                WHERE b.root_id IN (${idsSql(papers.map(paper => paper.documentId))}) AND length(e.embedding)>0`)
                .catch(() => []);
            const row = stats[0] as { indexed?: number; untagged?: number } | undefined;
            if (typeof row?.indexed === 'number' && typeof row.untagged === 'number') {
                vectorCoverage = { indexed: row.indexed, untagged: row.untagged };
            }
            // 内核语义接口可调用其自带的外部精排。这里仅允许向量补召回。
            const configuration = await client.requestRead<{ conf?: { ai?: { rerank?: { enabled?: boolean } } } }>('/api/system/getConf', {});
            if (!configuration?.conf?.ai) vectorStatus = 'configuration_unavailable';
            else if (configuration.conf.ai.rerank?.enabled) vectorStatus = 'kernel_rerank_enabled';
            else {
                const semantic = await semanticSearchBlock(client, { query: semanticQuery, paths: pathsFor(papers), page: 1, pageSize });
                vectorPageTruncated = kernelIds(semantic).length >= pageSize || Number(semantic?.matchedBlockCount) > kernelIds(semantic).length;
                vectorRows = await scopedRows(client, permMgr, kernelIds(semantic), papers);
                vectorStatus = vectorRows.length ? 'candidates' : 'no_candidates';
            }
        } catch {
            vectorStatus = 'unavailable';
        }
    }
    const lexicalFailures = initial.failed;
    const vectorIds = new Set(vectorRows.map(row => row.id));
    const localIds = new Set(lexical.map(row => row.id));
    // 仅融合已通过范围与权限核验的正文块，不按论文数或输出数截断召回池。
    const scoped = [...new Map(weave(lexical, vectorRows).map(row => [row.id, row])).values()];
    const candidates = scoped.filter(isLiteratureEvidenceRole);
    let rerank: Record<string, unknown> = { status: 'not_requested' };
    let rerankPartial = false;
    let ranked = candidates.map(row => ({ ...row }));
    if (args.rerank && ranked.length) {
        const batches: EvidenceRow[][] = [];
        for (let start = 0; start < ranked.length; start += 10) batches.push(ranked.slice(start, start + 10));
        const statuses: Array<Record<string, unknown>> = [];
        let nextBatch = 0;
        await Promise.all(Array.from({ length: Math.min(3, batches.length) }, async () => {
            while (nextBatch < batches.length) {
                const index = nextBatch++;
                const batch = batches[index];
                try {
                    await attachKnowledgeContext(client, permMgr, batch, true);
                    statuses[index] = { batch: index + 1, candidates: batch.length,
                        ...await rerankKnowledgeCandidates(client, permMgr, semanticQuery, batch) };
                } catch {
                    statuses[index] = { batch: index + 1, candidates: batch.length,
                        status: 'fallback', reason: 'context_or_rerank_unavailable', rankedCount: 0 };
                }
            }
        }));
        const scored = batches.flat().filter(row => typeof row.decisionScore === 'number');
        rerankPartial = statuses.some(batch => batch.status !== 'applied') || scored.length !== candidates.length;
        // 某批失败时保留原召回顺序，不把未评分块混作完整精排。
        if (!rerankPartial) {
            const originalRanks = new Map(candidates.map((row, index) => [row.id, index]));
            ranked = batches.flat().sort((a, b) => b.decisionScore! - a.decisionScore!
                || originalRanks.get(a.id)! - originalRanks.get(b.id)!);
        }
        rerank = { status: rerankPartial ? 'partial' : 'applied', rankedCount: scored.length,
            candidateCount: candidates.length, batchSize: 10, concurrency: 3, batches: statuses,
            ordering: rerankPartial ? 'original_recall' : 'global_decision_score' };
    }
    await permMgr.reload();
    const chosen = (await scopedRows(client, permMgr, ranked.slice(offset, offset + limit).map(row => row.id), papers))
        .filter(isLiteratureEvidenceRole);
    if (!permMgr.canRead(catalog.notebookId)) return result('catalog_unavailable');
    const texts = chosen.length ? await getBlockKramdowns(client, chosen.map(row => row.id)).catch(() => ({} as Record<string, string>)) : {};
    const evidence = chosen.flatMap(row => typeof texts?.[row.id] === 'string' && texts[row.id].trim() ? [{
        documentId: row.root_id, blockId: row.id, url: link(row.id), heading: row.heading ?? '', updated: row.updated,
        contentRole: currentLiteratureRole(row),
        text: texts[row.id].slice(0, 1800), textTruncated: texts[row.id].length > 1800, evidenceStatus: 'source_read_back',
        ...(ranked.find(item => item.id === row.id)?.decisionScore !== undefined
            ? { decisionScore: ranked.find(item => item.id === row.id)!.decisionScore } : {}),
        channels: [localIds.has(row.id) ? 'fulltext' : '', vectorIds.has(row.id) ? 'semantic' : ''].filter(Boolean),
    }] : []);
    const outputDocuments = new Set(evidence.map(row => row.documentId));
    const hasMore = offset + limit < ranked.length;
    const semanticIncomplete = Boolean(args.semantic) && !['candidates', 'no_candidates'].includes(vectorStatus);
    const readbackIncomplete = evidence.length < Math.min(limit, Math.max(0, ranked.length - offset));
    return result(evidence.length ? 'found' : lexicalFailures || semanticIncomplete || readbackIncomplete ? 'retrieval_incomplete' : 'no_evidence', {
        catalog, papers: papers.filter(paper => outputDocuments.has(paper.documentId) && permMgr.canRead(paper.box)).map(publicPaper), evidence,
        offset, totalCandidates: ranked.length, hasMore, nextOffset: hasMore ? offset + limit : null,
        partial: Boolean(lexicalFailures) || semanticIncomplete || rerankPartial || readbackIncomplete,
        retrieval: { semantic: vectorStatus, ...(vectorCoverage ? { vectorCoverage } : {}), rerank, lexicalFailures,
            candidateCount: candidates.length, filteredByContentRole: scoped.length - candidates.length,
            candidateDocuments: new Set(candidates.map(row => row.root_id)).size,
            inspectedDocuments: outputDocuments.size, scopeDocuments: byDocument.size, pageSize,
            recallMayHaveMore: initial.pageTruncated || vectorPageTruncated,
            paginationScope: 'recalled_candidates', coverage: 'bounded_retrieval_pages' } });
};

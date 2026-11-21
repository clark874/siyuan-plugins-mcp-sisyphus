import type { SiYuanClient } from '../../api/client';
import { querySQLWithMeta } from '../../api/search';
import { normalizeAnchorToken } from '../../core/attribute-governance';
import type { PermissionManager } from '../../core/permissions';
import type { SearchLintSchema } from '../../core/types';
import { escapeSqlString, ensurePermissionForDocumentId, ensurePermissionForNotebook } from '../internal/context';
import { createJsonResult } from '../internal/shared';

type BlockRow = { id: string; updated: string; name: string; alias: string; type: string; atomType: string; content: string; chars: number; revision: string; sourceHash: string; markdown: string; markdownChars: number; lintExempt?: string };
type RefRow = { sourceId: string; targetId: string; targetBox?: string; declaredSourceHash?: string; declaredSourceRevision?: string; sourceRole?: string };
type Finding = { rule: string; ids: string[]; value?: string; targetId?: string; chars?: number; targetStatus?: 'missing_or_unreadable' };
type Exemption = { reason: string; until?: string };
const rules = new Set(['dead_reference', 'duplicate_name', 'alias_collision_candidate',
    'orphan_atom_candidate', 'stale_source_revision', 'oversize_atom', 'duplicate_atom_content']);

const literal = (value: string) => `'${escapeSqlString(value)}'`;

function readExemptions(rows: BlockRow[], today: string) {
    const entries = new Map<string, Record<string, Exemption>>();
    const diagnostics: Array<{ id: string; rule?: string; state: 'invalid' | 'expired'; hint: string }> = [];
    const isObject = (value: unknown): value is Record<string, unknown> =>
        !!value && typeof value === 'object' && !Array.isArray(value);
    for (const { id, lintExempt } of rows) {
        if (!lintExempt?.trim() || entries.has(id)) continue;
        let parsed: unknown;
        try { parsed = JSON.parse(lintExempt); } catch { /* 记录无效项，保留对应问题。 */ }
        if (!isObject(parsed)) {
            diagnostics.push({ id, state: 'invalid', hint: 'custom-lint-exempt 须为按规则命名的 JSON 对象。' });
            continue;
        }
        const available: Record<string, Exemption> = {};
        for (const [rule, item] of Object.entries(parsed)) {
            if (!rules.has(rule) || !isObject(item) || typeof item.reason !== 'string' || !item.reason.trim()
                || item.reason.length > 240 || item.until !== undefined &&
                (typeof item.until !== 'string' || !/^\d{4}-\d\d-\d\d$/u.test(item.until)
                    || new Date(item.until).toJSON()?.slice(0, 10) !== item.until)) {
                diagnostics.push({ id, state: 'invalid', hint: '请填写实际规则、1 至 240 字原因及可选 YYYY-MM-DD 截止日。' });
                continue;
            }
            const until = typeof item.until === 'string' ? item.until : undefined;
            if (until && until < today) {
                diagnostics.push({ id, rule, state: 'expired', hint: `豁免已于 ${until} 到期，对应问题继续报告。` });
                continue;
            }
            available[rule] = { reason: item.reason.trim(), ...(until ? { until } : {}) };
        }
        entries.set(id, available);
    }
    return { entries, diagnostics };
}

/** 仅按可读笔记本或单篇文档核对索引，列出需要人工判断的候选。 */
export async function lintKnowledgeScope(client: SiYuanClient, permissions: PermissionManager,
    args: ReturnType<typeof SearchLintSchema.parse>) {
    const { notebook, documentId, cursor, maxBlocks = 500, maxFindings = 100, atomCharLimit = 5000 } = args;
    let box = notebook;
    let rootId: string | undefined;
    if (documentId) {
        const { denied, context } = await ensurePermissionForDocumentId(client, permissions, documentId, 'read');
        if (denied) return denied;
        if (context.documentId !== documentId) throw new Error('documentId 必须是文档根块。');
        box = context.notebook;
        rootId = context.documentId;
    }
    if (!box) throw new Error('请指定 notebook 或 documentId。');
    const denied = await ensurePermissionForNotebook(permissions, box, 'read');
    if (denied) return denied;
    const scopeKind = rootId ? 'document' : 'notebook';
    const scopeId = rootId ?? box;
    if (cursor && (cursor.scopeId !== scopeId || cursor.scopeKind !== scopeKind
        || cursor.afterUpdated > cursor.cutoffUpdated || cursor.replaySince > cursor.cutoffUpdated
        || cursor.updatedSince && cursor.updatedSince > cursor.afterUpdated)) {
        throw new Error('巡检游标与范围或更新时间不符，请重新起扫。');
    }
    const bounds = cursor ?? (await querySQLWithMeta(client, `
        SELECT strftime('%Y%m%d%H%M%S','now','localtime') AS cutoffUpdated,
               strftime('%Y%m%d%H%M%S','now','-60 seconds','localtime') AS replaySince
    `)).rows[0] as { cutoffUpdated: string; replaySince: string } | undefined;
    if (!bounds || !/^\d{14}$/u.test(bounds.cutoffUpdated) || !/^\d{14}$/u.test(bounds.replaySince)
        || bounds.replaySince > bounds.cutoffUpdated) throw new Error('无法读取内核更新时间边界，未推进巡检水位。');
    const { cutoffUpdated, replaySince } = bounds;
    const updatedSince = cursor?.updatedSince ?? args.updatedSince;
    if (updatedSince && updatedSince > cutoffUpdated) throw new Error('巡检水位晚于当前内核时间，未推进水位。');
    const scope = `b.box = ${literal(box)}${rootId ? ` AND b.root_id = ${literal(rootId)}` : ''}`;
    const field = (id: string, name: string) => `(SELECT a.value FROM attributes a WHERE a.block_id = ${id} AND a.name = '${name}' LIMIT 1)`;
    const atomType = field('b.id', 'custom-atom-type');
    const basicFields = `b.id, b.updated, b.name, b.alias, b.type,
        CASE WHEN COALESCE(${atomType}, '') != '' THEN substr(b.content, 1, 12000) ELSE '' END AS content,
        length(b.content) AS chars, ${atomType} AS atomType, ${field('b.id', 'custom-lint-exempt')} AS lintExempt`;
    const timeRange = `b.updated <= ${literal(cutoffUpdated)}${updatedSince ? ` AND b.updated >= ${literal(updatedSince)}` : ''}
        ${cursor ? ` AND (b.updated, b.id) > (${literal(cursor.afterUpdated)}, ${literal(cursor.afterId)})` : ''}`;
    const indexed = await querySQLWithMeta(client, `
        SELECT ${basicFields},
               substr(b.markdown, 1, 16000) AS markdown, length(b.markdown) AS markdownChars,
               ${field('b.id', 'custom-source-hash')} AS sourceHash,
               ${field('b.id', 'custom-source-revision')} AS revision
          FROM blocks b WHERE ${scope} AND ${timeRange} ORDER BY b.updated,b.id LIMIT ${maxBlocks + 1}`);
    const blocks = (indexed.rows as BlockRow[]).slice(0, maxBlocks);
    const hasMore = indexed.rows.length > maxBlocks || indexed.kernelTruncated;
    const needsPeers = blocks.length > 0 && (updatedSince || cursor || hasMore);
    const peerLimit = 2000;
    const comparison = needsPeers ? await querySQLWithMeta(client, `
        SELECT ${basicFields} FROM blocks b WHERE ${scope} AND b.updated <= ${literal(cutoffUpdated)}
          AND (COALESCE(b.name,'') != '' OR COALESCE(b.alias,'') != '' OR COALESCE(${atomType},'') != '')
        ORDER BY b.id LIMIT ${peerLimit + 1}`) : undefined;
    const peers = new Map((comparison?.rows as BlockRow[] ?? []).slice(0, peerLimit).map(block => [block.id, block]));
    for (const block of blocks) peers.set(block.id, block);
    const comparisonComplete = !comparison?.kernelTruncated && (comparison?.rows.length ?? 0) <= peerLimit;
    const refs = { rows: [] as RefRow[], kernelTruncated: false };
    const inbound = { rows: [] as { targetId: string; sourceBox: string }[], kernelTruncated: false };
    const refLimit = 1001;
    for (let start = 0; start < blocks.length; start += 100) {
        const ids = blocks.slice(start, start + 100).map(row => literal(row.id)).join(',');
        const [out, into] = await Promise.all([
            querySQLWithMeta(client, `
                SELECT DISTINCT r.block_id AS sourceId, r.def_block_id AS targetId, d.box AS targetBox,
                       ${field('d.id', 'custom-source-role')} AS sourceRole,
                       ${field('d.id', 'custom-source-hash')} AS declaredSourceHash,
                       ${field('d.id', 'custom-source-revision')} AS declaredSourceRevision
                  FROM refs r LEFT JOIN blocks d ON d.id = r.def_block_id
                 WHERE r.block_id IN (${ids}) ORDER BY r.block_id, r.def_block_id LIMIT ${refLimit}`),
            querySQLWithMeta(client, `
                SELECT DISTINCT r.def_block_id AS targetId, s.box AS sourceBox
                  FROM refs r JOIN blocks s ON s.id = r.block_id
                 WHERE r.def_block_id IN (${ids}) ORDER BY r.def_block_id, s.box LIMIT ${refLimit}`),
        ]);
        refs.rows.push(...out.rows as RefRow[]);
        inbound.rows.push(...into.rows as typeof inbound.rows);
        refs.kernelTruncated ||= out.kernelTruncated || out.rows.length === refLimit;
        inbound.kernelTruncated ||= into.kernelTruncated || into.rows.length === refLimit;
    }
    const findings: Finding[] = [];
    // 内核可能不把目标从未存在的引用写入 refs。直接核对渲染语法中的目标，补足这种空记录。
    const explicitRefs = new Map<string, Set<string>>();
    let explicitRefsPartial = false;
    for (const block of blocks) {
        if (['d', 'c', 'l', 'i', 'b', 's'].includes(block.type)) continue;
        explicitRefsPartial ||= block.markdownChars > 16000;
        const markdown = (block.markdown || '').replace(/`+[^`]*`+/gu, '');
        for (const match of markdown.matchAll(/(?<!\\)(?:\(\((\d{14}-[a-z0-9]{7})\s+['"][^\n]*?\)\)|siyuan:\/\/blocks\/(\d{14}-[a-z0-9]{7})(?![\w-]))/gu)) {
            const id = match[1] || match[2];
            if (!explicitRefs.has(id) && explicitRefs.size >= 2000) { explicitRefsPartial = true; break; }
            const sources = explicitRefs.get(id) ?? new Set<string>();
            sources.add(block.id);
            explicitRefs.set(id, sources);
        }
    }
    const indexedPairs = new Set(refs.rows.map(row => `${row.sourceId}/${row.targetId}`));
    const explicitIds = [...explicitRefs.keys()];
    for (let start = 0; start < explicitIds.length; start += 100) {
        const ids = explicitIds.slice(start, start + 100);
        const matched = await querySQLWithMeta(client, `SELECT id,box FROM blocks WHERE id IN (${ids.map(literal).join(',')}) LIMIT 100`);
        if (matched.kernelTruncated) { explicitRefsPartial = true; continue; }
        const readable = new Set((matched.rows as { id: string; box: string }[]).filter(row => permissions.canRead(row.box)).map(row => row.id));
        for (const targetId of ids) {
            if (readable.has(targetId)) continue;
            for (const sourceId of explicitRefs.get(targetId)!) {
                if (!indexedPairs.has(`${sourceId}/${targetId}`)) {
                    findings.push({ rule: 'dead_reference', ids: [sourceId], targetId, targetStatus: 'missing_or_unreadable' });
                }
            }
        }
    }
    const namespace = new Map<string, Map<string, boolean>>();
    const repeatedBody = new Map<string, string[]>();
    const blockById = new Map(blocks.map(block => [block.id, block]));
    const linked = new Set(inbound.rows.filter(row => permissions.canRead(row.sourceBox)).map(row => row.targetId));
    for (const { sourceId, targetId, targetBox, sourceRole, declaredSourceHash, declaredSourceRevision } of refs.rows) {
        if (!targetBox || !permissions.canRead(targetBox)) {
            findings.push({ rule: 'dead_reference', ids: [sourceId], targetId, targetStatus: 'missing_or_unreadable' });
            continue;
        }
        linked.add(sourceId);
        const source = blockById.get(sourceId);
        if (source?.atomType && sourceRole === 'source-document'
            && (source.sourceHash && declaredSourceHash && source.sourceHash !== declaredSourceHash
                || source.revision && declaredSourceRevision && source.revision !== declaredSourceRevision)) {
            findings.push({ rule: 'stale_source_revision', ids: [sourceId], targetId });
        }
    }
    for (const block of peers.values()) {
        const name = normalizeAnchorToken(block.name || '');
        const aliases = (block.alias || '').split(/[,，]/u).map(normalizeAnchorToken).filter(Boolean);
        for (const key of new Set([name, ...aliases].filter(Boolean))) {
            const group = namespace.get(key) ?? new Map<string, boolean>();
            group.set(block.id, key === name);
            namespace.set(key, group);
        }
        if (!block.atomType) continue;
        if (blockById.has(block.id)) {
            if (!refs.kernelTruncated && !inbound.kernelTruncated && !linked.has(block.id)) findings.push({ rule: 'orphan_atom_candidate', ids: [block.id] });
            if (block.chars > atomCharLimit) findings.push({ rule: 'oversize_atom', ids: [block.id], chars: block.chars });
        }
        const text = block.chars <= 12000 && block.content?.normalize('NFKC').trim().replace(/\s+/gu, ' ');
        if (text) repeatedBody.set(text, [...repeatedBody.get(text) ?? [], block.id]);
    }
    for (const [value, group] of namespace) {
        const names = [...group].filter(([, name]) => name).map(([id]) => id);
        const ids = [...group.keys()];
        if (names.length > 1 && names.some(id => blockById.has(id))) findings.push({ rule: 'duplicate_name', ids: names, value });
        if (group.size > 1 && group.size !== names.length && ids.some(id => blockById.has(id))) findings.push({ rule: 'alias_collision_candidate', ids, value });
    }
    for (const ids of repeatedBody.values()) if (ids.length > 1 && ids.some(id => blockById.has(id))) findings.push({ rule: 'duplicate_atom_content', ids });
    const today = `${cutoffUpdated.slice(0, 4)}-${cutoffUpdated.slice(4, 6)}-${cutoffUpdated.slice(6, 8)}`;
    const { entries, diagnostics } = readExemptions([...peers.values()], today);
    const active: Finding[] = [];
    const exemptions: Array<{ finding: Finding; approvedBy: Array<{ id: string } & Exemption> }> = [];
    for (const finding of findings) {
        const approvedBy = finding.ids.flatMap(id => {
            const exemption = entries.get(id)?.[finding.rule];
            return exemption ? [{ id, ...exemption }] : [];
        });
        if (approvedBy.length) exemptions.push({ finding, approvedBy });
        if (approvedBy.length !== finding.ids.length) active.push(finding);
    }
    const referenceScanComplete = !refs.kernelTruncated && !inbound.kernelTruncated && !explicitRefsPartial;
    const truncated = active.length > maxFindings || exemptions.length > maxFindings || diagnostics.length > maxFindings;
    const pageComplete = referenceScanComplete && comparisonComplete && !truncated;
    const completeThroughPage = pageComplete && (cursor?.previousPagesComplete ?? true);
    const scanComplete = completeThroughPage && !hasMore;
    const last = blocks.at(-1);
    const nextCursor = last && hasMore ? {
        scopeId, scopeKind, cutoffUpdated, replaySince, updatedSince,
        afterUpdated: last.updated, afterId: last.id, previousPagesComplete: completeThroughPage,
    } : undefined;
    return createJsonResult({
        scope: { notebook: box, ...(rootId ? { documentId: rootId } : {}) }, scannedBlocks: blocks.length,
        scanMode: updatedSince ? 'incremental' : 'full', cutoffUpdated, ...(updatedSince ? { updatedSince } : {}),
        scanComplete, referenceScanComplete, comparisonComplete, truncated,
        totalFindings: active.length, findings: active.slice(0, maxFindings),
        fullyExemptedFindings: findings.length - active.length,
        exemptions: exemptions.slice(0, maxFindings), exemptionDiagnostics: diagnostics.slice(0, maxFindings),
        ...(nextCursor ? { nextCursor } : {}),
        ...(scanComplete ? { nextUpdatedSince: updatedSince && updatedSince > replaySince ? updatedSince : replaySince } : {}),
        basis: '可读索引的当前窗口。增量包含水位和起扫所在秒，定时续扫带重叠。对照可包含旧块，孤儿与别名冲突是复核候选。陈旧溯源只比较已登记的同类版本。豁免不改变扫描完整性。',
    });
}

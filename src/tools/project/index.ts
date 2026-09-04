import type { SiYuanClient } from '../../api/client';
import * as blockApi from '../../api/block';
import * as searchApi from '../../api/search';
import type { CategoryToolConfig, ProjectAction } from '../../core/config';
import {
    listProjectSources,
    matchProjectSourceByCwd,
    readProjectSourceState,
    resolveProjectSource,
    type ProjectManifestEntry,
    type ProjectSourceRecord,
} from '../../core/project-sources';
import {
    listProjectProvenanceSessions,
    validateLocalAgentSession,
} from '../../core/provenance';
import type { PermissionManager } from '../../core/permissions';
import { ProjectActionSchema, ProjectSnapshotSchema } from '../../core/types';
import { ensurePermissionForDocumentId, escapeSqlString } from '../internal/context';
import { defineTool } from '../internal/define-tool';
import { createJsonResult, createZodActionVariant, type ActionVariant, type ToolResult } from '../internal/shared';

export const PROJECT_TOOL_NAME = 'project';

type BlockRow = {
    id: string;
    box?: string;
    root_id?: string;
    parent_id?: string;
    content?: string;
    created?: string;
    updated?: string;
    hpath?: string;
    type?: string;
    subtype?: string;
    sort?: number;
};

type SnapshotDiagnostic = {
    code: string;
    severity: 'info' | 'warning' | 'error';
    status: 'ok' | 'historical_repairable' | 'invalid' | 'missing' | 'stale';
    message: string;
    blockId?: string;
};

type SnapshotEvent = BlockRow & {
    occurredAt: string;
    recordedAt: string;
    timeBasis: 'progress' | 'provenance' | 'created_fallback';
    attributes: Record<string, string>;
};

const SNAPSHOT_ROLES = new Set([
    'project-progress-page',
    'project-profile',
    'stage-ledger',
    'artifact-index',
    'project-state',
    'workstream-state',
]);

function normalizeProjectName(value: string): string {
    return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function projectDisplayName(row: BlockRow | null, projectId: string): string {
    const parts = row?.hpath?.split('/').filter(Boolean) || [];
    const content = row?.content?.trim() || '';
    if (/^(?:00\s*)?(?:项目)?知识中枢$/u.test(content) && parts.length > 1) return parts.at(-2) || projectId;
    return content || parts.at(-1) || projectId;
}

function clip(value: string | undefined, maxLength: number): string {
    if (!value) return '';
    return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`;
}

function rowId(row: unknown): string {
    return row && typeof row === 'object' && typeof (row as Record<string, unknown>).id === 'string'
        ? (row as Record<string, string>).id
        : '';
}

function asBlockRow(row: unknown): BlockRow | null {
    const id = rowId(row);
    return id ? row as BlockRow : null;
}

function timestampValue(value?: string): number {
    if (!value) return 0;
    if (/^\d{14}$/.test(value)) {
        const parsed = new Date(
            Number(value.slice(0, 4)),
            Number(value.slice(4, 6)) - 1,
            Number(value.slice(6, 8)),
            Number(value.slice(8, 10)),
            Number(value.slice(10, 12)),
            Number(value.slice(12, 14)),
        ).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSnapshotEvent(row: BlockRow, attrs: Record<string, string>): SnapshotEvent {
    const progressTime = attrs['custom-progress-occurred-at'];
    const provenanceTime = attrs['custom-provenance-occurred-at'];
    return {
        ...row,
        occurredAt: progressTime || provenanceTime || row.created || '',
        recordedAt: row.created || '',
        timeBasis: progressTime ? 'progress' : provenanceTime ? 'provenance' : 'created_fallback',
        attributes: attrs,
    };
}

function compareSnapshotEvents(left: SnapshotEvent, right: SnapshotEvent): number {
    return timestampValue(right.occurredAt) - timestampValue(left.occurredAt)
        || timestampValue(right.recordedAt) - timestampValue(left.recordedAt)
        || right.id.localeCompare(left.id);
}

function eventHead(event: SnapshotEvent | undefined) {
    if (!event) return null;
    return {
        id: event.id,
        eventId: event.attributes['custom-progress-event-id'] || event.attributes['custom-provenance-event-id'] || '',
        workstream: event.attributes['custom-progress-workstream'] || '',
        kind: event.attributes['custom-progress-kind'] || '',
        occurredAt: event.occurredAt,
        recordedAt: event.recordedAt,
        timeBasis: event.timeBasis,
    };
}

function chunks<T>(values: T[], size: number): T[][] {
    const output: T[][] = [];
    for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
    return output;
}

async function batchAttrs(client: SiYuanClient, ids: string[]): Promise<Record<string, Record<string, string>>> {
    const output: Record<string, Record<string, string>> = {};
    for (const batch of chunks(ids, 20)) Object.assign(output, await blockApi.batchGetBlockAttrs(client, batch));
    return output;
}

async function batchKramdown(client: SiYuanClient, ids: string[]): Promise<Record<string, string>> {
    const output: Record<string, string> = {};
    for (const batch of chunks(ids, 20)) Object.assign(output, await blockApi.getBlockKramdowns(client, batch));
    return output;
}

async function readableIds(
    client: SiYuanClient,
    permMgr: PermissionManager,
    ids: string[],
): Promise<string[]> {
    const readable: string[] = [];
    for (const id of [...new Set(ids)]) {
        const permission = await ensurePermissionForDocumentId(client, permMgr, id, 'read');
        if (!permission.denied) readable.push(id);
    }
    return readable;
}

async function blockRow(client: SiYuanClient, id: string): Promise<BlockRow | null> {
    const rows = await searchApi.querySQL(client, `SELECT id, root_id, content, created, updated, hpath, type FROM blocks WHERE id='${escapeSqlString(id)}' LIMIT 1`);
    return asBlockRow(rows[0]);
}

async function selectProject(
    client: SiYuanClient,
    selector: { cwd?: string; projectId?: string; projectName?: string },
): Promise<{
    status: 'matched' | 'not_found' | 'ambiguous';
    reason?: string;
    record?: ProjectSourceRecord;
    bindingStatus?: string;
    matchType?: 'exact' | 'descendant' | 'project-id' | 'project-name';
    candidates?: Array<{ projectId: string; name: string }>;
}> {
    if (selector.cwd) {
        const match = await matchProjectSourceByCwd(client, { cwd: selector.cwd });
        if (match.matched === false) {
            let candidates = match.candidates?.map((record) => ({ projectId: record.projectId, name: record.projectId }));
            if (match.reason === 'ambiguous_project_for_cwd' && candidates?.length) {
                const listed = await listProjectSources(client, { page: 1, pageSize: 100 });
                const displayNames = new Map(listed.data.map((source) => [source.projectId, source.displayName || source.projectId]));
                candidates = candidates.map((candidate) => ({ ...candidate, name: displayNames.get(candidate.projectId) || candidate.name }));
            }
            return {
                status: match.reason === 'ambiguous_project_for_cwd' ? 'ambiguous' : 'not_found',
                reason: match.reason,
                candidates,
            };
        }
        return { status: 'matched', record: match.record, bindingStatus: match.bindingStatus, matchType: match.matchType };
    }
    if (selector.projectId) {
        const state = await readProjectSourceState(client, selector.projectId);
        if (!state.record) return { status: 'not_found', reason: 'project_source_not_registered' };
        return { status: 'matched', record: state.record, bindingStatus: state.bindingStatus, matchType: 'project-id' };
    }

    const requested = normalizeProjectName(selector.projectName || '');
    const listed = await listProjectSources(client, { page: 1, pageSize: 100 });
    const matches: Array<{ record: ProjectSourceRecord; name: string; bindingStatus: string }> = [];
    for (const source of listed.data) {
        const sourceNames = [source.displayName, source.projectId].filter((item): item is string => Boolean(item));
        if (!sourceNames.some((name) => normalizeProjectName(name) === requested)) continue;
        const state = await readProjectSourceState(client, source.projectId);
        if (!state.record?.hubBlockId) continue;
        matches.push({ record: state.record, name: source.displayName || source.projectId, bindingStatus: state.bindingStatus });
    }
    if (matches.length === 0) return { status: 'not_found', reason: 'project_name_not_exactly_matched' };
    if (matches.length > 1) {
        return {
            status: 'ambiguous',
            reason: 'ambiguous_project_name',
            candidates: matches.map((item) => ({ projectId: item.record.projectId, name: item.name })),
        };
    }
    return { status: 'matched', record: matches[0].record, bindingStatus: matches[0].bindingStatus, matchType: 'project-name' };
}

function filteredAttrs(attrs: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(attrs).filter(([name]) => (
        name === 'name'
        || name === 'alias'
        || name === 'custom-verification-status'
        || name === 'custom-atom-type'
        || name.startsWith('custom-progress-')
        || name.startsWith('custom-provenance-')
    )));
}

function parseArtifactPaths(markdown: string, manifestEntries: ProjectManifestEntry[]): ProjectManifestEntry[] {
    return manifestEntries.filter((entry) => markdown.includes(entry.relativePath));
}

function eventSessionKeys(attrs: Record<string, string>): string[] {
    const keys: string[] = [];
    const progressProvider = attrs['custom-progress-provider'];
    const progressSession = attrs['custom-progress-session-id'];
    if (progressProvider && progressSession) keys.push(`${progressProvider}\u0000${progressSession}`);
    const sourceProvider = attrs['custom-provenance-source-provider'];
    const sourceSession = attrs['custom-provenance-source-session'];
    if (sourceProvider && sourceSession) keys.push(`${sourceProvider}\u0000${sourceSession}`);
    const compileProvider = attrs['custom-provenance-compile-provider'];
    const compileSession = attrs['custom-provenance-compile-session'];
    if (compileProvider && compileSession) keys.push(`${compileProvider}\u0000${compileSession}`);
    return [...new Set(keys)];
}

function projectionRoleFromHeading(content: string): { role: string; workstream?: string } | null {
    const normalized = content.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (/^(?:项目概览|project profile)$/iu.test(normalized)) return { role: 'project-profile' };
    if (/^(?:阶段台账|stage ledger)$/iu.test(normalized)) return { role: 'stage-ledger' };
    if (/^(?:权威产物索引|artifact index)$/iu.test(normalized)) return { role: 'artifact-index' };
    if (/^(?:当前项目状态|project state)$/iu.test(normalized)) return { role: 'project-state' };
    const workstream = normalized.match(/^(?:工作线状态|workstream state)\s*[:：]\s*(.+)$/iu)?.[1]?.trim();
    return workstream ? { role: 'workstream-state', workstream } : null;
}

async function buildProjectionRepairPlan(
    client: SiYuanClient,
    projectId: string,
    progressPageId: string | undefined,
    projections: Array<BlockRow & { role?: string; workstream?: string; attributes: Record<string, string> }>,
) {
    const misplaced = projections.filter((item) => item.type === 'h' && item.role && item.role !== 'project-progress-page');
    const presentRoles = new Set(projections.map((item) => item.role).filter(Boolean));
    const missingRequired = ['project-profile', 'stage-ledger', 'artifact-index', 'project-state']
        .some((role) => !presentRoles.has(role));
    if (!progressPageId || (misplaced.length === 0 && !missingRequired)) return null;

    const rawRows = await searchApi.querySQL(client, `SELECT id, root_id, parent_id, content, type, subtype, sort FROM blocks WHERE root_id='${escapeSqlString(progressPageId)}' ORDER BY sort ASC LIMIT 500`);
    const rows = rawRows.map(asBlockRow).filter((row): row is BlockRow => Boolean(row));
    const attrsById = await batchAttrs(client, rows.map((row) => row.id));
    const items = new Map<string, Record<string, string>>();
    const evidence: Array<{ headingId: string; targetId: string; role: string; workstream?: string }> = [];

    for (let index = 0; index < rows.length; index += 1) {
        const heading = rows[index];
        if (heading.type !== 'h') continue;
        const inferred = projectionRoleFromHeading(heading.content || '');
        const headingAttrs = attrsById[heading.id] || {};
        const existingRole = headingAttrs['custom-progress-role'];
        const role = existingRole && existingRole !== 'project-progress-page' ? existingRole : inferred?.role;
        if (!role || role === 'project-progress-page') continue;
        let target: BlockRow | undefined;
        for (const candidate of rows.slice(index + 1)) {
            if (candidate.parent_id !== heading.parent_id) continue;
            if (candidate.type === 'h') break;
            target = candidate;
            break;
        }
        if (!target) continue;
        const targetAttrs = attrsById[target.id] || {};
        if (targetAttrs['custom-progress-role'] === role) continue;
        const workstream = headingAttrs['custom-progress-workstream'] || inferred?.workstream;
        if (role === 'workstream-state' && !workstream) continue;

        const moved = Object.fromEntries(Object.entries(headingAttrs).filter(([name]) => name.startsWith('custom-progress-')));
        const targetPatch: Record<string, string> = {
            ...moved,
            'custom-progress-role': role,
            'custom-progress-project-id': projectId,
        };
        if (workstream) targetPatch['custom-progress-workstream'] = workstream;
        items.set(target.id, { ...(items.get(target.id) || {}), ...targetPatch });

        if (existingRole) {
            const clearPatch = Object.fromEntries(Object.keys(moved).map((name) => [name, '']));
            items.set(heading.id, { ...(items.get(heading.id) || {}), ...clearPatch });
        }
        evidence.push({ headingId: heading.id, targetId: target.id, role, ...(workstream ? { workstream } : {}) });
    }
    if (items.size === 0) return null;
    return {
        status: 'preview',
        reason: 'legacy_heading_projection_layout',
        requiresTimelineNode: true,
        action: 'block.set_attrs',
        items: [...items.entries()].map(([id, attrs]) => ({ id, attrs })),
        evidence,
    };
}

async function buildSnapshot(
    client: SiYuanClient,
    permMgr: PermissionManager,
    parsed: ReturnType<typeof ProjectSnapshotSchema.parse>,
) {
    const selection = await selectProject(client, parsed);
    if (selection.status !== 'matched' || !selection.record) {
        return {
            status: selection.status,
            reason: selection.reason,
            candidates: selection.candidates,
            nextStep: selection.status === 'ambiguous'
                ? '请选择一个项目名称后重试。'
                : '可使用 file(action="list_project_sources", query="<项目名称>") 查找候选。',
        };
    }
    const record = selection.record;
    if (!record.hubBlockId) {
        return { status: 'needs_initialization', reason: 'project_hub_missing', project: { projectId: record.projectId } };
    }
    const hubPermission = await ensurePermissionForDocumentId(client, permMgr, record.hubBlockId, 'read');
    if (hubPermission.denied) return { denied: hubPermission.denied };
    const hub = await blockRow(client, record.hubBlockId);
    const projectId = record.projectId;
    const escapedProjectId = escapeSqlString(projectId);
    const eventLimit = parsed.eventLimit ?? 10;
    const sessionLimit = parsed.sessionLimit ?? 20;
    const view = parsed.view ?? 'summary';

    const projectionRowsRaw = await searchApi.querySQL(client, `SELECT b.id, b.root_id, b.content, b.created, b.updated, b.hpath, b.type FROM blocks b WHERE EXISTS (SELECT 1 FROM attributes p WHERE p.block_id=b.id AND p.name='custom-progress-project-id' AND p.value='${escapedProjectId}') AND EXISTS (SELECT 1 FROM attributes r WHERE r.block_id=b.id AND r.name='custom-progress-role' AND r.value IN ('project-progress-page','project-profile','stage-ledger','artifact-index','project-state','workstream-state')) LIMIT 100`);
    const allEventRowsRaw = await searchApi.querySQL(client, `SELECT b.id, b.box, b.root_id, b.content, b.created, b.updated, b.hpath, b.type FROM blocks b WHERE (EXISTS (SELECT 1 FROM attributes r WHERE r.block_id=b.id AND r.name='custom-progress-role' AND r.value='event') AND EXISTS (SELECT 1 FROM attributes p WHERE p.block_id=b.id AND p.name='custom-progress-project-id' AND p.value='${escapedProjectId}')) OR (EXISTS (SELECT 1 FROM attributes k WHERE k.block_id=b.id AND k.name='custom-provenance-kind' AND k.value='event') AND EXISTS (SELECT 1 FROM attributes p WHERE p.block_id=b.id AND p.name='custom-provenance-project-id' AND p.value='${escapedProjectId}')) ORDER BY b.created DESC LIMIT 501`);

    const projectionRows = projectionRowsRaw.map(asBlockRow).filter((row): row is BlockRow => Boolean(row));
    const chronologyComplete = allEventRowsRaw.length <= 500;
    const allEventRows = allEventRowsRaw.slice(0, 500).map(asBlockRow).filter((row): row is BlockRow => Boolean(row));
    const readableEventRows = allEventRows.filter((row) => typeof row.box === 'string' && permMgr.canRead(row.box));
    const allEventIds = readableEventRows
        .map(rowId)
        .filter(Boolean);
    const allEventAttrs = await batchAttrs(client, allEventIds);
    const chronologicalEvents = readableEventRows
        .map((row) => normalizeSnapshotEvent(row, allEventAttrs[row.id] || {}))
        .sort(compareSnapshotEvents);
    const knowledgeEventIds = allEventIds.filter((id) => allEventAttrs[id]?.['custom-provenance-kind'] === 'event');
    const visibleEventRows = chronologicalEvents.slice(0, eventLimit);
    const detailIds = await readableIds(client, permMgr, [...projectionRows.map((row) => row.id), ...visibleEventRows.map((row) => row.id)]);
    const attrsById = await batchAttrs(client, detailIds);
    const artifactIndexRow = projectionRows.find((row) => attrsById[row.id]?.['custom-progress-role'] === 'artifact-index');
    const kramdownIds = view === 'full'
        ? detailIds
        : artifactIndexRow ? [artifactIndexRow.id] : [];
    const kramdownById = await batchKramdown(client, kramdownIds);

    const projections = projectionRows
        .filter((row) => detailIds.includes(row.id))
        .map((row) => ({
            ...row,
            role: attrsById[row.id]?.['custom-progress-role'],
            workstream: attrsById[row.id]?.['custom-progress-workstream'] || undefined,
            ...(view === 'full' ? {
                kramdown: attrsById[row.id]?.['custom-progress-role'] === 'project-progress-page'
                    ? ''
                    : clip(kramdownById[row.id], 8000),
            } : {}),
            attributes: filteredAttrs(attrsById[row.id] || {}),
        }));
    const events = visibleEventRows
        .filter((row) => detailIds.includes(row.id))
        .map((row) => ({
            ...row,
            ...(view === 'full' ? { kramdown: clip(kramdownById[row.id], 1600) } : {}),
            attributes: filteredAttrs(allEventAttrs[row.id] || attrsById[row.id] || {}),
        }));

    const sessionCandidates = await listProjectProvenanceSessions(client, projectId, 100);
    const readableSessionIds = new Set(await readableIds(client, permMgr, sessionCandidates.map((session) => session.blockId)));
    const readableSessions = sessionCandidates.filter((session) => readableSessionIds.has(session.blockId));
    const visibleSessions = readableSessions.slice(0, sessionLimit).map((session) => ({
        ...session,
        validation: parsed.validateSessions === false ? undefined : validateLocalAgentSession(session),
    }));
    const registeredSessionKeys = new Set(readableSessions.map((session) => `${session.provider}\u0000${session.sessionId}`));

    const refRows = knowledgeEventIds.length === 0 ? [] : await searchApi.querySQL(client, `SELECT DISTINCT block_id, def_block_id FROM refs WHERE block_id IN (${knowledgeEventIds.map((id) => `'${escapeSqlString(id)}'`).join(',')}) LIMIT 1000`);
    const knowledgeEventAttrs = Object.fromEntries(knowledgeEventIds.map((id) => [id, allEventAttrs[id] || {}]));
    const atomIds = [...new Set(knowledgeEventIds.flatMap((eventId) => {
        try {
            const parsedIds = JSON.parse(knowledgeEventAttrs[eventId]?.['custom-provenance-target-atom-ids'] || '[]');
            return Array.isArray(parsedIds) ? parsedIds.filter((id): id is string => typeof id === 'string') : [];
        } catch {
            return [];
        }
    }))];
    const readableAtomIds = await readableIds(client, permMgr, atomIds);
    const atomAttrs = await batchAttrs(client, readableAtomIds);
    const atomRows = readableAtomIds.length === 0 ? [] : await searchApi.querySQL(client, `SELECT id, content, updated, hpath FROM blocks WHERE id IN (${readableAtomIds.map((id) => `'${escapeSqlString(id)}'`).join(',')}) LIMIT 500`);
    const atomRowsById = new Map(atomRows.map((row) => [rowId(row), row as Record<string, string>]));
    const knowledgeProducts = readableAtomIds.map((id) => ({
        id,
        title: clip(atomRowsById.get(id)?.content, 320),
        hpath: atomRowsById.get(id)?.hpath || undefined,
        updated: atomRowsById.get(id)?.updated || undefined,
        name: atomAttrs[id]?.name || '',
        alias: atomAttrs[id]?.alias || '',
        verificationStatus: atomAttrs[id]?.['custom-verification-status'] || '',
        atomType: atomAttrs[id]?.['custom-atom-type'] || '',
    }));

    const progressPage = projections.filter((item) => item.role === 'project-progress-page');
    const repairPlan = await buildProjectionRepairPlan(client, projectId, progressPage[0]?.id, projections);
    const diagnostics: SnapshotDiagnostic[] = [];
    for (const role of SNAPSHOT_ROLES) {
        const matching = projections.filter((item) => item.role === role);
        const expectedMany = role === 'workstream-state';
        if (!expectedMany && matching.length === 0) diagnostics.push({ code: `${role}_missing`, severity: 'warning', status: 'missing', message: `缺少 ${role} 投影。` });
        if (!expectedMany && matching.length > 1) diagnostics.push({ code: `${role}_duplicate`, severity: 'error', status: 'invalid', message: `${role} 投影不唯一。` });
    }
    if (selection.bindingStatus && selection.bindingStatus !== 'available') diagnostics.push({ code: 'project_binding_stale', severity: 'warning', status: 'stale', message: `项目绑定状态为 ${selection.bindingStatus}。` });
    if (!chronologyComplete) diagnostics.push({ code: 'event_chronology_truncated', severity: 'error', status: 'invalid', message: '事件超过 500 条，时间线窗口不完整；不得据此更新状态投影。' });
    if (repairPlan) diagnostics.push({ code: 'legacy_projection_layout', severity: 'warning', status: 'stale', message: '检测到“标题块承载投影属性、内容块承载正文”的旧结构；可在建立文档时间线节点后执行 repairPlan。' });

    const latestEvent = chronologicalEvents[0];
    const projectState = projections.find((item) => item.role === 'project-state');
    if (chronologyComplete && latestEvent && projectState && projectState.attributes['custom-progress-last-event-id'] !== latestEvent.id) {
        diagnostics.push({ code: 'project_state_lagging', severity: 'warning', status: 'stale', blockId: projectState.id, message: '项目状态投影落后于事件流。' });
    }
    const workstreamHeads = new Map<string, SnapshotEvent>();
    for (const event of chronologicalEvents) {
        const workstream = event.attributes['custom-progress-workstream'];
        if (workstream && !workstreamHeads.has(workstream)) workstreamHeads.set(workstream, event);
    }
    for (const state of projections.filter((item) => item.role === 'workstream-state')) {
        const latestId = workstreamHeads.get(state.workstream || '')?.id;
        if (chronologyComplete && latestId && state.attributes['custom-progress-last-event-id'] !== latestId) diagnostics.push({ code: 'workstream_state_lagging', severity: 'warning', status: 'stale', blockId: state.id, message: `工作线 ${state.workstream || '未命名'} 的状态投影落后。` });
    }

    const refsByEvent = new Map<string, string[]>();
    for (const row of refRows) {
        if (!row || typeof row !== 'object') continue;
        const blockId = (row as Record<string, unknown>).block_id;
        const defId = (row as Record<string, unknown>).def_block_id;
        if (typeof blockId !== 'string' || typeof defId !== 'string') continue;
        refsByEvent.set(blockId, [...(refsByEvent.get(blockId) || []), defId]);
    }
    for (const eventId of allEventIds) {
        const attrs = allEventAttrs[eventId] || {};
        const isKnowledge = attrs['custom-provenance-kind'] === 'event';
        for (const key of eventSessionKeys(attrs)) {
            if (!registeredSessionKeys.has(key)) diagnostics.push({ code: 'orphan_event_session', severity: 'error', status: 'invalid', blockId: eventId, message: '事件引用的会话未在当前项目注册表中找到。' });
        }
        if (!isKnowledge) continue;
        const fixed = {
            'custom-progress-role': 'event',
            'custom-progress-schema': '1',
            'custom-progress-kind': 'knowledge',
        };
        const conflicting = Object.entries(fixed).some(([name, value]) => attrs[name] && attrs[name] !== value);
        const missing = [...Object.keys(fixed), 'custom-progress-workstream'].filter((name) => !attrs[name]);
        let targetIds: string[] = [];
        try {
            const rawTargetIds = JSON.parse(attrs['custom-provenance-target-atom-ids'] || '[]');
            targetIds = Array.isArray(rawTargetIds) ? rawTargetIds.filter((id): id is string => typeof id === 'string') : [];
        } catch {
            targetIds = [];
        }
        const eventRefs = refsByEvent.get(eventId) || [];
        const hasRefs = targetIds.length > 0 && targetIds.every((id) => eventRefs.includes(id));
        const sessionsValid = eventSessionKeys(attrs).every((key) => registeredSessionKeys.has(key));
        if (conflicting || !hasRefs || !sessionsValid) diagnostics.push({ code: 'knowledge_event_invalid', severity: 'error', status: 'invalid', blockId: eventId, message: '知识事件存在冲突属性、缺失引用或孤儿会话。' });
        else if (missing.length > 0) diagnostics.push({ code: 'knowledge_event_historical', severity: 'info', status: 'historical_repairable', blockId: eventId, message: `历史知识事件缺少可重放补齐的属性：${missing.join(', ')}。` });
    }

    const names = new Map<string, string[]>();
    for (const atom of knowledgeProducts) {
        const normalized = normalizeProjectName(atom.name);
        if (!normalized) continue;
        names.set(normalized, [...(names.get(normalized) || []), atom.id]);
    }
    for (const [name, ids] of names) {
        if (ids.length > 1) diagnostics.push({ code: 'duplicate_atom_name', severity: 'error', status: 'invalid', message: `项目知识产物存在重复 name：${name}。` });
    }

    const artifactIndex = projections.find((item) => item.role === 'artifact-index');
    const artifactEntries = parseArtifactPaths(artifactIndex ? kramdownById[artifactIndex.id] || '' : '', record.manifest?.entries || []);
    const artifacts = [];
    for (const entry of artifactEntries.slice(0, 100)) {
        const resolved = await resolveProjectSource(client, { projectId, relativePath: entry.relativePath });
        artifacts.push({ ...entry, resolvedPath: resolved.resolvedPath, exists: resolved.exists, pathType: resolved.pathType, revisionVerified: resolved.revisionVerified });
        if (!resolved.exists) diagnostics.push({ code: 'artifact_missing', severity: 'warning', status: 'missing', message: `权威产物不存在：${entry.relativePath}。` });
    }

    return {
        view,
        status: progressPage.length === 0 ? 'needs_initialization' : 'ready',
        project: {
            projectId,
            name: projectDisplayName(hub, projectId),
            hubBlockId: record.hubBlockId,
            sourceKind: record.sourceKind,
            bindingStatus: selection.bindingStatus,
            matchType: selection.matchType,
        },
        progressPage: progressPage[0] ? {
            id: progressPage[0].id,
            content: progressPage[0].content,
            hpath: progressPage[0].hpath,
            created: progressPage[0].created,
            updated: progressPage[0].updated,
            attributes: progressPage[0].attributes,
        } : null,
        projections: {
            projectProfile: projections.find((item) => item.role === 'project-profile') || null,
            stageLedger: projections.find((item) => item.role === 'stage-ledger') || null,
            artifactIndex: artifactIndex || null,
            projectState: projectState || null,
            workstreams: projections.filter((item) => item.role === 'workstream-state'),
        },
        events,
        sessions: visibleSessions,
        knowledgeProducts,
        artifacts,
        diagnostics,
        repairPlan,
        chronology: {
            complete: chronologyComplete,
            scannedCount: allEventIds.length,
            projectHead: chronologyComplete ? eventHead(latestEvent) : null,
            workstreamHeads: chronologyComplete
                ? [...workstreamHeads.entries()].map(([workstream, event]) => ({ workstream, ...eventHead(event) }))
                : [],
        },
        localProbeBaseline: {
            latestEventAt: chronologyComplete ? latestEvent?.occurredAt || null : null,
            latestHandoffAt: chronologyComplete ? chronologicalEvents.find((event) => event.attributes['custom-progress-kind'] === 'handoff')?.occurredAt || null : null,
            weakBaseline: !chronologyComplete || !chronologicalEvents.some((event) => event.attributes['custom-progress-kind'] === 'handoff'),
            tierA: (record.manifest?.entries || []).filter((entry) => entry.tier === 'A').map((entry) => ({
                relativePath: entry.relativePath,
                size: entry.size,
                modifiedAt: entry.modifiedAt,
                hash: entry.hash,
                sourceRevision: entry.sourceRevision,
            })),
        },
        pagination: {
            events: { limit: eventLimit, hasMore: chronologicalEvents.length > eventLimit || !chronologyComplete },
            sessions: { limit: sessionLimit, hasMore: readableSessions.length > sessionLimit },
            artifacts: { limit: 100, hasMore: artifactEntries.length > 100 },
            diagnostics: { limit: 500, hasMore: !chronologyComplete },
        },
        localPathsIncluded: artifacts.length > 0,
        localPathDisclosure: 'Only artifact-index entries are resolved; workspaceRoot and arbitrary relative paths are not returned.',
    };
}

export const PROJECT_VARIANTS: ActionVariant<ProjectAction>[] = [
    createZodActionVariant('snapshot', ProjectSnapshotSchema, 'Read one bounded project snapshot; summary is the default, while full adds bounded projection and event Kramdown.'),
];

const projectTool = defineTool<ProjectAction>({
    name: PROJECT_TOOL_NAME,
    description: '🧭 读取跨 Agent 项目共享记忆的结构化快照与服务端诊断。',
    variants: PROJECT_VARIANTS,
    actionSchema: ProjectActionSchema,
    aggregateOptions: {
        guidance: [
            'snapshot 是 Agent 恢复项目状态的唯一机器读取入口；query_embed 仅供人类界面展示。',
            'cwd、projectId、projectName 三选一；项目名只做精确匹配，失败后由 Skill 使用 file.list_project_sources 展示候选。',
            '返回的绝对路径仅来自已登记 artifact-index，不包含 workspaceRoot，也不支持任意路径探测。',
        ],
        actionHints: { snapshot: '读取有界项目快照；默认 summary，按需用 full 读取正文；只读返回修复预览，不自动写入。' },
    },
    handlers: {
        snapshot: async ({ client, rawArgs, permMgr }) => {
            const parsed = ProjectSnapshotSchema.parse(rawArgs);
            const result = await buildSnapshot(client, permMgr, parsed);
            if ('denied' in result && result.denied) return result.denied as ToolResult;
            return createJsonResult({ action: parsed.action, ...result });
        },
    },
});

export function listProjectTools(config: CategoryToolConfig<ProjectAction>) {
    return projectTool.listTools(config);
}

export async function callProjectTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<ProjectAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    return projectTool.callTool(client, args, config, permMgr);
}

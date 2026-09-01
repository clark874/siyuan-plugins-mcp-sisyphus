import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { SiYuanClient } from '../api/client';
import * as blockApi from '../api/block';
import * as searchApi from '../api/search';
import { hashWriteState } from './write-safety-hash';

export const PROVENANCE_PROVIDERS = ['codex', 'zcode', 'claude-code', 'hermes', 'kimi', 'cursor', 'other'] as const;
export const PROVENANCE_CAPTURE_METHODS = ['environment', 'client_context', 'explicit', 'inferred_latest_rollout'] as const;
export type ProvenanceProvider = typeof PROVENANCE_PROVIDERS[number];
export type ProvenanceCaptureMethod = typeof PROVENANCE_CAPTURE_METHODS[number];
export type LinkCapability = 'native' | 'launcher' | 'resume_command' | 'unavailable';

export interface SessionIdentity {
    provider: ProvenanceProvider;
    sessionId: string;
    hostAlias?: string;
    captureMethod: ProvenanceCaptureMethod;
}

export interface SessionLink {
    provider: ProvenanceProvider;
    sessionId: string;
    hostAlias: string;
    linkCapability: LinkCapability;
    preferredUrl?: string;
    nativeUrl?: string;
    launcherUrl: string;
    resumeCommand?: string;
}

export interface SessionRecord extends SessionLink {
    captureMethod: ProvenanceCaptureMethod;
    blockId: string;
    projectId: string;
    firstSeenAt: string;
    lastSeenAt: string;
}

export interface EventRecord {
    blockId: string;
    projectId: string;
    eventId: string;
    operation: string;
    occurredAt: string;
    sourceSession: SessionRecord;
    compileSession: SessionRecord;
    targetAtomIds: string[];
    automationId?: string;
    replayed?: boolean;
}

const SESSION_CACHE = new Map<string, string>();
const EVENT_CACHE = new Map<string, string>();
const CACHE_LIMIT = 500;

function boundedSet(map: Map<string, string>, key: string, value: string): void {
    if (map.size >= CACHE_LIMIT) {
        const first = map.keys().next().value;
        if (first) map.delete(first);
    }
    map.set(key, value);
}

function sql(value: string): string {
    return value.replace(/\0/g, '').replace(/'/g, "''");
}

function nowIso(): string {
    return new Date().toISOString();
}

function normalizeHostAlias(value?: string): string {
    const normalized = value?.trim() || 'local';
    if (!/^[\w.-]{1,64}$/.test(normalized)) throw new Error('hostAlias 只能包含字母、数字、下划线、句点和连字符。');
    return normalized;
}

function sessionUniqueValue(session: Pick<SessionIdentity, 'provider' | 'sessionId' | 'hostAlias'>): string {
    return `v1:${session.provider}:${encodeURIComponent(normalizeHostAlias(session.hostAlias))}:${encodeURIComponent(session.sessionId)}`;
}

function sessionKey(projectId: string, session: SessionIdentity): string {
    return `${encodeURIComponent(projectId)}:${sessionUniqueValue(session)}`;
}

function eventKey(projectId: string, eventId: string): string {
    return `${projectId}\u001f${eventId}`;
}

function shellQuote(value: string): string {
    return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function resolveAgentSessionLink(session: Pick<SessionIdentity, 'provider' | 'sessionId' | 'hostAlias'>): SessionLink {
    const hostAlias = normalizeHostAlias(session.hostAlias);
    const query = new URLSearchParams({
        action: 'open-agent-session',
        provider: session.provider,
        sessionId: session.sessionId,
        hostAlias,
    });
    const launcherUrl = `siyuan://plugins/siyuan-plugins-mcp-sisyphus?${query.toString()}`;
    if (session.provider === 'codex') {
        const nativeUrl = `codex://threads/${encodeURIComponent(session.sessionId)}`;
        return { ...session, hostAlias, linkCapability: 'native', preferredUrl: nativeUrl, nativeUrl, launcherUrl, resumeCommand: `codex resume ${shellQuote(session.sessionId)}` };
    }
    if (session.provider === 'zcode') {
        return { ...session, hostAlias, linkCapability: 'resume_command', launcherUrl, resumeCommand: `zcode --resume ${shellQuote(session.sessionId)}` };
    }
    if (session.provider === 'claude-code') {
        return { ...session, hostAlias, linkCapability: 'resume_command', launcherUrl, resumeCommand: `claude --resume ${shellQuote(session.sessionId)}` };
    }
    if (session.provider === 'hermes') {
        // Official CLI flag is `hermes --resume <id>`. The `hermes resume` subcommand lifts emergency pause and is not a session opener.
        // Hermes.app currently has no CFBundleURLTypes; do not invent hermes:// or @session: deep links.
        return { ...session, hostAlias, linkCapability: 'resume_command', launcherUrl, resumeCommand: `hermes --resume ${shellQuote(session.sessionId)}` };
    }
    return { ...session, hostAlias, linkCapability: 'unavailable', launcherUrl };
}

function findNamedFile(root: string, needle: string, depth = 5): boolean {
    if (!fs.existsSync(root)) return false;
    const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
    let visited = 0;
    while (queue.length > 0 && visited < 5000) {
        const item = queue.shift()!;
        visited += 1;
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(item.dir, { withFileTypes: true }); } catch { continue; }
        for (const entry of entries) {
            if (entry.name.includes(needle)) return true;
            if (entry.isDirectory() && item.depth < depth) queue.push({ dir: path.join(item.dir, entry.name), depth: item.depth + 1 });
        }
    }
    return false;
}

export function validateLocalAgentSession(session: Pick<SessionIdentity, 'provider' | 'sessionId' | 'hostAlias'>): {
    status: 'found' | 'missing' | 'unsupported' | 'remote';
    checkedBy: string;
} {
    const hostAlias = normalizeHostAlias(session.hostAlias);
    if (hostAlias !== 'local') return { status: 'remote', checkedBy: 'host_alias' };
    if (session.provider === 'codex') {
        return { status: findNamedFile(path.join(os.homedir(), '.codex', 'sessions'), session.sessionId) ? 'found' : 'missing', checkedBy: 'codex_rollout_filename' };
    }
    if (session.provider === 'zcode') {
        return { status: findNamedFile(path.join(os.homedir(), '.zcode', 'cli', 'rollout'), session.sessionId, 2) ? 'found' : 'missing', checkedBy: 'zcode_rollout_filename' };
    }
    if (session.provider === 'claude-code') {
        return { status: findNamedFile(path.join(os.homedir(), '.claude', 'projects'), session.sessionId) ? 'found' : 'missing', checkedBy: 'claude_project_filename' };
    }
    if (session.provider === 'hermes') {
        return { status: hermesSessionExists(session.sessionId) ? 'found' : 'missing', checkedBy: 'hermes_state_db' };
    }
    return { status: 'unsupported', checkedBy: 'provider_adapter' };
}

export function defaultHermesHome(): string {
    return path.join(os.homedir(), '.hermes');
}

export function hermesStateDatabasePaths(homeDir = defaultHermesHome()): string[] {
    const paths = [path.join(homeDir, 'state.db')];
    const profilesDir = path.join(homeDir, 'profiles');
    if (!fs.existsSync(profilesDir)) return paths.filter((candidate) => fs.existsSync(candidate));
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(profilesDir, { withFileTypes: true }); } catch { return paths.filter((candidate) => fs.existsSync(candidate)); }
    for (const entry of entries) {
        if (entry.isDirectory()) paths.push(path.join(profilesDir, entry.name, 'state.db'));
    }
    return paths.filter((candidate) => fs.existsSync(candidate));
}

export function hermesSessionExists(sessionId: string, homeDir = defaultHermesHome()): boolean {
    if (!sessionId || sessionId.length > 256 || /[\u0000-\u001f]/.test(sessionId)) return false;
    const needle = Buffer.from(sessionId);
    for (const dbPath of hermesStateDatabasePaths(homeDir)) {
        try {
            if (fs.readFileSync(dbPath).includes(needle)) return true;
        } catch { /* skip unreadable profile databases */ }
    }
    return false;
}

function extractCreatedId(result: unknown): string {
    const operationBatch = Array.isArray(result) ? result[0] : result;
    if (!operationBatch || typeof operationBatch !== 'object') throw new Error('思源未返回新建块信息。');
    const operations = (operationBatch as { doOperations?: Array<{ id?: string }> }).doOperations;
    const id = operations?.find((item) => typeof item.id === 'string')?.id;
    if (!id) throw new Error('思源未返回新建块 ID。');
    return id;
}

async function verifyAttrs(client: SiYuanClient, id: string, expected: Record<string, string>): Promise<Record<string, string>> {
    const attrs = await blockApi.getBlockAttrs(client, id);
    for (const [key, value] of Object.entries(expected)) {
        if (attrs[key] !== value) throw new Error(`块 ${id} 的属性 ${key} 写入后回读不一致。`);
    }
    return attrs;
}

async function findRecordByAttrs(client: SiYuanClient, kind: 'session' | 'event', projectId: string, uniqueName: string, uniqueValue: string, cacheKey: string, cache: Map<string, string>): Promise<string | null> {
    const cached = cache.get(cacheKey);
    if (cached) {
        try {
            const attrs = await blockApi.getBlockAttrs(client, cached);
            if (attrs['custom-provenance-kind'] === kind && attrs[uniqueName] === uniqueValue) return cached;
        } catch { cache.delete(cacheKey); }
    }
    const rows = await searchApi.querySQL(client, `SELECT b.id FROM blocks b JOIN attributes k ON k.block_id=b.id AND k.name='custom-provenance-kind' AND k.value='${kind}' JOIN attributes p ON p.block_id=b.id AND p.name='custom-provenance-project-id' AND p.value='${sql(projectId)}' JOIN attributes u ON u.block_id=b.id AND u.name='${uniqueName}' AND u.value='${sql(uniqueValue)}' LIMIT 1`);
    const id = rows[0] && typeof rows[0] === 'object' && typeof (rows[0] as Record<string, unknown>).id === 'string' ? (rows[0] as Record<string, string>).id : null;
    if (id) boundedSet(cache, cacheKey, id);
    return id;
}

export async function registerProvenanceSession(client: SiYuanClient, projectBlockId: string, projectId: string, session: SessionIdentity, occurredAt = nowIso()): Promise<SessionRecord> {
    const hostAlias = normalizeHostAlias(session.hostAlias);
    const key = sessionKey(projectId, { ...session, hostAlias });
    const unique = sessionUniqueValue({ ...session, hostAlias });
    let blockId = await findRecordByAttrs(client, 'session', projectId, 'custom-provenance-session-key', unique, key, SESSION_CACHE);
    const link = resolveAgentSessionLink({ ...session, hostAlias });
    let firstSeenAt = occurredAt;
    if (blockId) {
        const current = await blockApi.getBlockAttrs(client, blockId);
        firstSeenAt = current['custom-provenance-first-seen-at'] || occurredAt;
    } else {
        const label = `${session.provider} · ${session.sessionId.slice(0, 12)}`;
        const markdown = link.preferredUrl
            ? `Agent 会话：[${label}](${link.preferredUrl})`
            : link.resumeCommand
                ? `Agent 会话：${label}；恢复命令：\`${link.resumeCommand}\``
                : `Agent 会话：${label}；当前没有可用的打开适配器。`;
        blockId = extractCreatedId(await blockApi.appendBlock(client, 'markdown', markdown, projectBlockId));
        boundedSet(SESSION_CACHE, key, blockId);
    }
    const attrs = {
        'custom-provenance-kind': 'session',
        'custom-provenance-schema': '1',
        'custom-provenance-project-id': projectId,
        'custom-provenance-session-key': unique,
        'custom-provenance-provider': session.provider,
        'custom-provenance-session-id': session.sessionId,
        'custom-provenance-host-alias': hostAlias,
        'custom-provenance-capture-method': session.captureMethod,
        'custom-provenance-link-capability': link.linkCapability,
        'custom-provenance-first-seen-at': firstSeenAt,
        'custom-provenance-last-seen-at': occurredAt,
    };
    await blockApi.setBlockAttrs(client, blockId, attrs);
    await verifyAttrs(client, blockId, attrs);
    return { ...session, ...link, hostAlias, blockId, projectId, firstSeenAt, lastSeenAt: occurredAt };
}

function sessionFromAttrs(blockId: string, attrs: Record<string, string>): SessionRecord | null {
    const provider = attrs['custom-provenance-provider'] as ProvenanceProvider;
    const sessionId = attrs['custom-provenance-session-id'];
    if (!PROVENANCE_PROVIDERS.includes(provider) || !sessionId) return null;
    const identity: SessionIdentity = {
        provider,
        sessionId,
        hostAlias: attrs['custom-provenance-host-alias'] || 'local',
        captureMethod: (attrs['custom-provenance-capture-method'] as ProvenanceCaptureMethod) || 'explicit',
    };
    return {
        ...identity,
        ...resolveAgentSessionLink(identity),
        blockId,
        projectId: attrs['custom-provenance-project-id'] || '',
        firstSeenAt: attrs['custom-provenance-first-seen-at'] || '',
        lastSeenAt: attrs['custom-provenance-last-seen-at'] || '',
    };
}

export async function listProjectProvenanceSessions(client: SiYuanClient, projectId: string, limit = 100): Promise<SessionRecord[]> {
    const rows = await searchApi.querySQL(client, `SELECT DISTINCT b.id FROM blocks b JOIN attributes k ON k.block_id=b.id AND k.name='custom-provenance-kind' AND k.value='session' JOIN attributes p ON p.block_id=b.id AND p.name='custom-provenance-project-id' AND p.value='${sql(projectId)}' ORDER BY b.updated DESC LIMIT ${Math.max(1, Math.min(500, limit))}`);
    const records: SessionRecord[] = [];
    for (const row of rows) {
        const id = row && typeof row === 'object' && typeof (row as Record<string, unknown>).id === 'string' ? (row as Record<string, string>).id : '';
        if (!id) continue;
        const record = sessionFromAttrs(id, await blockApi.getBlockAttrs(client, id));
        if (record) records.push(record);
    }
    return records;
}

async function readRegisteredSession(client: SiYuanClient, projectId: string, session: SessionIdentity): Promise<SessionRecord> {
    const key = sessionKey(projectId, session);
    const unique = sessionUniqueValue(session);
    const id = await findRecordByAttrs(client, 'session', projectId, 'custom-provenance-session-key', unique, key, SESSION_CACHE);
    if (!id) throw new Error(`溯源事件引用的 ${session.provider} 会话记录缺失。`);
    const record = sessionFromAttrs(id, await blockApi.getBlockAttrs(client, id));
    if (!record) throw new Error(`溯源事件引用的 ${session.provider} 会话记录无效。`);
    return record;
}

function assertEventReplayCompatible(existing: Record<string, string>, input: {
    projectId: string;
    eventId: string;
    operation: string;
    occurredAt?: string;
    sourceSession: SessionIdentity;
    compileSession?: SessionIdentity;
    targetAtomIds: string[];
    automationId?: string;
}): void {
    const compile = input.compileSession || input.sourceSession;
    const expected: Record<string, string> = {
        'custom-provenance-project-id': input.projectId,
        'custom-provenance-event-id': input.eventId,
        'custom-provenance-operation': input.operation,
        'custom-provenance-source-provider': input.sourceSession.provider,
        'custom-provenance-source-session': input.sourceSession.sessionId,
        'custom-provenance-source-host-alias': normalizeHostAlias(input.sourceSession.hostAlias),
        'custom-provenance-source-capture-method': input.sourceSession.captureMethod,
        'custom-provenance-compile-provider': compile.provider,
        'custom-provenance-compile-session': compile.sessionId,
        'custom-provenance-compile-host-alias': normalizeHostAlias(compile.hostAlias),
        'custom-provenance-compile-capture-method': compile.captureMethod,
        'custom-provenance-target-atom-ids': JSON.stringify(input.targetAtomIds),
        'custom-automation-id': input.automationId || '',
    };
    if (input.occurredAt) expected['custom-provenance-occurred-at'] = input.occurredAt;
    for (const [name, value] of Object.entries(expected)) {
        if ((existing[name] || '') !== value) throw new Error(`eventId ${input.eventId} 已用于不同的知识化事件，冲突字段：${name}。`);
    }
}

function buildAtomSummaryAttrs(input: {
    projectId: string;
    eventId: string;
    sourceSession: Pick<SessionRecord, 'provider' | 'sessionId'>;
    compileSession: Pick<SessionRecord, 'provider' | 'sessionId'>;
    occurredAt: string;
    automationId?: string;
}): Record<string, string> {
    const attrs: Record<string, string> = {
        'custom-source-session': input.sourceSession.sessionId,
        'custom-source-provider': input.sourceSession.provider,
        'custom-compile-session': input.compileSession.sessionId,
        'custom-compile-provider': input.compileSession.provider,
        'custom-provenance-event': input.eventId,
        'custom-provenance-project-id': input.projectId,
        'custom-provenance-updated-at': input.occurredAt,
    };
    if (input.automationId) attrs['custom-automation-id'] = input.automationId;
    return attrs;
}

export async function recordProvenanceEvent(client: SiYuanClient, input: {
    projectBlockId: string;
    projectId: string;
    eventId: string;
    operation: string;
    occurredAt?: string;
    sourceSession: SessionIdentity;
    compileSession?: SessionIdentity;
    targetAtomIds: string[];
    automationId?: string;
}): Promise<EventRecord> {
    const key = eventKey(input.projectId, input.eventId);
    let blockId = await findRecordByAttrs(client, 'event', input.projectId, 'custom-provenance-event-id', input.eventId, key, EVENT_CACHE);
    const replayed = Boolean(blockId);
    if (blockId) {
        const existing = await blockApi.getBlockAttrs(client, blockId);
        assertEventReplayCompatible(existing, input);
        const sourceSession = await readRegisteredSession(client, input.projectId, input.sourceSession);
        const compileSession = await readRegisteredSession(client, input.projectId, input.compileSession || input.sourceSession);
        const occurredAt = existing['custom-provenance-occurred-at'] || input.occurredAt || '';
        const atomAttrs = buildAtomSummaryAttrs({
            projectId: input.projectId,
            eventId: input.eventId,
            sourceSession,
            compileSession,
            occurredAt,
            automationId: input.automationId,
        });
        const repairs: Array<{ id: string; attrs: Record<string, string> }> = [];
        for (const atomId of input.targetAtomIds) {
            const current = await blockApi.getBlockAttrs(client, atomId);
            const currentEvent = current['custom-provenance-event'];
            if (currentEvent && currentEvent !== input.eventId) continue;
            if (Object.entries(atomAttrs).some(([name, value]) => current[name] !== value)) repairs.push({ id: atomId, attrs: atomAttrs });
        }
        if (repairs.length > 0) {
            await blockApi.batchSetBlockAttrs(client, repairs);
            for (const repair of repairs) await verifyAttrs(client, repair.id, atomAttrs);
        }
        return {
            blockId,
            projectId: input.projectId,
            eventId: input.eventId,
            operation: input.operation,
            occurredAt,
            sourceSession,
            compileSession,
            targetAtomIds: input.targetAtomIds,
            automationId: input.automationId,
            replayed: true,
        };
    }
    const occurredAt = input.occurredAt || nowIso();
    const sourceSession = await registerProvenanceSession(client, input.projectBlockId, input.projectId, input.sourceSession, occurredAt);
    const compileSession = await registerProvenanceSession(client, input.projectBlockId, input.projectId, input.compileSession || input.sourceSession, occurredAt);
    if (!blockId) {
        const targetRefs = input.targetAtomIds.map((id) => `((` + `${id} "知识原子"` + `))`).join('、');
        const compileRef = compileSession.blockId === sourceSession.blockId ? '' : `；编译 ((` + `${compileSession.blockId} "${compileSession.provider} 会话"` + `))`;
        const markdown = `知识化事件：${input.operation}；来源 ((` + `${sourceSession.blockId} "${sourceSession.provider} 会话"` + `))${compileRef}；目标 ${targetRefs}`;
        blockId = extractCreatedId(await blockApi.appendBlock(client, 'markdown', markdown, input.projectBlockId));
        boundedSet(EVENT_CACHE, key, blockId);
    }
    const attrs: Record<string, string> = {
        'custom-provenance-kind': 'event',
        'custom-provenance-schema': '1',
        'custom-provenance-project-id': input.projectId,
        'custom-provenance-event-id': input.eventId,
        'custom-provenance-operation': input.operation,
        'custom-provenance-occurred-at': occurredAt,
        'custom-provenance-source-provider': sourceSession.provider,
        'custom-provenance-source-session': sourceSession.sessionId,
        'custom-provenance-source-host-alias': sourceSession.hostAlias,
        'custom-provenance-source-capture-method': sourceSession.captureMethod,
        'custom-provenance-compile-provider': compileSession.provider,
        'custom-provenance-compile-session': compileSession.sessionId,
        'custom-provenance-compile-host-alias': compileSession.hostAlias,
        'custom-provenance-compile-capture-method': compileSession.captureMethod,
        'custom-provenance-target-atom-ids': JSON.stringify(input.targetAtomIds),
    };
    if (input.automationId) attrs['custom-automation-id'] = input.automationId;
    await blockApi.setBlockAttrs(client, blockId, attrs);
    await verifyAttrs(client, blockId, attrs);
    const atomAttrs = buildAtomSummaryAttrs({
        projectId: input.projectId,
        eventId: input.eventId,
        sourceSession,
        compileSession,
        occurredAt,
        automationId: input.automationId,
    });
    await blockApi.batchSetBlockAttrs(client, input.targetAtomIds.map((id) => ({ id, attrs: atomAttrs })));
    for (const atomId of input.targetAtomIds) await verifyAttrs(client, atomId, atomAttrs);
    return { blockId, projectId: input.projectId, eventId: input.eventId, operation: input.operation, occurredAt, sourceSession, compileSession, targetAtomIds: input.targetAtomIds, automationId: input.automationId, replayed };
}

export async function listAtomProvenanceEvents(client: SiYuanClient, atomId: string, limit = 100): Promise<Array<Record<string, unknown>>> {
    const rows = await searchApi.querySQL(client, `SELECT DISTINCT b.id FROM refs r JOIN blocks b ON b.id=r.block_id JOIN attributes k ON k.block_id=b.id AND k.name='custom-provenance-kind' AND k.value='event' WHERE r.def_block_id='${sql(atomId)}' ORDER BY b.created DESC LIMIT ${Math.max(1, Math.min(500, limit))}`);
    const events: Array<Record<string, unknown>> = [];
    for (const row of rows) {
        const id = row && typeof row === 'object' && typeof (row as Record<string, unknown>).id === 'string' ? (row as Record<string, string>).id : '';
        if (!id) continue;
        const attrs = await blockApi.getBlockAttrs(client, id);
        events.push({ blockId: id, projectId: attrs['custom-provenance-project-id'], eventId: attrs['custom-provenance-event-id'], operation: attrs['custom-provenance-operation'], occurredAt: attrs['custom-provenance-occurred-at'], sourceProvider: attrs['custom-provenance-source-provider'], sourceSessionId: attrs['custom-provenance-source-session'], compileProvider: attrs['custom-provenance-compile-provider'], compileSessionId: attrs['custom-provenance-compile-session'], targetAtomIds: JSON.parse(attrs['custom-provenance-target-atom-ids'] || '[]'), automationId: attrs['custom-automation-id'] || undefined });
    }
    return events;
}

export async function readProvenanceWriteState(client: SiYuanClient, action: string, args: Record<string, unknown>): Promise<{ hash: string; targetIds: string[]; summary: Record<string, unknown> }> {
    const projectId = typeof args.projectId === 'string' ? args.projectId : '';
    let record: unknown = { missing: true };
    let targetIds: string[] = [];
    let exists = false;
    if (action === 'register_session' && args.session && typeof args.session === 'object') {
        const session = args.session as SessionIdentity;
        const key = sessionKey(projectId, session);
        const unique = sessionUniqueValue(session);
        const id = await findRecordByAttrs(client, 'session', projectId, 'custom-provenance-session-key', unique, key, SESSION_CACHE);
        if (id) { record = await blockApi.getBlockAttrs(client, id); targetIds = [id]; exists = true; }
    } else if (action === 'record_event' && typeof args.eventId === 'string') {
        const id = await findRecordByAttrs(client, 'event', projectId, 'custom-provenance-event-id', args.eventId, eventKey(projectId, args.eventId), EVENT_CACHE);
        const event = id ? await blockApi.getBlockAttrs(client, id) : { missing: true };
        if (id) { targetIds = [id]; exists = true; }
        const atomIds = Array.isArray(args.targetAtomIds) ? args.targetAtomIds.filter((atomId): atomId is string => typeof atomId === 'string') : [];
        targetIds.push(...atomIds);
        const atoms: Record<string, Record<string, string>> = {};
        for (const atomId of atomIds) atoms[atomId] = await blockApi.getBlockAttrs(client, atomId);
        record = { event, atoms };
    }
    return { hash: hashWriteState(record), targetIds, summary: { targetCount: targetIds.length, exists } };
}

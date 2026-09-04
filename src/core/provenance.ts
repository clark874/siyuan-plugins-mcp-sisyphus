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
    workstream: string;
    occurredAt: string;
    sourceSession: SessionRecord;
    compileSession: SessionRecord;
    targetAtomIds: string[];
    automationId?: string;
    replayed?: boolean;
    transactionState: 'committed';
    attributes: Record<string, string>;
    verification: {
        status: 'verified' | 'committed_but_verification_deferred';
        eventAttributes: true;
        targetAtomAttributes: true;
        referencedSessionBlockIds: string[];
        referencedAtomIds: string[];
        verifiedReferences: string[];
        missingReferenceIds: string[];
        referenceAttempts: number;
        atomSummaryUpdates: Array<{
            atomId: string;
            disposition: 'advanced' | 'repaired' | 'preserved_newer' | 'preserved_equal_time' | 'preserved_unparseable_time';
        }>;
    };
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

function isoTimeValue(value: string): number | null {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
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

export interface DiscoveredSession {
    sessionId: string;
    fileName: string;
    filePath: string;
    modifiedAt: string;
    ageSeconds: number;
    sizeBytes: number;
    recentlyActive: boolean;
}

export interface SessionDiscoveryResult {
    provider: ProvenanceProvider;
    root: string;
    rootExists: boolean;
    candidates: DiscoveredSession[];
    notice: string;
}

export const SESSION_DISCOVERY_NOTICE = '发现接口只列出本机候选会话，不推断哪一条属于当前调用方。请结合本会话发起时间与 recentlyActive 标记选定真实 sessionId；无法排除并发会话时按 inferred_latest_rollout 登记并保留误配警告。禁止用自拟描述性字符串充当 sessionId。';

function collectJsonlFiles(root: string, maxDepth: number): Array<{ fileName: string; filePath: string }> {
    const found: Array<{ fileName: string; filePath: string }> = [];
    if (!fs.existsSync(root)) return found;
    const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
    let visited = 0;
    while (queue.length > 0 && visited < 5000) {
        const item = queue.shift()!;
        visited += 1;
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(item.dir, { withFileTypes: true }); } catch { continue; }
        for (const entry of entries) {
            const fullPath = path.join(item.dir, entry.name);
            if (entry.isFile() && entry.name.endsWith('.jsonl')) found.push({ fileName: entry.name, filePath: fullPath });
            else if (entry.isDirectory() && item.depth < maxDepth) queue.push({ dir: fullPath, depth: item.depth + 1 });
        }
    }
    return found;
}

function sessionIdFromFileName(provider: ProvenanceProvider, fileName: string): string | null {
    const base = fileName.replace(/\.jsonl$/, '');
    if (provider === 'zcode') return base.startsWith('model-io-') ? base.slice('model-io-'.length) : base;
    if (provider === 'codex') {
        // rollout-2026-09-02T15-43-12-<uuid>.jsonl → <uuid>
        const match = base.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        return match ? match[0] : base;
    }
    return base;
}

export function discoverLocalAgentSessions(provider: ProvenanceProvider, options: { limit?: number; activeWindowSeconds?: number; homeDir?: string } = {}): SessionDiscoveryResult {
    const limit = Math.max(1, Math.min(50, options.limit ?? 10));
    const activeWindowSeconds = Math.max(1, Math.min(3600, options.activeWindowSeconds ?? 120));
    const home = options.homeDir ?? os.homedir();
    const roots: Partial<Record<ProvenanceProvider, { root: string; depth: number }>> = {
        zcode: { root: path.join(home, '.zcode', 'cli', 'rollout'), depth: 1 },
        codex: { root: path.join(home, '.codex', 'sessions'), depth: 5 },
        'claude-code': { root: path.join(home, '.claude', 'projects'), depth: 2 },
    };
    const config = roots[provider];
    const root = config?.root ?? '';
    if (!config) {
        return { provider, root, rootExists: false, candidates: [], notice: `provider ${provider} 暂无本机会话目录适配；仅支持 zcode、codex、claude-code 的本地发现。${SESSION_DISCOVERY_NOTICE}` };
    }
    const files = collectJsonlFiles(config.root, config.depth);
    const now = Date.now();
    const candidates: DiscoveredSession[] = [];
    for (const file of files) {
        const sessionId = sessionIdFromFileName(provider, file.fileName);
        if (!sessionId) continue;
        let stat: fs.Stats;
        try { stat = fs.statSync(file.filePath); } catch { continue; }
        const ageSeconds = Math.max(0, Math.round((now - stat.mtimeMs) / 1000));
        candidates.push({
            sessionId,
            fileName: file.fileName,
            filePath: file.filePath,
            modifiedAt: stat.mtime.toISOString(),
            ageSeconds,
            sizeBytes: stat.size,
            recentlyActive: ageSeconds <= activeWindowSeconds,
        });
    }
    candidates.sort((a, b) => a.ageSeconds - b.ageSeconds);
    return {
        provider,
        root: config.root,
        rootExists: fs.existsSync(config.root),
        candidates: candidates.slice(0, limit),
        notice: SESSION_DISCOVERY_NOTICE,
    };
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

async function verifyEventReferences(client: SiYuanClient, eventBlockId: string, expectedIds: string[]): Promise<{
    status: 'verified' | 'deferred';
    verifiedReferences: string[];
    missingReferenceIds: string[];
    attempts: number;
}> {
    const expected = [...new Set(expectedIds)];
    let actual = new Set<string>();
    let attempts = 0;
    for (const delayMs of [0, 50, 150, 300]) {
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        attempts += 1;
        const rows = await searchApi.querySQL(client, `SELECT DISTINCT def_block_id FROM refs WHERE block_id='${sql(eventBlockId)}' LIMIT ${Math.max(20, expected.length + 5)}`);
        actual = new Set(rows.flatMap((row) => row && typeof row === 'object' && typeof (row as Record<string, unknown>).def_block_id === 'string'
            ? [(row as Record<string, string>).def_block_id]
            : []));
        if (expected.every((id) => actual.has(id))) {
            return { status: 'verified', verifiedReferences: [...actual], missingReferenceIds: [], attempts };
        }
        if (attempts === 1) {
            for (const id of expected) {
                try {
                    await searchApi.refreshBacklink(client, id);
                } catch {
                    // 索引刷新失败不影响已经提交的事件；继续走 SQL 有界重试。
                }
            }
        }
    }
    return {
        status: 'deferred',
        verifiedReferences: [...actual],
        missingReferenceIds: expected.filter((id) => !actual.has(id)),
        attempts,
    };
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
    return records.sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt)
        || left.provider.localeCompare(right.provider)
        || left.sessionId.localeCompare(right.sessionId));
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
    workstream: string;
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
        'custom-progress-role': 'event',
        'custom-progress-schema': '1',
        'custom-progress-workstream': input.workstream,
        'custom-progress-kind': 'knowledge',
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

async function updateAtomProvenanceSummaries(
    client: SiYuanClient,
    atomIds: string[],
    eventId: string,
    occurredAt: string,
    attrs: Record<string, string>,
): Promise<Array<{
    atomId: string;
    disposition: 'advanced' | 'repaired' | 'preserved_newer' | 'preserved_equal_time' | 'preserved_unparseable_time';
}>> {
    const writes: Array<{ id: string; attrs: Record<string, string> }> = [];
    const results: Array<{
        atomId: string;
        disposition: 'advanced' | 'repaired' | 'preserved_newer' | 'preserved_equal_time' | 'preserved_unparseable_time';
    }> = [];
    const incomingTime = isoTimeValue(occurredAt);
    for (const atomId of atomIds) {
        const current = await blockApi.getBlockAttrs(client, atomId);
        const currentEvent = current['custom-provenance-event'];
        const currentTimeText = current['custom-provenance-updated-at'];
        let disposition: typeof results[number]['disposition'];
        if (currentEvent === eventId) {
            disposition = 'repaired';
        } else if (!currentTimeText) {
            disposition = 'advanced';
        } else {
            const currentTime = isoTimeValue(currentTimeText);
            if (currentTime === null || incomingTime === null) disposition = 'preserved_unparseable_time';
            else if (incomingTime > currentTime) disposition = 'advanced';
            else if (incomingTime < currentTime) disposition = 'preserved_newer';
            else disposition = 'preserved_equal_time';
        }
        if ((disposition === 'advanced' || disposition === 'repaired')
            && Object.entries(attrs).some(([name, value]) => current[name] !== value)) {
            writes.push({ id: atomId, attrs });
        }
        results.push({ atomId, disposition });
    }
    if (writes.length > 0) {
        await blockApi.batchSetBlockAttrs(client, writes);
        for (const write of writes) await verifyAttrs(client, write.id, attrs);
    }
    return results;
}

export async function recordProvenanceEvent(client: SiYuanClient, input: {
    projectBlockId: string;
    projectId: string;
    eventId: string;
    operation: string;
    workstream: string;
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
        const fixedProgressAttrs: Record<string, string> = {
            'custom-progress-role': 'event',
            'custom-progress-schema': '1',
            'custom-progress-workstream': input.workstream,
            'custom-progress-kind': 'knowledge',
        };
        for (const [name, value] of Object.entries(fixedProgressAttrs)) {
            if (existing[name] && existing[name] !== value) throw new Error(`eventId ${input.eventId} 已用于不同的知识化事件，冲突字段：${name}。`);
        }
        assertEventReplayCompatible({ ...existing, ...fixedProgressAttrs }, input);
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
        const atomSummaryUpdates = await updateAtomProvenanceSummaries(
            client,
            input.targetAtomIds,
            input.eventId,
            occurredAt,
            atomAttrs,
        );
        if (Object.entries(fixedProgressAttrs).some(([name, value]) => existing[name] !== value)) {
            await blockApi.setBlockAttrs(client, blockId, fixedProgressAttrs);
            await verifyAttrs(client, blockId, fixedProgressAttrs);
        }
        const verifiedEventAttrs = await blockApi.getBlockAttrs(client, blockId);
        const referenceVerification = await verifyEventReferences(client, blockId, [sourceSession.blockId, compileSession.blockId, ...input.targetAtomIds]);
        return {
            blockId,
            projectId: input.projectId,
            eventId: input.eventId,
            operation: input.operation,
            workstream: input.workstream,
            occurredAt,
            sourceSession,
            compileSession,
            targetAtomIds: input.targetAtomIds,
            automationId: input.automationId,
            replayed: true,
            transactionState: 'committed',
            attributes: verifiedEventAttrs,
            verification: {
                status: referenceVerification.status === 'verified' ? 'verified' : 'committed_but_verification_deferred',
                eventAttributes: true,
                targetAtomAttributes: true,
                referencedSessionBlockIds: [...new Set([sourceSession.blockId, compileSession.blockId])],
                referencedAtomIds: input.targetAtomIds,
                verifiedReferences: referenceVerification.verifiedReferences,
                missingReferenceIds: referenceVerification.missingReferenceIds,
                referenceAttempts: referenceVerification.attempts,
                atomSummaryUpdates,
            },
        };
    }
    const recordedAt = nowIso();
    const occurredAt = input.occurredAt || recordedAt;
    const sourceSession = await readRegisteredSession(client, input.projectId, input.sourceSession);
    const compileSession = await readRegisteredSession(client, input.projectId, input.compileSession || input.sourceSession);
    if (!blockId) {
        const targetRefs = input.targetAtomIds.map((id) => `((` + `${id} "知识原子"` + `))`).join('、');
        const compileRef = compileSession.blockId === sourceSession.blockId ? '' : `；编译 ((` + `${compileSession.blockId} "${compileSession.provider} 会话"` + `))`;
        const markdown = `知识化事件：${input.operation}；发生于 ${occurredAt}；登记于 ${recordedAt}；来源 ((` + `${sourceSession.blockId} "${sourceSession.provider} 会话"` + `))${compileRef}；目标 ${targetRefs}`;
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
        'custom-progress-role': 'event',
        'custom-progress-schema': '1',
        'custom-progress-workstream': input.workstream,
        'custom-progress-kind': 'knowledge',
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
    const atomSummaryUpdates = await updateAtomProvenanceSummaries(
        client,
        input.targetAtomIds,
        input.eventId,
        occurredAt,
        atomAttrs,
    );
    const verifiedEventAttrs = await blockApi.getBlockAttrs(client, blockId);
    const referenceVerification = await verifyEventReferences(client, blockId, [sourceSession.blockId, compileSession.blockId, ...input.targetAtomIds]);
    return {
        blockId,
        projectId: input.projectId,
        eventId: input.eventId,
        operation: input.operation,
        workstream: input.workstream,
        occurredAt,
        sourceSession,
        compileSession,
        targetAtomIds: input.targetAtomIds,
        automationId: input.automationId,
        replayed,
        transactionState: 'committed',
        attributes: verifiedEventAttrs,
        verification: {
            status: referenceVerification.status === 'verified' ? 'verified' : 'committed_but_verification_deferred',
            eventAttributes: true,
            targetAtomAttributes: true,
            referencedSessionBlockIds: [...new Set([sourceSession.blockId, compileSession.blockId])],
            referencedAtomIds: input.targetAtomIds,
            verifiedReferences: referenceVerification.verifiedReferences,
            missingReferenceIds: referenceVerification.missingReferenceIds,
            referenceAttempts: referenceVerification.attempts,
            atomSummaryUpdates,
        },
    };
}

export async function listAtomProvenanceEvents(client: SiYuanClient, atomId: string, limit = 100): Promise<Array<Record<string, unknown>>> {
    const boundedLimit = Math.max(1, Math.min(500, limit));
    const rows = await searchApi.querySQL(client, `SELECT DISTINCT b.id FROM refs r JOIN blocks b ON b.id=r.block_id JOIN attributes k ON k.block_id=b.id AND k.name='custom-provenance-kind' AND k.value='event' WHERE r.def_block_id='${sql(atomId)}' ORDER BY b.created DESC LIMIT 500`);
    const events: Array<Record<string, unknown>> = [];
    for (const row of rows) {
        const id = row && typeof row === 'object' && typeof (row as Record<string, unknown>).id === 'string' ? (row as Record<string, string>).id : '';
        if (!id) continue;
        const attrs = await blockApi.getBlockAttrs(client, id);
        events.push({ blockId: id, projectId: attrs['custom-provenance-project-id'], eventId: attrs['custom-provenance-event-id'], operation: attrs['custom-provenance-operation'], occurredAt: attrs['custom-provenance-occurred-at'], sourceProvider: attrs['custom-provenance-source-provider'], sourceSessionId: attrs['custom-provenance-source-session'], compileProvider: attrs['custom-provenance-compile-provider'], compileSessionId: attrs['custom-provenance-compile-session'], targetAtomIds: JSON.parse(attrs['custom-provenance-target-atom-ids'] || '[]'), automationId: attrs['custom-automation-id'] || undefined });
    }
    return events
        .sort((left, right) => String(right.occurredAt || '').localeCompare(String(left.occurredAt || ''))
            || String(right.blockId || '').localeCompare(String(left.blockId || '')))
        .slice(0, boundedLimit);
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

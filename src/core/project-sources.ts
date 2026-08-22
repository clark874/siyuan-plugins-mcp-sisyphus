import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import util from 'node:util';

import type { SiYuanClient } from '../api/client';
import { redactText } from '../control-plane/security';
import {
    PROJECT_SOURCE_ACCESSES,
    PROJECT_SOURCE_COVERAGES,
    PROJECT_SOURCE_KINDS,
    PROJECT_SOURCE_ROLES,
    PROJECT_SOURCE_STATUSES,
} from './project-source-contract';
import { hashWriteState } from './write-safety-hash';

export const PROJECT_SOURCE_REGISTRY_PATH = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/projectSourcesV1.json';
export const PROJECT_SOURCE_SCHEMA_VERSION = 1;

export {
    PROJECT_SOURCE_ACCESSES,
    PROJECT_SOURCE_COVERAGES,
    PROJECT_SOURCE_KINDS,
    PROJECT_SOURCE_ROLES,
    PROJECT_SOURCE_STATUSES,
};

export type ProjectSourceKind = typeof PROJECT_SOURCE_KINDS[number];
export type ProjectSourceCoverage = typeof PROJECT_SOURCE_COVERAGES[number];
export type ProjectSourceRole = typeof PROJECT_SOURCE_ROLES[number];
export type ProjectSourceAccess = typeof PROJECT_SOURCE_ACCESSES[number];
export type ProjectSourceStatus = typeof PROJECT_SOURCE_STATUSES[number];

export interface ProjectCoreFile {
    relativePath: string;
    role: ProjectSourceRole;
}

export interface ProjectExclusionRule {
    relativePath: string;
    reason: string;
}

export interface ProjectManifestEntry {
    relativePath: string;
    tier: 'A' | 'B';
    role?: ProjectSourceRole;
    type: string;
    size: number;
    modifiedAt: string;
    sourceRevision: string;
    hash?: string;
    hashStatus?: 'skipped_too_large' | 'skipped_total_budget';
}

export interface ProjectManifestExclusion {
    relativePath: string;
    reason: string;
    kind: 'directory' | 'file' | 'symlink' | 'special';
}

export interface ProjectSourceManifest {
    generatedAt: string;
    coverage: ProjectSourceCoverage;
    revision: string;
    manifestHash: string;
    counts: { a: number; b: number; c: number };
    entries: ProjectManifestEntry[];
    exclusions: ProjectManifestExclusion[];
    missingCore: string[];
    truncated: false;
}

export interface ProjectHostBinding {
    hostId: string;
    workspaceRoot: string;
    checkoutKind: 'git-clone' | 'git-worktree' | 'plain-directory';
    revision: string;
    verifiedAt: string;
    access: ProjectSourceAccess;
    status: ProjectSourceStatus;
}

export interface ProjectSourceRecord {
    projectId: string;
    hubBlockId?: string;
    manifestBlockId?: string;
    sourceKind: ProjectSourceKind;
    repository?: string;
    revision: string;
    coverage: ProjectSourceCoverage;
    coreFiles: ProjectCoreFile[];
    includePaths: string[];
    exclusions: ProjectExclusionRule[];
    bindings: Record<string, ProjectHostBinding>;
    manifest?: ProjectSourceManifest;
    updatedAt: string;
}

interface ProjectSourceRegistry {
    schemaVersion: 1;
    updatedAt: string;
    projects: ProjectSourceRecord[];
}

interface FileApiErrorEnvelope {
    code: number;
    msg: string;
    data?: unknown;
}

export interface ProjectSourceRuntimeOptions {
    hostId?: string;
}

export interface RegisterProjectSourceInput {
    projectId: string;
    workspaceRoot: string;
    sourceKind: ProjectSourceKind;
    hubBlockId?: string;
    manifestBlockId?: string;
    repository?: string;
    coverage?: ProjectSourceCoverage;
    access?: ProjectSourceAccess;
    coreFiles?: ProjectCoreFile[];
    includePaths?: string[];
    exclusions?: ProjectExclusionRule[];
}

export interface ScanProjectManifestInput {
    projectId: string;
    maxEntries?: number;
    maxHashBytes?: number;
    maxTotalHashBytes?: number;
}

export interface ResolveProjectSourceInput {
    projectId: string;
    relativePath: string;
}

export interface ListProjectSourcesInput {
    query?: string;
    status?: ProjectSourceStatus;
    page?: number;
    pageSize?: number;
}

export interface ReadProjectSourceInput {
    projectId: string;
    relativePath: string;
    offset?: number;
    limit?: number;
}

const DEFAULT_MAX_ENTRIES = 20_000;
const MAX_ALLOWED_ENTRIES = 50_000;
const DEFAULT_MAX_HASH_BYTES = 64 * 1024 * 1024;
const MAX_ALLOWED_HASH_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_HASH_BYTES = 512 * 1024 * 1024;
const MAX_ALLOWED_TOTAL_HASH_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_PROJECT_TEXT_BYTES = 1024 * 1024;
const MAX_PROJECT_METADATA_HASH_BYTES = 64 * 1024 * 1024;
const DEFAULT_PROJECT_TEXT_CHARS = 8_000;
const MAX_PROJECT_TEXT_CHARS = 20_000;

const PROJECT_TEXT_EXTENSIONS = new Set([
    '.bash', '.bat', '.c', '.cc', '.cfg', '.cmd', '.conf', '.config', '.cpp', '.cs', '.css', '.csv',
    '.do', '.fish', '.go', '.gradle', '.h', '.hpp', '.htm', '.html', '.ini', '.java', '.js', '.json',
    '.json5', '.jsonl', '.jsx', '.kt', '.kts', '.less', '.m', '.markdown', '.md', '.mdx', '.mjs',
    '.php', '.properties', '.ps1', '.py', '.r', '.rb', '.rs', '.sass', '.scala', '.scss', '.sh', '.sql',
    '.svelte', '.swift', '.tex', '.toml', '.ts', '.tsv', '.tsx', '.txt', '.vue', '.xml', '.yaml', '.yml',
    '.zsh',
]);
const PROJECT_TEXT_BASENAMES = new Set([
    'agents', 'authors', 'changelog', 'dockerfile', 'gemfile', 'license', 'makefile', 'notice', 'procfile',
    'rakefile', 'readme', '.babelrc', '.dockerignore', '.editorconfig', '.eslintrc', '.gitattributes',
    '.gitignore', '.nvmrc', '.prettierignore', '.prettierrc', '.stylelintrc',
]);
const SENSITIVE_PROJECT_FILE = /(?:^|[._-])(?:env|credentials?|secrets?|tokens?|cookies?|private[_-]?keys?|id_(?:rsa|dsa|ecdsa|ed25519)|npmrc|pypirc|netrc)(?:$|[._-])/i;

const DEFAULT_EXCLUDED_SEGMENTS: Record<string, string> = {
    '.git': 'version_control_metadata',
    node_modules: 'dependency_cache',
    __pycache__: 'language_cache',
    '.cache': 'cache',
    cache: 'cache',
    coverage: 'generated_output',
    dist: 'generated_output',
    build: 'generated_output',
    target: 'generated_output',
    tmp: 'temporary_output',
    '.tmp': 'temporary_output',
};

function now(): string {
    return new Date().toISOString();
}

function normalizeProjectId(value: string): string {
    const normalized = value.trim();
    if (!/^[a-z0-9][a-z0-9._:-]{2,127}$/i.test(normalized)) {
        throw new Error('projectId must be 3-128 ASCII letters, digits, dots, underscores, colons, or hyphens.');
    }
    return normalized;
}

export function normalizeProjectRelativePath(value: string): string {
    const raw = value.trim();
    const normalized = raw.replace(/\\/g, '/').replace(/^\.\//, '');
    if (!normalized
        || normalized.includes('\0')
        || path.isAbsolute(raw)
        || path.posix.isAbsolute(normalized)
        || path.win32.isAbsolute(normalized)
        || /^[a-z]:/i.test(normalized)) {
        throw new Error('relativePath must be a non-empty project-relative path.');
    }
    const segments = normalized.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
        throw new Error('relativePath must not contain empty, current-directory, or parent-directory segments.');
    }
    return segments.join('/');
}

function optionalBlockId(value: string | undefined, field: string): string | undefined {
    const normalized = value?.trim();
    if (!normalized) return undefined;
    if (!/^\d{14}-[a-z0-9]{7}$/.test(normalized)) {
        throw new Error(`${field} must be a stable SiYuan block ID.`);
    }
    return normalized;
}

function resolveHostId(options: ProjectSourceRuntimeOptions): string {
    const explicit = options.hostId?.trim() || process.env.SIYUAN_MCP_HOST_ID?.trim();
    if (explicit) {
        if (!/^[a-z0-9][a-z0-9._:-]{2,127}$/i.test(explicit)) throw new Error('hostId has an invalid format.');
        return explicit;
    }
    const fingerprint = [os.hostname(), os.platform(), os.arch(), os.homedir()].join('\n');
    return `host-${crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 24)}`;
}

function emptyRegistry(): ProjectSourceRegistry {
    return { schemaVersion: PROJECT_SOURCE_SCHEMA_VERSION, updatedAt: now(), projects: [] };
}

function isMissingStorageError(error: unknown): boolean {
    return error instanceof Error && /(?:404|not found|does not exist|不存在)/i.test(error.message);
}

function isFileApiErrorEnvelope(value: unknown): value is FileApiErrorEnvelope {
    if (!value || typeof value !== 'object') return false;
    const envelope = value as Partial<FileApiErrorEnvelope>;
    return typeof envelope.code === 'number' && typeof envelope.msg === 'string';
}

function isMissingFileEnvelope(value: unknown): value is FileApiErrorEnvelope {
    return isFileApiErrorEnvelope(value)
        && (value.code === 404 || /not found|does not exist|不存在/i.test(value.msg));
}

async function readRegistry(client: SiYuanClient): Promise<ProjectSourceRegistry> {
    let raw: string;
    try {
        raw = await client.readFile(PROJECT_SOURCE_REGISTRY_PATH);
    } catch (error) {
        if (isMissingStorageError(error)) return emptyRegistry();
        throw error;
    }
    if (!raw.trim()) return emptyRegistry();
    const parsed = JSON.parse(raw) as Partial<ProjectSourceRegistry> | FileApiErrorEnvelope;
    if (isMissingFileEnvelope(parsed)) return emptyRegistry();
    if (isFileApiErrorEnvelope(parsed)) {
        throw new Error(`SiYuan file API error: ${parsed.code} - ${parsed.msg}`);
    }
    if (parsed.schemaVersion !== PROJECT_SOURCE_SCHEMA_VERSION || !Array.isArray(parsed.projects)) {
        throw new Error('Project source registry has an unsupported or invalid schema.');
    }
    return parsed as ProjectSourceRegistry;
}

async function writeRegistry(client: SiYuanClient, registry: ProjectSourceRegistry): Promise<void> {
    registry.updatedAt = now();
    registry.projects.sort((left, right) => left.projectId.localeCompare(right.projectId));
    const normalized = JSON.parse(JSON.stringify(registry)) as ProjectSourceRegistry;
    await client.writeFile(PROJECT_SOURCE_REGISTRY_PATH, `${JSON.stringify(normalized, null, 2)}\n`);
    const readback = await readRegistry(client);
    if (hashWriteState(readback) !== hashWriteState(normalized)) {
        throw new Error('Project source registry readback did not match the requested state.');
    }
}

async function runGit(root: string, args: string[]): Promise<string> {
    const execFileAsync = util.promisify(childProcess.execFile);
    const result = await execFileAsync('git', ['-C', root, ...args], {
        encoding: 'utf8',
        timeout: 10_000,
        maxBuffer: 8 * 1024 * 1024,
    });
    return result.stdout.trim();
}

async function runGitRaw(root: string, args: string[]): Promise<string> {
    const execFileAsync = util.promisify(childProcess.execFile);
    const result = await execFileAsync('git', ['-C', root, ...args], {
        encoding: 'utf8',
        timeout: 10_000,
        maxBuffer: 8 * 1024 * 1024,
    });
    return result.stdout;
}

async function inspectCheckout(root: string, sourceKind: ProjectSourceKind): Promise<{
    checkoutKind: ProjectHostBinding['checkoutKind'];
    revision: string;
    repository?: string;
}> {
    if (sourceKind === 'directory') {
        return { checkoutKind: 'plain-directory', revision: 'directory:unscanned' };
    }
    let topLevel: string;
    try {
        topLevel = await fs.promises.realpath(await runGit(root, ['rev-parse', '--show-toplevel']));
    } catch {
        throw new Error('sourceKind="git" requires workspaceRoot to be a Git checkout root.');
    }
    if (topLevel !== root) throw new Error('workspaceRoot must be the Git checkout root, not a nested directory.');
    const revision = await runGit(root, ['rev-parse', 'HEAD']);
    let repository: string | undefined;
    try {
        repository = await runGit(root, ['config', '--get', 'remote.origin.url']);
    } catch {
        repository = undefined;
    }
    const gitMarker = await fs.promises.lstat(path.join(root, '.git'));
    return {
        checkoutKind: gitMarker.isFile() ? 'git-worktree' : 'git-clone',
        revision,
        ...(repository ? { repository } : {}),
    };
}

function normalizeCoreFiles(values: ProjectCoreFile[] | undefined): ProjectCoreFile[] {
    const seen = new Set<string>();
    return (values ?? []).map((item) => {
        const relativePath = normalizeProjectRelativePath(item.relativePath);
        if (seen.has(relativePath)) throw new Error(`coreFiles contains duplicate path: ${relativePath}`);
        seen.add(relativePath);
        return { relativePath, role: item.role };
    }).sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function normalizeIncludePaths(values: string[] | undefined): string[] {
    return [...new Set((values ?? []).map(normalizeProjectRelativePath))].sort();
}

function normalizeExclusions(values: ProjectExclusionRule[] | undefined): ProjectExclusionRule[] {
    const seen = new Set<string>();
    return (values ?? []).map((item) => {
        const relativePath = normalizeProjectRelativePath(item.relativePath);
        const reason = item.reason.trim();
        if (!reason) throw new Error(`Exclusion ${relativePath} requires a reason.`);
        if (seen.has(relativePath)) throw new Error(`exclusions contains duplicate path: ${relativePath}`);
        seen.add(relativePath);
        return { relativePath, reason };
    }).sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function validateCoverage(sourceKind: ProjectSourceKind, coverage: ProjectSourceCoverage, includePaths: string[]): void {
    if (coverage === 'tracked' && sourceKind !== 'git') {
        throw new Error('coverage="tracked" is only valid for Git project sources.');
    }
    if ((coverage === 'curated' || coverage === 'partial') && includePaths.length === 0) {
        throw new Error(`${coverage} coverage requires at least one includePaths entry.`);
    }
}

export async function registerProjectSource(
    client: SiYuanClient,
    input: RegisterProjectSourceInput,
    options: ProjectSourceRuntimeOptions = {},
) {
    const projectId = normalizeProjectId(input.projectId);
    if (!path.isAbsolute(input.workspaceRoot)) throw new Error('workspaceRoot must be an absolute local directory path.');
    const workspaceRoot = await fs.promises.realpath(input.workspaceRoot);
    const rootStat = await fs.promises.stat(workspaceRoot);
    if (!rootStat.isDirectory()) throw new Error('workspaceRoot must identify a directory.');

    const registry = await readRegistry(client);
    const existing = registry.projects.find((item) => item.projectId === projectId);
    const coverage = input.coverage ?? existing?.coverage ?? (input.sourceKind === 'git' ? 'tracked' : 'complete');
    const includePaths = normalizeIncludePaths(input.includePaths ?? existing?.includePaths);
    validateCoverage(input.sourceKind, coverage, includePaths);
    const checkout = await inspectCheckout(workspaceRoot, input.sourceKind);
    const requestedRepository = input.repository?.trim() || undefined;
    if (requestedRepository && checkout.repository && requestedRepository !== checkout.repository) {
        throw new Error('The requested repository does not match the Git checkout origin.');
    }
    const repository = checkout.repository
        ?? requestedRepository
        ?? (existing?.sourceKind === input.sourceKind ? existing.repository : undefined);
    const hostId = resolveHostId(options);
    const timestamp = now();
    const coreFiles = normalizeCoreFiles(input.coreFiles ?? existing?.coreFiles);
    const exclusions = normalizeExclusions(input.exclusions ?? existing?.exclusions);
    const portableChanged = Boolean(existing) && hashWriteState({
        sourceKind: existing!.sourceKind,
        repository: existing!.repository,
        coverage: existing!.coverage,
        coreFiles: existing!.coreFiles,
        includePaths: existing!.includePaths,
        exclusions: existing!.exclusions,
    }) !== hashWriteState({
        sourceKind: input.sourceKind,
        repository,
        coverage,
        coreFiles,
        includePaths,
        exclusions,
    });
    const binding: ProjectHostBinding = {
        hostId,
        workspaceRoot,
        checkoutKind: checkout.checkoutKind,
        revision: checkout.revision,
        verifiedAt: timestamp,
        access: input.access ?? existing?.bindings[hostId]?.access ?? 'read-only',
        status: 'available',
    };
    const record: ProjectSourceRecord = {
        projectId,
        hubBlockId: optionalBlockId(input.hubBlockId, 'hubBlockId') ?? existing?.hubBlockId,
        manifestBlockId: optionalBlockId(input.manifestBlockId, 'manifestBlockId') ?? existing?.manifestBlockId,
        sourceKind: input.sourceKind,
        ...(repository ? { repository } : {}),
        revision: !portableChanged && existing?.manifest ? existing.manifest.revision : checkout.revision,
        coverage,
        coreFiles,
        includePaths,
        exclusions,
        bindings: { ...(existing?.bindings ?? {}), [hostId]: binding },
        ...(!portableChanged && existing?.manifest ? { manifest: existing.manifest } : {}),
        updatedAt: timestamp,
    };
    if (existing) registry.projects[registry.projects.indexOf(existing)] = record;
    else registry.projects.push(record);
    await writeRegistry(client, registry);
    return {
        projectId,
        hubBlockId: record.hubBlockId,
        manifestBlockId: record.manifestBlockId,
        sourceKind: record.sourceKind,
        repository: record.repository,
        revision: record.revision,
        coverage: record.coverage,
        binding,
        manifestStatus: record.manifest ? 'available' : 'missing',
    };
}

function exclusionFor(relativePath: string, rules: ProjectExclusionRule[]): { reason: string } | undefined {
    const segments = relativePath.split('/');
    for (const segment of segments) {
        const reason = DEFAULT_EXCLUDED_SEGMENTS[segment];
        if (reason) return { reason };
    }
    const custom = rules.find((rule) => relativePath === rule.relativePath || relativePath.startsWith(`${rule.relativePath}/`));
    return custom ? { reason: custom.reason } : undefined;
}

function ensureWithinRoot(root: string, candidate: string): void {
    const relative = path.relative(root, candidate);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error('Resolved project path escapes the registered workspace root.');
    }
}

async function nearestExistingRealPath(candidate: string): Promise<string> {
    let current = candidate;
    while (true) {
        try {
            return await fs.promises.realpath(current);
        } catch (error) {
            if (!(error instanceof Error) || !('code' in error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            const parent = path.dirname(current);
            if (parent === current) throw error;
            current = parent;
        }
    }
}

async function inspectBinding(record: ProjectSourceRecord, binding: ProjectHostBinding | undefined) {
    if (!binding) return { status: 'missing' as const, revisionVerified: false };
    let root: string;
    try {
        root = await fs.promises.realpath(binding.workspaceRoot);
        if (!(await fs.promises.stat(root)).isDirectory()) return { status: 'missing' as const, revisionVerified: false };
    } catch {
        return { status: 'missing' as const, revisionVerified: false };
    }
    if (record.sourceKind === 'git') {
        try {
            const currentRevision = await runGit(root, ['rev-parse', 'HEAD']);
            const expectedRevision = record.manifest?.revision ?? binding.revision;
            const status: ProjectSourceStatus = currentRevision === expectedRevision ? 'available' : 'stale';
            return { status, currentRevision, revisionVerified: status === 'available' };
        } catch {
            return { status: 'stale' as const, revisionVerified: false };
        }
    }
    return { status: 'available' as const, currentRevision: binding.revision, revisionVerified: false };
}

async function collectTrackedPaths(root: string): Promise<string[]> {
    const output = await runGitRaw(root, ['ls-files', '-z', '--cached']);
    return output.split('\0').filter(Boolean).map(normalizeProjectRelativePath).sort();
}

async function collectFilesystemPaths(
    root: string,
    roots: string[],
    exclusionRules: ProjectExclusionRule[],
    maxEntries: number,
): Promise<{ paths: string[]; exclusions: ProjectManifestExclusion[] }> {
    const files: string[] = [];
    const exclusions: ProjectManifestExclusion[] = [];
    const seen = new Set<string>();
    const pending = roots.length > 0 ? [...roots] : [''];
    const scheduled = new Set(pending);
    let visitedEntries = 0;
    while (pending.length > 0) {
        const relativeParent = pending.shift()!;
        const absoluteParent = path.join(root, ...relativeParent.split('/').filter(Boolean));
        const parentStat = await fs.promises.lstat(absoluteParent);
        if (relativeParent) {
            const parentExclusion = exclusionFor(relativeParent, exclusionRules);
            if (parentExclusion) {
                if (!seen.has(relativeParent)) {
                    seen.add(relativeParent);
                    exclusions.push({
                        relativePath: relativeParent,
                        reason: parentExclusion.reason,
                        kind: parentStat.isDirectory() ? 'directory' : parentStat.isSymbolicLink() ? 'symlink' : parentStat.isFile() ? 'file' : 'special',
                    });
                }
                continue;
            }
            if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
                if (!seen.has(relativeParent)) {
                    seen.add(relativeParent);
                    files.push(relativeParent);
                }
                continue;
            }
        }
        const entries = await fs.promises.readdir(absoluteParent, { withFileTypes: true });
        entries.sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
            visitedEntries += 1;
            if (visitedEntries > maxEntries) {
                throw new Error(`Project scan exceeds maxEntries=${maxEntries}; narrow includePaths or exclusions before retrying.`);
            }
            const relativePath = relativeParent ? `${relativeParent}/${entry.name}` : entry.name;
            if (seen.has(relativePath)) continue;
            const excluded = exclusionFor(relativePath, exclusionRules);
            if (excluded) {
                seen.add(relativePath);
                exclusions.push({
                    relativePath,
                    reason: excluded.reason,
                    kind: entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : entry.isFile() ? 'file' : 'special',
                });
                continue;
            }
            if (entry.isDirectory() && !entry.isSymbolicLink()) {
                if (!scheduled.has(relativePath)) {
                    scheduled.add(relativePath);
                    pending.push(relativePath);
                }
            } else {
                seen.add(relativePath);
                files.push(relativePath);
            }
        }
    }
    return { paths: files, exclusions };
}

async function hashFile(filePath: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
    return `sha256:${hash.digest('hex')}`;
}

function sourceFileType(relativePath: string): string {
    const extension = path.posix.extname(relativePath).toLowerCase();
    return extension ? extension.slice(1) : 'no_extension';
}

export async function scanProjectManifest(
    client: SiYuanClient,
    input: ScanProjectManifestInput,
    options: ProjectSourceRuntimeOptions = {},
) {
    const projectId = normalizeProjectId(input.projectId);
    const hostId = resolveHostId(options);
    const maxEntries = input.maxEntries ?? DEFAULT_MAX_ENTRIES;
    const maxHashBytes = input.maxHashBytes ?? DEFAULT_MAX_HASH_BYTES;
    const maxTotalHashBytes = input.maxTotalHashBytes ?? DEFAULT_MAX_TOTAL_HASH_BYTES;
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > MAX_ALLOWED_ENTRIES) {
        throw new Error(`maxEntries must be between 1 and ${MAX_ALLOWED_ENTRIES}.`);
    }
    if (!Number.isSafeInteger(maxHashBytes) || maxHashBytes < 1 || maxHashBytes > MAX_ALLOWED_HASH_BYTES) {
        throw new Error(`maxHashBytes must be between 1 and ${MAX_ALLOWED_HASH_BYTES}.`);
    }
    if (!Number.isSafeInteger(maxTotalHashBytes) || maxTotalHashBytes < 1 || maxTotalHashBytes > MAX_ALLOWED_TOTAL_HASH_BYTES) {
        throw new Error(`maxTotalHashBytes must be between 1 and ${MAX_ALLOWED_TOTAL_HASH_BYTES}.`);
    }
    const registry = await readRegistry(client);
    const record = registry.projects.find((item) => item.projectId === projectId);
    if (!record) throw new Error(`Project source is not registered: ${projectId}`);
    const binding = record.bindings[hostId];
    if (!binding) throw new Error(`Project source has no binding for the current host: ${projectId}`);
    const root = await fs.promises.realpath(binding.workspaceRoot);
    ensureWithinRoot(root, root);
    const checkout = await inspectCheckout(root, record.sourceKind);
    const collected = record.coverage === 'tracked'
        ? { paths: await collectTrackedPaths(root), exclusions: [] as ProjectManifestExclusion[] }
        : await collectFilesystemPaths(root, record.coverage === 'complete' ? [] : record.includePaths, record.exclusions, maxEntries);
    const candidatePaths = collected.paths;
    if (candidatePaths.length + collected.exclusions.length > maxEntries) {
        throw new Error(`Project manifest exceeds maxEntries=${maxEntries}; narrow includePaths or exclusions before retrying.`);
    }
    const coreRoles = new Map(record.coreFiles.map((item) => [item.relativePath, item.role]));
    const observedCore = new Set<string>();
    const entries: ProjectManifestEntry[] = [];
    const exclusions: ProjectManifestExclusion[] = [...collected.exclusions];
    let hashBytesRead = 0;
    if (exclusions.length > maxEntries) {
        throw new Error(`Project manifest exceeds maxEntries=${maxEntries}; narrow includePaths or exclusions before retrying.`);
    }

    for (const relativePathValue of candidatePaths) {
        const relativePath = normalizeProjectRelativePath(relativePathValue);
        const excluded = exclusionFor(relativePath, record.exclusions);
        const absolutePath = path.join(root, ...relativePath.split('/'));
        ensureWithinRoot(root, absolutePath);
        let stat: fs.Stats;
        try {
            stat = await fs.promises.lstat(absolutePath);
        } catch (error) {
            if (!(error instanceof Error) || !('code' in error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            if (entries.length + exclusions.length >= maxEntries) {
                throw new Error(`Project manifest exceeds maxEntries=${maxEntries}; narrow includePaths or exclusions before retrying.`);
            }
            exclusions.push({ relativePath, reason: 'missing_from_worktree', kind: 'special' });
            continue;
        }
        if (excluded) {
            const parentExcluded = exclusions.some((item) => relativePath.startsWith(`${item.relativePath}/`));
            if (!parentExcluded) {
                if (entries.length + exclusions.length >= maxEntries) {
                    throw new Error(`Project manifest exceeds maxEntries=${maxEntries}; narrow includePaths or exclusions before retrying.`);
                }
                exclusions.push({
                    relativePath,
                    reason: excluded.reason,
                    kind: stat.isDirectory() ? 'directory' : stat.isSymbolicLink() ? 'symlink' : stat.isFile() ? 'file' : 'special',
                });
            }
            continue;
        }
        if (stat.isDirectory()) continue;
        if (stat.isSymbolicLink()) {
            if (entries.length + exclusions.length >= maxEntries) {
                throw new Error(`Project manifest exceeds maxEntries=${maxEntries}; narrow includePaths or exclusions before retrying.`);
            }
            exclusions.push({ relativePath, reason: 'symlink_not_followed', kind: 'symlink' });
            continue;
        }
        if (!stat.isFile()) {
            if (entries.length + exclusions.length >= maxEntries) {
                throw new Error(`Project manifest exceeds maxEntries=${maxEntries}; narrow includePaths or exclusions before retrying.`);
            }
            exclusions.push({ relativePath, reason: 'special_file_not_supported', kind: 'special' });
            continue;
        }
        if (entries.length + exclusions.length >= maxEntries) {
            throw new Error(`Project manifest exceeds maxEntries=${maxEntries}; narrow includePaths or exclusions before retrying.`);
        }
        const role = coreRoles.get(relativePath);
        if (role) observedCore.add(relativePath);
        let hashFields: Pick<ProjectManifestEntry, 'hash' | 'hashStatus'> = {};
        if (role) {
            if (stat.size > maxHashBytes) {
                hashFields = { hashStatus: 'skipped_too_large' };
            } else if (hashBytesRead + stat.size > maxTotalHashBytes) {
                hashFields = { hashStatus: 'skipped_total_budget' };
            } else {
                hashFields = { hash: await hashFile(absolutePath) };
                const afterHash = await fs.promises.stat(absolutePath);
                if (afterHash.size !== stat.size || afterHash.mtimeMs !== stat.mtimeMs) {
                    throw new Error(`Core file changed while hashing: ${relativePath}`);
                }
                hashBytesRead += stat.size;
            }
        }
        entries.push({
            relativePath,
            tier: role ? 'A' : 'B',
            ...(role ? { role, ...hashFields } : {}),
            type: sourceFileType(relativePath),
            size: stat.size,
            modifiedAt: new Date(stat.mtimeMs).toISOString(),
            sourceRevision: checkout.revision,
        });
    }
    entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    exclusions.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    const missingCore = record.coreFiles.map((item) => item.relativePath).filter((item) => !observedCore.has(item));
    const counts = {
        a: entries.filter((item) => item.tier === 'A').length,
        b: entries.filter((item) => item.tier === 'B').length,
        c: exclusions.length,
    };
    const directoryRevision = `directory:${hashWriteState({ entries, exclusions, missingCore }).replace(/^sha256:v1:/, '')}`;
    const revision = record.sourceKind === 'git' ? checkout.revision : directoryRevision;
    const stableManifestCore = {
        coverage: record.coverage,
        revision,
        counts,
        entries: entries.map((entry) => ({ ...entry, sourceRevision: revision })),
        exclusions,
        missingCore,
        truncated: false as const,
    };
    const manifest: ProjectSourceManifest = {
        generatedAt: now(),
        ...stableManifestCore,
        manifestHash: hashWriteState(stableManifestCore),
    };
    record.revision = revision;
    record.manifest = manifest;
    record.updatedAt = now();
    record.bindings[hostId] = {
        ...binding,
        workspaceRoot: root,
        revision,
        verifiedAt: now(),
        status: 'available',
    };
    await writeRegistry(client, registry);
    return {
        projectId,
        coverage: manifest.coverage,
        revision: manifest.revision,
        manifestHash: manifest.manifestHash,
        counts: manifest.counts,
        coreFiles: manifest.entries.filter((entry) => entry.tier === 'A'),
        exclusions: manifest.exclusions,
        missingCore: manifest.missingCore,
        hashCoverageComplete: manifest.entries.filter((entry) => entry.tier === 'A').every((entry) => Boolean(entry.hash)),
        hashBytesRead,
        maxTotalHashBytes,
        contentRead: false,
    };
}

export async function resolveProjectSource(
    client: SiYuanClient,
    input: ResolveProjectSourceInput,
    options: ProjectSourceRuntimeOptions = {},
) {
    const projectId = normalizeProjectId(input.projectId);
    const relativePath = normalizeProjectRelativePath(input.relativePath);
    const hostId = resolveHostId(options);
    const registry = await readRegistry(client);
    const record = registry.projects.find((item) => item.projectId === projectId);
    if (!record) throw new Error(`Project source is not registered: ${projectId}`);
    const binding = record.bindings[hostId];
    if (!binding) throw new Error(`Project source has no binding for the current host: ${projectId}`);
    const root = await fs.promises.realpath(binding.workspaceRoot);
    const candidate = path.join(root, ...relativePath.split('/'));
    ensureWithinRoot(root, candidate);
    const nearestReal = await nearestExistingRealPath(candidate);
    ensureWithinRoot(root, nearestReal);
    let exists = false;
    let pathType: 'file' | 'directory' | 'symlink' | 'missing' = 'missing';
    try {
        const stat = await fs.promises.lstat(candidate);
        exists = true;
        pathType = stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'missing';
        const real = await fs.promises.realpath(candidate);
        ensureWithinRoot(root, real);
    } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const entry = record.manifest?.entries.find((item) => item.relativePath === relativePath);
    const bindingState = await inspectBinding(record, binding);
    return {
        projectId,
        relativePath,
        resolvedPath: candidate,
        bindingStatus: bindingState.status,
        currentRevision: bindingState.currentRevision,
        manifestRevision: record.manifest?.revision,
        revisionVerified: bindingState.revisionVerified && bindingState.currentRevision === record.manifest?.revision,
        listed: Boolean(entry),
        exists,
        pathType,
        withinRoot: true,
        contentRead: false,
        ...(entry ? { entry } : {}),
    };
}

function projectSourceReadReason(relativePath: string): 'sensitive_path' | 'binary_file' | undefined {
    const basename = path.posix.basename(relativePath);
    if (SENSITIVE_PROJECT_FILE.test(basename)) return 'sensitive_path';
    const extension = path.posix.extname(basename).toLowerCase();
    if (extension) return PROJECT_TEXT_EXTENSIONS.has(extension) ? undefined : 'binary_file';
    return PROJECT_TEXT_BASENAMES.has(basename.toLowerCase()) ? undefined : 'binary_file';
}

async function hashProjectFileForMetadata(filePath: string, stat: fs.Stats): Promise<{
    hash?: string;
    hashSource?: 'current';
    hashStatus?: 'skipped_too_large';
}> {
    if (stat.size > MAX_PROJECT_METADATA_HASH_BYTES) return { hashStatus: 'skipped_too_large' };
    const hash = await hashFile(filePath);
    const afterHash = await fs.promises.stat(filePath);
    if (afterHash.dev !== stat.dev
        || afterHash.ino !== stat.ino
        || afterHash.size !== stat.size
        || afterHash.mtimeMs !== stat.mtimeMs) {
        throw new Error('Project source changed while hashing metadata.');
    }
    return { hash, hashSource: 'current' };
}

async function verifyProjectPathRevision(
    record: ProjectSourceRecord,
    root: string,
    relativePath: string,
    projectRevisionVerified: boolean,
): Promise<boolean> {
    if (!projectRevisionVerified || record.sourceKind !== 'git') return false;
    try {
        return (await runGitRaw(root, [
            'status', '--porcelain=v1', '--untracked-files=all', '--', relativePath,
        ])).trim() === '';
    } catch {
        return false;
    }
}

function validReadWindow(input: ReadProjectSourceInput): { offset: number; limit: number } {
    const offset = input.offset ?? 0;
    const limit = input.limit ?? DEFAULT_PROJECT_TEXT_CHARS;
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('offset must be a non-negative integer.');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PROJECT_TEXT_CHARS) {
        throw new Error(`limit must be between 1 and ${MAX_PROJECT_TEXT_CHARS}.`);
    }
    return { offset, limit };
}

export async function readProjectSource(
    client: SiYuanClient,
    input: ReadProjectSourceInput,
    options: ProjectSourceRuntimeOptions = {},
) {
    const projectId = normalizeProjectId(input.projectId);
    const relativePath = normalizeProjectRelativePath(input.relativePath);
    const { offset, limit } = validReadWindow(input);
    const hostId = resolveHostId(options);
    const registry = await readRegistry(client);
    const record = registry.projects.find((item) => item.projectId === projectId);
    if (!record) throw new Error(`Project source is not registered: ${projectId}`);
    const binding = record.bindings[hostId];
    if (!binding) throw new Error(`Project source has no binding for the current host: ${projectId}`);
    const entry = record.manifest?.entries.find((item) => item.relativePath === relativePath);
    const bindingState = await inspectBinding(record, binding);
    const revisionVerified = bindingState.revisionVerified
        && Boolean(record.manifest)
        && bindingState.currentRevision === record.manifest?.revision;
    const base = {
        projectId,
        relativePath,
        bindingStatus: bindingState.status,
        currentRevision: bindingState.currentRevision,
        manifestRevision: record.manifest?.revision,
        revisionVerified,
        listed: Boolean(entry),
        readable: false,
        contentRead: false,
        ...(entry ? {
            entry: {
                tier: entry.tier,
                role: entry.role,
                type: entry.type,
                size: entry.size,
                modifiedAt: entry.modifiedAt,
                sourceRevision: entry.sourceRevision,
            },
            ...(entry.hash ? { hash: entry.hash, hashSource: 'manifest' as const } : {}),
            ...(entry.hashStatus ? { hashStatus: entry.hashStatus } : {}),
        } : {}),
    };
    if (!entry) return { ...base, reason: 'not_listed' as const };
    if (bindingState.status !== 'available') return { ...base, reason: 'binding_not_available' as const };

    const root = await fs.promises.realpath(binding.workspaceRoot);
    const candidate = path.join(root, ...relativePath.split('/'));
    ensureWithinRoot(root, candidate);
    const nearestReal = await nearestExistingRealPath(candidate);
    ensureWithinRoot(root, nearestReal);
    let stat: fs.Stats;
    try {
        stat = await fs.promises.lstat(candidate);
    } catch (error) {
        if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
            return { ...base, reason: 'missing' as const };
        }
        throw error;
    }
    if (stat.isSymbolicLink()) {
        const real = await fs.promises.realpath(candidate);
        ensureWithinRoot(root, real);
        return { ...base, reason: 'symlink_not_readable' as const };
    }
    if (!stat.isFile()) return { ...base, reason: 'not_regular_file' as const };
    const realCandidate = await fs.promises.realpath(candidate);
    ensureWithinRoot(root, realCandidate);
    const pathRevisionVerified = await verifyProjectPathRevision(
        record,
        root,
        relativePath,
        revisionVerified,
    );

    const metadata = {
        size: stat.size,
        modifiedAt: new Date(stat.mtimeMs).toISOString(),
    };
    const policyReason = projectSourceReadReason(relativePath);
    if (policyReason === 'sensitive_path') {
        return { ...base, ...metadata, revisionVerified: pathRevisionVerified, reason: policyReason };
    }
    if (policyReason === 'binary_file') {
        return {
            ...base,
            ...metadata,
            revisionVerified: pathRevisionVerified,
            ...await hashProjectFileForMetadata(realCandidate, stat),
            reason: policyReason,
        };
    }
    if (stat.size > MAX_PROJECT_TEXT_BYTES) {
        return {
            ...base,
            ...metadata,
            revisionVerified: pathRevisionVerified,
            ...await hashProjectFileForMetadata(realCandidate, stat),
            reason: 'file_too_large' as const,
            maxReadableBytes: MAX_PROJECT_TEXT_BYTES,
        };
    }

    const noFollow = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const handle = await fs.promises.open(realCandidate, fs.constants.O_RDONLY | noFollow);
    let bytes: Buffer;
    try {
        const opened = await handle.stat();
        if (!opened.isFile()) return { ...base, ...metadata, reason: 'not_regular_file' as const };
        if (opened.dev !== stat.dev
            || opened.ino !== stat.ino
            || opened.size !== stat.size
            || opened.mtimeMs !== stat.mtimeMs) {
            throw new Error(`Project source changed before reading: ${relativePath}`);
        }
        bytes = await handle.readFile();
        const afterRead = await handle.stat();
        if (afterRead.dev !== opened.dev
            || afterRead.ino !== opened.ino
            || afterRead.size !== opened.size
            || afterRead.mtimeMs !== opened.mtimeMs) {
            throw new Error(`Project source changed while reading: ${relativePath}`);
        }
        const finalRealCandidate = await fs.promises.realpath(candidate);
        ensureWithinRoot(root, finalRealCandidate);
        if (finalRealCandidate !== realCandidate) {
            throw new Error(`Project source path changed while reading: ${relativePath}`);
        }
    } finally {
        await handle.close();
    }

    const currentHash = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
    let decoded: string;
    try {
        decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        return {
            ...base,
            ...metadata,
            revisionVerified: pathRevisionVerified,
            hash: currentHash,
            hashSource: 'current' as const,
            contentHashVerified: Boolean(entry.hash) && entry.hash === currentHash,
            reason: 'binary_file' as const,
        };
    }
    const redacted = redactText(decoded);
    const totalChars = redacted.content.length;
    const content = redacted.content.slice(offset, offset + limit);
    const nextOffset = offset + content.length;
    const truncated = nextOffset < totalChars;
    return {
        ...base,
        ...metadata,
        readable: true,
        contentRead: true,
        revisionVerified: pathRevisionVerified && (!entry.hash || entry.hash === currentHash),
        contentHashVerified: Boolean(entry.hash) && entry.hash === currentHash,
        hash: currentHash,
        hashSource: 'current' as const,
        encoding: 'utf-8' as const,
        redacted: redacted.redacted,
        format: redacted.format,
        offset,
        limit,
        returnedChars: content.length,
        totalChars,
        truncated,
        ...(truncated ? { nextOffset } : {}),
        content,
    };
}

export async function listProjectSources(
    client: SiYuanClient,
    input: ListProjectSourcesInput,
    options: ProjectSourceRuntimeOptions = {},
) {
    const hostId = resolveHostId(options);
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 20;
    if (!Number.isSafeInteger(page) || page < 1) throw new Error('page must be a positive integer.');
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('pageSize must be between 1 and 100.');
    const query = input.query?.trim().toLowerCase() ?? '';
    const registry = await readRegistry(client);
    const values = [];
    for (const record of registry.projects) {
        if (query && ![record.projectId, record.repository, record.hubBlockId, record.manifestBlockId]
            .filter(Boolean).some((value) => value!.toLowerCase().includes(query))) continue;
        const binding = record.bindings[hostId];
        const inspected = await inspectBinding(record, binding);
        if (input.status && inspected.status !== input.status) continue;
        values.push({
            projectId: record.projectId,
            hubBlockId: record.hubBlockId,
            manifestBlockId: record.manifestBlockId,
            sourceKind: record.sourceKind,
            repository: record.repository,
            revision: record.revision,
            coverage: record.coverage,
            binding: {
                hostId,
                status: inspected.status,
                checkoutKind: binding?.checkoutKind,
                access: binding?.access,
                currentRevision: inspected.currentRevision,
                revisionVerified: inspected.revisionVerified,
            },
            manifest: record.manifest ? {
                revision: record.manifest.revision,
                manifestHash: record.manifest.manifestHash,
                counts: record.manifest.counts,
                missingCore: record.manifest.missingCore,
                generatedAt: record.manifest.generatedAt,
            } : { status: 'missing' },
        });
    }
    values.sort((left, right) => left.projectId.localeCompare(right.projectId));
    const offset = (page - 1) * pageSize;
    const data = values.slice(offset, offset + pageSize);
    const pageCount = values.length === 0 ? 0 : Math.ceil(values.length / pageSize);
    return {
        data,
        total: values.length,
        page,
        pageSize,
        pageCount,
        hasNextPage: page < pageCount,
        localPathsIncluded: false,
    };
}

export async function readProjectSourceState(
    client: SiYuanClient,
    projectIdValue: string,
    options: ProjectSourceRuntimeOptions = {},
) {
    const projectId = normalizeProjectId(projectIdValue);
    const hostId = resolveHostId(options);
    const registry = await readRegistry(client);
    const record = registry.projects.find((item) => item.projectId === projectId);
    const binding = record?.bindings[hostId];
    const inspected = record ? await inspectBinding(record, binding) : { status: 'missing' as const, revisionVerified: false };
    return {
        projectId,
        exists: Boolean(record),
        bindingStatus: inspected.status,
        stateHash: hashWriteState(record ?? { projectId, missing: true }),
        record,
    };
}

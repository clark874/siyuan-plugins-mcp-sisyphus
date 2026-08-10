import type { SiYuanClient } from '../api/client';
import * as archiveApi from '../api/archive';
import * as packagesApi from '../api/packages';
import * as settingsApi from '../api/settings';
import * as snippetsApi from '../api/snippets';
import * as workspaceFilesApi from '../api/workspace-files';
import { secureRandomUUID, sha256Bytes } from '../shared/crypto';
import * as pluginStorage from './plugin-storage';
import * as records from './record-storage';
import {
    assertNoSecretLikeText,
    assertReadablePluginFile,
    assertSafePluginName,
    assertSafeSettingPatch,
    MAX_PLUGIN_FILE_BYTES,
    normalizePluginRelativePath,
    stateHash,
} from './security';

const MAX_PACKAGE_BACKUP_BYTES = 256 * 1024 * 1024;
const MAX_PACKAGE_ARCHIVE_BYTES = MAX_PACKAGE_BACKUP_BYTES + 16 * 1024 * 1024;
const MAX_PACKAGE_FILE_BYTES = 64 * 1024 * 1024;
const MAX_PACKAGE_TREE_ENTRIES = 10_000;
const MAX_PACKAGE_TREE_DEPTH = 24;
const ACTIVE_CONTROL_TARGETS = new Set<string>();

export type ChangeRequest =
    | { kind: 'plugin_state'; pluginName: string; enabled: boolean; frontend?: string }
    | { kind: 'snippet_upsert'; snippet: snippetsApi.SiYuanSnippet }
    | { kind: 'snippet_remove'; snippetID: string }
    | { kind: 'plugin_storage_write'; pluginName: string; path: string; content: string; frontend?: string }
    | { kind: 'plugin_install'; packageName: string; repoURL: string; repoHash: string; frontend?: string }
    | { kind: 'plugin_uninstall'; pluginName: string; frontend?: string }
    | { kind: 'setting_patch'; section: settingsApi.ControlledSettingSection; patch: Record<string, unknown> };

export interface ChangePlan {
    id: string;
    status: 'planned' | 'applying' | 'applied' | 'failed' | 'discarded' | 'expired';
    createdAt: string;
    expiresAt: string;
    kind: ChangeRequest['kind'];
    target: string;
    request: ChangeRequest;
    beforeHash: string;
    beforeState: unknown;
    riskSummary: string[];
    diffSummary: Record<string, unknown>;
    expectedPackageVersion?: string;
    changeID?: string;
}

export interface ChangeRecord {
    id: string;
    planID: string;
    kind: ChangeRequest['kind'];
    target: string;
    status: 'applied' | 'rolling_back' | 'rolled_back' | 'rollback_failed' | 'verification_failed';
    appliedAt: string;
    rolledBackAt?: string;
    beforeHash: string;
    afterHash?: string;
    beforeState: unknown;
    afterState?: unknown;
    request: ChangeRequest;
    verification: { ok: boolean; message: string };
    rollbackVerification?: { ok: boolean; message: string };
    packageBackupPath?: string;
    packageBackupHash?: string;
    packageBackupBytes?: number;
    expectedPackageVersion?: string;
}

function frontendOf(request: ChangeRequest): string {
    return 'frontend' in request ? request.frontend ?? 'desktop' : 'desktop';
}

function normalizePluginState(plugin: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!plugin) return null;
    return {
        name: typeof plugin.name === 'string' ? plugin.name : undefined,
        version: typeof plugin.version === 'string' ? plugin.version : undefined,
        repoURL: typeof plugin.repoURL === 'string' ? plugin.repoURL : undefined,
        repoHash: typeof plugin.repoHash === 'string' ? plugin.repoHash : undefined,
        enabled: plugin.enabled === true,
        installSize: typeof plugin.installSize === 'number' ? plugin.installSize : undefined,
    };
}

async function packageTreeState(
    client: SiYuanClient,
    packageName: string,
    parentRoot = '/data/plugins',
): Promise<Record<string, unknown>> {
    const safeName = assertSafePluginName(packageName);
    const packageRoots = await workspaceFilesApi.readDir(client, parentRoot);
    const packageRoot = packageRoots.find((entry) => entry.name === safeName);
    if (!packageRoot) throw new Error(`Installed package directory not found: ${safeName}`);
    if (packageRoot.isSymlink) throw new Error('Installed package root is a symbolic link and cannot be controlled safely.');
    if (!packageRoot.isDir) throw new Error('Installed package root must be a directory.');

    const manifest: Array<Record<string, unknown>> = [];
    let totalBytes = 0;
    const walk = async (absolutePath: string, relativeParent: string, depth: number): Promise<void> => {
        if (depth > MAX_PACKAGE_TREE_DEPTH) throw new Error('Installed package tree exceeds the safe snapshot depth.');
        const entries = (await workspaceFilesApi.readDir(client, absolutePath))
            .slice()
            .sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
            if (manifest.length >= MAX_PACKAGE_TREE_ENTRIES) throw new Error('Installed package tree exceeds the safe snapshot entry limit.');
            if (entry.isSymlink) throw new Error('Installed package contains a symbolic link and cannot be snapshotted safely.');
            const relativePath = relativeParent ? `${relativeParent}/${entry.name}` : entry.name;
            if (entry.isDir) {
                manifest.push({ path: relativePath, type: 'directory' });
                await walk(`${absolutePath}/${entry.name}`, relativePath, depth + 1);
                continue;
            }
            const read = await client.readFileBinaryLimited(`${absolutePath}/${entry.name}`, MAX_PACKAGE_FILE_BYTES);
            totalBytes += read.byteLength;
            if (totalBytes > MAX_PACKAGE_BACKUP_BYTES) {
                throw new Error(`Installed package content exceeds the ${MAX_PACKAGE_BACKUP_BYTES}-byte verification limit.`);
            }
            manifest.push({ path: relativePath, type: 'file', bytes: read.byteLength, sha256: `sha256:${sha256Bytes(read.content)}` });
        }
    };
    await walk(`${parentRoot}/${safeName}`, '', 0);
    return {
        treeHash: stateHash(manifest),
        treeEntries: manifest.length,
        treeBytes: totalBytes,
    };
}

async function validatePackageBackup(
    client: SiYuanClient,
    changeID: string,
    packageName: string,
    backupPath: string,
    beforeState: Record<string, unknown>,
): Promise<void> {
    const validationRoot = `${records.CONTROL_PLANE_ROOT}/backup-validation/${changeID}`;
    await client.writeFile(`${validationRoot}/.keep`, '');
    try {
        await archiveApi.unzipWorkspaceEntry(client, backupPath, validationRoot);
        const extracted = await packageTreeState(client, packageName, validationRoot);
        if (extracted.treeHash !== beforeState.treeHash
            || extracted.treeEntries !== beforeState.treeEntries
            || extracted.treeBytes !== beforeState.treeBytes) {
            throw new Error('Extracted package backup does not match the planned pre-change content manifest.');
        }
    } finally {
        await workspaceFilesApi.removeFile(client, validationRoot).catch(() => undefined);
    }
}

async function readPackageState(client: SiYuanClient, packageName: string, frontend: string): Promise<Record<string, unknown> | null> {
    const plugin = await packagesApi.getInstalledPlugin(client, packageName, frontend);
    const normalized = normalizePluginState(plugin);
    if (!normalized) return null;
    assertPackageBackupMetadata(normalized);
    const treeState = await packageTreeState(client, packageName);
    const descriptorRead = await client.readFileTextLimited(`/data/plugins/${assertSafePluginName(packageName)}/plugin.json`, MAX_PLUGIN_FILE_BYTES);
    let descriptor: Record<string, unknown>;
    try {
        const parsed = JSON.parse(descriptorRead.content) as unknown;
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
        descriptor = parsed as Record<string, unknown>;
    } catch {
        throw new Error('Installed package plugin.json is not valid JSON.');
    }
    return {
        ...normalized,
        descriptor: {
            name: typeof descriptor.name === 'string' ? descriptor.name : undefined,
            version: typeof descriptor.version === 'string' ? descriptor.version : undefined,
            url: typeof descriptor.url === 'string' ? descriptor.url : undefined,
        },
        ...treeState,
    };
}

function targetOf(request: ChangeRequest): string {
    switch (request.kind) {
        case 'plugin_state': return `plugin:${request.pluginName}`;
        case 'snippet_upsert': return 'snippets:collection';
        case 'snippet_remove': return 'snippets:collection';
        case 'plugin_storage_write': return `plugin-storage:${request.pluginName}/${request.path}`;
        case 'plugin_install': return `plugin:${request.packageName}`;
        case 'plugin_uninstall': return `plugin:${request.pluginName}`;
        case 'setting_patch': return `setting:${request.section}`;
    }
}

function deepMerge(base: unknown, patch: unknown): unknown {
    if (Array.isArray(patch)) return structuredClone(patch);
    if (patch !== null && typeof patch === 'object') {
        const baseObject = base !== null && typeof base === 'object' && !Array.isArray(base)
            ? base as Record<string, unknown>
            : {};
        return Object.fromEntries(Object.entries(patch as Record<string, unknown>).map(([key, value]) => [
            key,
            deepMerge(baseObject[key], value),
        ]).concat(Object.entries(baseObject).filter(([key]) => !(key in (patch as Record<string, unknown>)))));
    }
    return patch;
}

function deepContains(actual: unknown, expected: unknown): boolean {
    if (Array.isArray(expected)) {
        return Array.isArray(actual) && stateHash(actual) === stateHash(expected);
    }
    if (expected !== null && typeof expected === 'object') {
        if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) return false;
        return Object.entries(expected as Record<string, unknown>)
            .every(([key, value]) => deepContains((actual as Record<string, unknown>)[key], value));
    }
    return Object.is(actual, expected);
}

async function readTargetState(client: SiYuanClient, request: ChangeRequest): Promise<unknown> {
    switch (request.kind) {
        case 'plugin_state':
            return normalizePluginState(await packagesApi.getInstalledPlugin(client, request.pluginName, frontendOf(request)));
        case 'snippet_upsert':
        case 'snippet_remove':
            return snippetsApi.getSnippets(client, 'all', 2, '');
        case 'plugin_storage_write':
            return pluginStorage.readPluginStorageRawForControl(client, {
                pluginName: request.pluginName,
                path: request.path,
                frontend: frontendOf(request),
                allowMissingFile: true,
            });
        case 'plugin_install':
            return readPackageState(client, request.packageName, frontendOf(request));
        case 'plugin_uninstall':
            return readPackageState(client, request.pluginName, frontendOf(request));
        case 'setting_patch':
            return settingsApi.getControlledSetting(client, request.section);
    }
}

function validateRequest(request: ChangeRequest, beforeState: unknown): void {
    switch (request.kind) {
        case 'plugin_state':
            assertSafePluginName(request.pluginName);
            if (!beforeState) throw new Error(`Installed plugin not found: ${request.pluginName}`);
            return;
        case 'snippet_upsert':
            if (!request.snippet.id.trim() || !request.snippet.name.trim()) throw new Error('Snippet ID and name are required.');
            if (request.snippet.content.length > MAX_PLUGIN_FILE_BYTES) throw new Error('Snippet content exceeds the 128 KiB limit.');
            assertNoSecretLikeText(request.snippet.content);
            if (request.snippet.type === 'css' && /<\/style|<script/i.test(request.snippet.content)) {
                throw new Error('CSS snippets cannot contain </style or <script.');
            }
            return;
        case 'snippet_remove': {
            const snippets = beforeState as snippetsApi.SiYuanSnippet[];
            if (!snippets.some((snippet) => snippet.id === request.snippetID)) throw new Error(`Snippet not found: ${request.snippetID}`);
            return;
        }
        case 'plugin_storage_write': {
            assertSafePluginName(request.pluginName);
            request.path = normalizePluginRelativePath(request.path);
            assertReadablePluginFile(request.path);
            if (new TextEncoder().encode(request.content).byteLength > MAX_PLUGIN_FILE_BYTES) {
                throw new Error('Plugin configuration exceeds the 128 KiB limit.');
            }
            assertNoSecretLikeText(request.content);
            return;
        }
        case 'plugin_install': {
            assertSafePluginName(request.packageName);
            if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(request.repoURL)) {
                throw new Error('Plugin installation is restricted to an explicit HTTPS GitHub repository URL.');
            }
            if (!/^[A-Fa-f0-9]{7,64}$/.test(request.repoHash)) throw new Error('repoHash must be an explicit hexadecimal revision.');
            if (beforeState) assertPackageBackupMetadata(beforeState as Record<string, unknown>);
            return;
        }
        case 'plugin_uninstall': {
            assertSafePluginName(request.pluginName);
            if (!beforeState) throw new Error(`Installed plugin not found: ${request.pluginName}`);
            assertPackageBackupMetadata(beforeState as Record<string, unknown>);
            return;
        }
        case 'setting_patch':
            assertSafeSettingPatch(request.section, request.patch);
            return;
    }
}

function assertPackageBackupMetadata(before: Record<string, unknown>): void {
    if (typeof before.installSize !== 'number' || !Number.isFinite(before.installSize) || before.installSize < 0) {
        throw new Error('Installed package size metadata is unavailable; reversible package planning is refused.');
    }
    if (before.installSize > MAX_PACKAGE_BACKUP_BYTES) {
        throw new Error(`Installed package exceeds the ${MAX_PACKAGE_BACKUP_BYTES}-byte snapshot limit.`);
    }
}

function diffSummary(request: ChangeRequest, beforeState: unknown): Record<string, unknown> {
    switch (request.kind) {
        case 'plugin_state': return { from: (beforeState as Record<string, unknown>).enabled, to: request.enabled };
        case 'snippet_upsert': return { operation: (beforeState as snippetsApi.SiYuanSnippet[]).some((snippet) => snippet.id === request.snippet.id) ? 'update' : 'create', id: request.snippet.id, name: request.snippet.name, contentHash: stateHash(request.snippet.content) };
        case 'snippet_remove': return { operation: 'remove', id: request.snippetID };
        case 'plugin_storage_write': return { operation: (beforeState as { exists: boolean }).exists ? 'replace' : 'create', path: request.path, contentHash: stateHash(request.content) };
        case 'plugin_install': return { operation: beforeState ? 'update' : 'install', packageName: request.packageName, repoURL: request.repoURL, repoHash: request.repoHash };
        case 'plugin_uninstall': return { operation: 'uninstall', pluginName: request.pluginName, installedVersion: (beforeState as Record<string, unknown>).version };
        case 'setting_patch': return { section: request.section, changedKeys: Object.keys(request.patch).sort() };
    }
}

function risksFor(request: ChangeRequest): string[] {
    const common = ['Execution rechecks the current state hash and refuses stale plans.', 'A verified pre-change snapshot is retained for explicit rollback.'];
    switch (request.kind) {
        case 'plugin_install':
        case 'plugin_uninstall': return ['Plugin code and availability will change.', ...common];
        case 'snippet_upsert':
        case 'snippet_remove': return ['CSS or JavaScript behavior in SiYuan may change immediately.', ...common];
        case 'setting_patch': return ['SiYuan behavior may change immediately and the kernel may normalize values.', ...common];
        default: return common;
    }
}

export async function planChange(client: SiYuanClient, request: ChangeRequest, ttlMinutes = 30): Promise<ChangePlan> {
    const beforeState = await readTargetState(client, request);
    validateRequest(request, beforeState);
    let expectedPackageVersion: string | undefined;
    if (request.kind === 'plugin_install') {
        const candidates = await packagesApi.getBazaarPlugins(client, request.packageName, frontendOf(request));
        const target = candidates.find((candidate) => candidate.name === request.packageName
            && candidate.repoURL === request.repoURL
            && candidate.repoHash === request.repoHash);
        if (!target || typeof target.version !== 'string' || !target.version.trim()) {
            throw new Error('The requested plugin revision is not present in the current SiYuan Bazaar metadata.');
        }
        expectedPackageVersion = target.version;
    }
    const now = new Date();
    const plan: ChangePlan = {
        id: secureRandomUUID(),
        status: 'planned',
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + Math.max(1, Math.min(ttlMinutes, 1440)) * 60_000).toISOString(),
        kind: request.kind,
        target: targetOf(request),
        request,
        beforeHash: stateHash(beforeState),
        beforeState,
        riskSummary: risksFor(request),
        diffSummary: diffSummary(request, beforeState),
        expectedPackageVersion,
    };
    if (expectedPackageVersion) plan.diffSummary.availableVersion = expectedPackageVersion;
    await records.writeRecord(client, 'plans', plan.id, plan);
    return plan;
}

async function executeRequest(client: SiYuanClient, request: ChangeRequest, beforeState: unknown): Promise<void> {
    switch (request.kind) {
        case 'plugin_state':
            await packagesApi.setPluginEnabled(client, request.pluginName, request.enabled);
            return;
        case 'snippet_upsert': {
            const snippets = beforeState as snippetsApi.SiYuanSnippet[];
            const next = snippets.filter((snippet) => snippet.id !== request.snippet.id).concat(request.snippet);
            await snippetsApi.setSnippets(client, next);
            return;
        }
        case 'snippet_remove':
            await snippetsApi.setSnippets(client, (beforeState as snippetsApi.SiYuanSnippet[]).filter((snippet) => snippet.id !== request.snippetID));
            return;
        case 'plugin_storage_write': {
            const resolved = await pluginStorage.resolvePluginStorageFileForControl(client, {
                pluginName: request.pluginName,
                path: request.path,
                frontend: frontendOf(request),
                allowMissingFile: true,
            });
            await client.writeFile(resolved.absolutePath, request.content);
            return;
        }
        case 'plugin_install':
            await packagesApi.installPlugin(client, {
                frontend: frontendOf(request),
                packageName: request.packageName,
                repoURL: request.repoURL,
                repoHash: request.repoHash,
            });
            return;
        case 'plugin_uninstall':
            await packagesApi.uninstallPlugin(client, request.pluginName);
            return;
        case 'setting_patch': {
            const next = deepMerge(beforeState, request.patch) as Record<string, unknown>;
            await settingsApi.setControlledSetting(client, request.section, next);
            return;
        }
    }
}

/** @internal 导出仅用于对关键核验规则进行独立回归测试。 */
export function verifyApplied(request: ChangeRequest, afterState: unknown, expectedPackageVersion?: string): boolean {
    switch (request.kind) {
        case 'plugin_state': return (afterState as Record<string, unknown> | null)?.enabled === request.enabled;
        case 'snippet_upsert': return (afterState as snippetsApi.SiYuanSnippet[]).some((snippet) => stateHash(snippet) === stateHash(request.snippet));
        case 'snippet_remove': return !(afterState as snippetsApi.SiYuanSnippet[]).some((snippet) => snippet.id === request.snippetID);
        case 'plugin_storage_write': return (afterState as { exists: boolean; content?: string }).exists && (afterState as { content?: string }).content === request.content;
        case 'plugin_install': {
            const state = afterState as Record<string, unknown> | null;
            const descriptor = state?.descriptor as Record<string, unknown> | undefined;
            return state?.name === request.packageName
                && state.repoHash === request.repoHash
                && typeof expectedPackageVersion === 'string'
                && state.version === expectedPackageVersion
                && descriptor?.name === request.packageName
                && descriptor.version === expectedPackageVersion
                && typeof state.treeHash === 'string'
                && typeof state.treeEntries === 'number'
                && state.treeEntries > 0;
        }
        case 'plugin_uninstall': return afterState === null;
        case 'setting_patch': return deepContains(afterState, request.patch);
    }
}

async function restoreBeforeState(
    client: SiYuanClient,
    request: ChangeRequest,
    beforeState: unknown,
    packageBackupPath?: string,
    packageBackupHash?: string,
    packageBackupBytes?: number,
): Promise<void> {
    const verifyPackageBackup = async (): Promise<void> => {
        if (!packageBackupPath || !packageBackupHash || !packageBackupBytes) {
            throw new Error('Exact package backup metadata is missing.');
        }
        const backup = await client.readFileBinaryLimited(packageBackupPath, MAX_PACKAGE_ARCHIVE_BYTES);
        const actualHash = `sha256:${sha256Bytes(backup.content)}`;
        if (backup.byteLength !== packageBackupBytes || actualHash !== packageBackupHash) {
            throw new Error('Exact package backup failed integrity verification.');
        }
    };
    switch (request.kind) {
        case 'plugin_state':
            await packagesApi.setPluginEnabled(client, request.pluginName, (beforeState as Record<string, unknown>).enabled === true);
            return;
        case 'snippet_upsert':
        case 'snippet_remove':
            await snippetsApi.setSnippets(client, beforeState as snippetsApi.SiYuanSnippet[]);
            return;
        case 'plugin_storage_write': {
            const before = beforeState as { absolutePath: string; exists: boolean; content?: string };
            if (before.exists) await client.writeFile(before.absolutePath, before.content ?? '');
            else {
                const current = await pluginStorage.readPluginStorageRawForControl(client, {
                    pluginName: request.pluginName,
                    path: request.path,
                    frontend: frontendOf(request),
                    allowMissingFile: true,
                });
                if (current.exists) await workspaceFilesApi.removeFile(client, before.absolutePath);
            }
            return;
        }
        case 'plugin_install': {
            if (beforeState === null) {
                await packagesApi.uninstallPlugin(client, request.packageName);
                return;
            }
            const before = beforeState as Record<string, unknown>;
            await verifyPackageBackup();
            if (await packagesApi.getInstalledPlugin(client, request.packageName, frontendOf(request))) {
                await packagesApi.uninstallPlugin(client, request.packageName);
            }
            await archiveApi.unzipWorkspaceEntry(client, packageBackupPath as string, '/data/plugins');
            await packagesApi.setPluginEnabled(client, request.packageName, before.enabled === true);
            return;
        }
        case 'plugin_uninstall': {
            const before = beforeState as Record<string, unknown>;
            await verifyPackageBackup();
            if (await packagesApi.getInstalledPlugin(client, request.pluginName, frontendOf(request))) {
                await packagesApi.uninstallPlugin(client, request.pluginName);
            }
            await archiveApi.unzipWorkspaceEntry(client, packageBackupPath as string, '/data/plugins');
            await packagesApi.setPluginEnabled(client, request.pluginName, before.enabled === true);
            return;
        }
        case 'setting_patch':
            await settingsApi.setControlledSetting(client, request.section, beforeState as Record<string, unknown>);
            return;
    }
}

async function withControlTargetLock<T>(client: SiYuanClient, target: string, task: () => Promise<T>): Promise<T> {
    if (ACTIVE_CONTROL_TARGETS.has(target)) {
        throw new Error(`A control-plane operation is already in progress for target: ${target}`);
    }
    ACTIVE_CONTROL_TARGETS.add(target);
    let persistentLock: records.ControlTargetLock | undefined;
    try {
        persistentLock = await records.acquireTargetLock(client, target);
        return await task();
    } finally {
        if (persistentLock) {
            await records.releaseTargetLock(client, persistentLock).catch((error) => {
                console.error(`[MCP] Failed to release control-plane lock for ${target}:`, error);
            });
        }
        ACTIVE_CONTROL_TARGETS.delete(target);
    }
}

export function publicPlan(plan: ChangePlan): Record<string, unknown> {
    return {
        id: plan.id,
        status: plan.status,
        createdAt: plan.createdAt,
        expiresAt: plan.expiresAt,
        kind: plan.kind,
        target: plan.target,
        beforeHash: plan.beforeHash,
        riskSummary: plan.riskSummary,
        diffSummary: plan.diffSummary,
        changeID: plan.changeID,
    };
}

export function publicChange(change: ChangeRecord): Record<string, unknown> {
    return {
        id: change.id,
        planID: change.planID,
        kind: change.kind,
        target: change.target,
        status: change.status,
        appliedAt: change.appliedAt,
        rolledBackAt: change.rolledBackAt,
        beforeHash: change.beforeHash,
        afterHash: change.afterHash,
        verification: change.verification,
        rollbackVerification: change.rollbackVerification,
    };
}

async function applyChangeLocked(client: SiYuanClient, planID: string): Promise<Record<string, unknown>> {
    const plan = await records.readRecord<ChangePlan>(client, 'plans', planID);
    if (plan.status !== 'planned') throw new Error(`Change plan is not executable: ${plan.status}`);
    if (Date.now() > Date.parse(plan.expiresAt)) {
        plan.status = 'expired';
        await records.writeRecord(client, 'plans', plan.id, plan);
        throw new Error('Change plan has expired; create a new plan.');
    }
    const current = await readTargetState(client, plan.request);
    if (stateHash(current) !== plan.beforeHash) throw new Error('Target state changed after planning; create a new plan.');

    const change: ChangeRecord = {
        id: secureRandomUUID(),
        planID: plan.id,
        kind: plan.kind,
        target: plan.target,
        status: 'verification_failed',
        appliedAt: new Date().toISOString(),
        beforeHash: plan.beforeHash,
        beforeState: plan.beforeState,
        request: plan.request,
        expectedPackageVersion: plan.expectedPackageVersion,
        verification: { ok: false, message: 'Execution has not been verified.' },
    };
    plan.status = 'applying';
    await records.writeRecord(client, 'plans', plan.id, plan);
    try {
        const packageName = plan.request.kind === 'plugin_uninstall'
            ? plan.request.pluginName
            : plan.request.kind === 'plugin_install' && plan.beforeState !== null
                ? plan.request.packageName
                : undefined;
        if (packageName) {
            const backupPath = `${records.CONTROL_PLANE_ROOT}/backups/${change.id}.zip`;
            await client.writeFile(`${records.CONTROL_PLANE_ROOT}/backups/.keep`, '');
            await archiveApi.zipWorkspaceEntry(client, `/data/plugins/${assertSafePluginName(packageName)}`, backupPath);
            const backup = await client.readFileBinaryLimited(backupPath, MAX_PACKAGE_ARCHIVE_BYTES);
            if (backup.byteLength < 22) throw new Error('Exact package backup is missing or too small to be a valid ZIP archive.');
            change.packageBackupPath = backupPath;
            change.packageBackupBytes = backup.byteLength;
            change.packageBackupHash = `sha256:${sha256Bytes(backup.content)}`;
            await validatePackageBackup(
                client,
                change.id,
                packageName,
                backupPath,
                plan.beforeState as Record<string, unknown>,
            );
        }
        await executeRequest(client, plan.request, plan.beforeState);
        const afterState = await readTargetState(client, plan.request);
        change.afterState = afterState;
        change.afterHash = stateHash(afterState);
        const verified = verifyApplied(plan.request, afterState, plan.expectedPackageVersion);
        change.verification = { ok: verified, message: verified ? 'Target state matches the planned result.' : 'Target state does not match the planned result.' };
        if (!verified) throw new Error(change.verification.message);
        change.status = 'applied';
        plan.status = 'applied';
        plan.changeID = change.id;
        await records.writeRecord(client, 'changes', change.id, change);
        await records.writeRecord(client, 'plans', plan.id, plan);
        return publicChange(change);
    } catch (error) {
        try {
            let restored = await readTargetState(client, plan.request);
            if (stateHash(restored) !== plan.beforeHash) {
                await restoreBeforeState(
                    client,
                    plan.request,
                    plan.beforeState,
                    change.packageBackupPath,
                    change.packageBackupHash,
                    change.packageBackupBytes,
                );
                restored = await readTargetState(client, plan.request);
            }
            const rollbackOK = stateHash(restored) === plan.beforeHash;
            change.rollbackVerification = { ok: rollbackOK, message: rollbackOK ? 'Automatic recovery restored the pre-change state.' : 'Automatic recovery did not restore the exact pre-change state.' };
            if (!rollbackOK) change.status = 'rollback_failed';
        } catch (rollbackError) {
            change.status = 'rollback_failed';
            change.rollbackVerification = { ok: false, message: rollbackError instanceof Error ? rollbackError.message : String(rollbackError) };
        }
        plan.status = 'failed';
        plan.changeID = change.id;
        await records.writeRecord(client, 'changes', change.id, change);
        await records.writeRecord(client, 'plans', plan.id, plan);
        throw new Error(`Change ${change.id} failed verification; ${change.rollbackVerification?.message ?? 'automatic recovery failed'}. Cause: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function applyChange(client: SiYuanClient, planID: string): Promise<Record<string, unknown>> {
    const plan = await records.readRecord<ChangePlan>(client, 'plans', planID);
    return withControlTargetLock(client, plan.target, () => applyChangeLocked(client, planID));
}

async function rollbackChangeLocked(client: SiYuanClient, changeID: string): Promise<Record<string, unknown>> {
    const change = await records.readRecord<ChangeRecord>(client, 'changes', changeID);
    if (!change.afterHash) throw new Error('Change has no verified post-change state hash and cannot be rolled back safely.');
    const current = await readTargetState(client, change.request);
    const currentHash = stateHash(current);
    const packageRecovery = change.request.kind === 'plugin_install' || change.request.kind === 'plugin_uninstall';
    if (change.status === 'applied') {
        if (currentHash !== change.afterHash) {
            throw new Error('Target state changed after this operation; rollback is refused to protect newer changes.');
        }
    } else if (change.status === 'rolling_back' || change.status === 'rollback_failed') {
        if (currentHash === change.beforeHash) {
            change.rollbackVerification = { ok: true, message: 'Pre-change state was already restored and has now been verified.' };
            change.rolledBackAt = new Date().toISOString();
            change.status = 'rolled_back';
            await records.writeRecord(client, 'changes', change.id, change);
            return publicChange(change);
        }
        if (currentHash !== change.afterHash && !packageRecovery) {
            throw new Error('Failed rollback cannot be retried because the target is neither the verified before-state nor after-state.');
        }
    } else {
        throw new Error(`Change is not rollbackable in its current state: ${change.status}`);
    }
    change.status = 'rolling_back';
    await records.writeRecord(client, 'changes', change.id, change);
    try {
        await restoreBeforeState(
            client,
            change.request,
            change.beforeState,
            change.packageBackupPath,
            change.packageBackupHash,
            change.packageBackupBytes,
        );
        const restored = await readTargetState(client, change.request);
        const ok = stateHash(restored) === change.beforeHash;
        change.rollbackVerification = { ok, message: ok ? 'Pre-change state restored and verified.' : 'Rollback did not restore the exact pre-change state.' };
        change.rolledBackAt = new Date().toISOString();
        change.status = ok ? 'rolled_back' : 'rollback_failed';
        await records.writeRecord(client, 'changes', change.id, change);
        if (!ok) throw new Error(`Rollback verification failed for change ${change.id}.`);
        return publicChange(change);
    } catch (error) {
        change.rollbackVerification = { ok: false, message: error instanceof Error ? error.message : String(error) };
        change.rolledBackAt = new Date().toISOString();
        change.status = 'rollback_failed';
        await records.writeRecord(client, 'changes', change.id, change);
        throw new Error(`Rollback failed for change ${change.id}: ${change.rollbackVerification.message}`);
    }
}

export async function rollbackChange(client: SiYuanClient, changeID: string): Promise<Record<string, unknown>> {
    const change = await records.readRecord<ChangeRecord>(client, 'changes', changeID);
    return withControlTargetLock(client, change.target, () => rollbackChangeLocked(client, changeID));
}

async function discardPlanLocked(client: SiYuanClient, planID: string): Promise<Record<string, unknown>> {
    const plan = await records.readRecord<ChangePlan>(client, 'plans', planID);
    if (plan.status !== 'planned' && plan.status !== 'expired') throw new Error(`Plan cannot be discarded in its current state: ${plan.status}`);
    plan.status = 'discarded';
    await records.writeRecord(client, 'plans', plan.id, plan);
    return publicPlan(plan);
}

export async function discardPlan(client: SiYuanClient, planID: string): Promise<Record<string, unknown>> {
    const plan = await records.readRecord<ChangePlan>(client, 'plans', planID);
    return withControlTargetLock(client, plan.target, () => discardPlanLocked(client, planID));
}

export async function getControlRecord(client: SiYuanClient, kind: 'plan' | 'change', id: string): Promise<Record<string, unknown>> {
    return kind === 'plan'
        ? publicPlan(await records.readRecord<ChangePlan>(client, 'plans', id))
        : publicChange(await records.readRecord<ChangeRecord>(client, 'changes', id));
}

export async function listControlRecords(
    client: SiYuanClient,
    kind: 'plan' | 'change' | 'all',
): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    if (kind === 'plan' || kind === 'all') {
        for (const id of await records.listRecordIDs(client, 'plans')) {
            try { items.push(publicPlan(await records.readRecord<ChangePlan>(client, 'plans', id))); } catch { /* 忽略损坏记录并继续审计 */ }
        }
    }
    if (kind === 'change' || kind === 'all') {
        for (const id of await records.listRecordIDs(client, 'changes')) {
            try { items.push(publicChange(await records.readRecord<ChangeRecord>(client, 'changes', id))); } catch { /* 忽略损坏记录并继续审计 */ }
        }
    }
    return items.sort((left, right) => String(right.appliedAt ?? right.createdAt ?? '').localeCompare(String(left.appliedAt ?? left.createdAt ?? '')));
}

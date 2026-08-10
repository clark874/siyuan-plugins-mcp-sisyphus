import type { SiYuanClient } from '../api/client';
import * as packagesApi from '../api/packages';
import * as workspaceFilesApi from '../api/workspace-files';
import { getPluginStorageRoot } from './adapters';
import {
    assertReadablePluginFile,
    assertSafePluginName,
    MAX_PLUGIN_FILE_BYTES,
    MAX_PLUGIN_LIST_DEPTH,
    MAX_PLUGIN_LIST_ENTRIES,
    normalizePluginRelativePath,
    PLUGIN_STORAGE_ROOT,
    redactText,
    truncateContent,
} from './security';

export interface PluginStorageEntry extends workspaceFilesApi.WorkspaceDirEntry {
    path: string;
    depth: number;
}

const CONTROL_PLANE_OWNER = 'siyuan-plugins-mcp-sisyphus';
const CONTROL_PLANE_PRIVATE_DIR = 'control-plane';

function assertPublicStoragePath(storageRootName: string, relativePath: string): void {
    if (storageRootName === CONTROL_PLANE_OWNER
        && (relativePath === CONTROL_PLANE_PRIVATE_DIR || relativePath.startsWith(`${CONTROL_PLANE_PRIVATE_DIR}/`))) {
        throw new Error('Control-plane audit records are private and cannot be browsed through plugin storage tools.');
    }
}

async function assertStorageRootDirectory(client: SiYuanClient, storageRootName: string): Promise<void> {
    const roots = await workspaceFilesApi.readDir(client, PLUGIN_STORAGE_ROOT);
    const root = roots.find((entry) => entry.name === storageRootName);
    if (!root) throw new Error(`Plugin storage root does not exist: ${storageRootName}`);
    if (root.isSymlink) throw new Error('Symbolic links are not allowed as plugin storage roots.');
    if (!root.isDir) throw new Error('Plugin storage root must be a directory.');
}

export async function resolvePluginStorage(
    client: SiYuanClient,
    pluginName: string,
    frontend = 'desktop',
): Promise<{ plugin: Record<string, unknown>; storageRootName: string; storageRoot: string }> {
    const safeName = assertSafePluginName(pluginName);
    const plugin = await packagesApi.getInstalledPlugin(client, safeName, frontend);
    if (!plugin) throw new Error(`Installed plugin not found: ${safeName}`);
    const storageRootName = assertSafePluginName(getPluginStorageRoot(safeName));
    await assertStorageRootDirectory(client, storageRootName);
    return { plugin, storageRootName, storageRoot: `${PLUGIN_STORAGE_ROOT}/${storageRootName}` };
}

async function assertNoSymlinkInPath(
    client: SiYuanClient,
    root: string,
    relativePath: string,
): Promise<void> {
    let parent = root;
    for (const segment of relativePath.split('/').filter(Boolean)) {
        const entries = await workspaceFilesApi.readDir(client, parent);
        const entry = entries.find((candidate) => candidate.name === segment);
        if (!entry) throw new Error(`Plugin storage path does not exist: ${relativePath}`);
        if (entry.isSymlink) throw new Error('Symbolic links are not allowed in plugin storage paths.');
        parent = `${parent}/${segment}`;
    }
}

export async function resolvePluginStorageFileForControl(
    client: SiYuanClient,
    input: { pluginName: string; path: string; frontend?: string; allowMissingFile?: boolean },
): Promise<{ storageRootName: string; relativePath: string; absolutePath: string; exists: boolean }> {
    const relativePath = normalizePluginRelativePath(input.path);
    if (!relativePath) throw new Error('A plugin storage file path is required.');
    assertReadablePluginFile(relativePath);
    assertPublicStoragePath(assertSafePluginName(input.pluginName), relativePath);
    const { storageRootName, storageRoot } = await resolvePluginStorage(client, input.pluginName, input.frontend);
    assertPublicStoragePath(storageRootName, relativePath);
    const segments = relativePath.split('/');
    let parent = storageRoot;
    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        let entries: workspaceFilesApi.WorkspaceDirEntry[];
        try {
            entries = await workspaceFilesApi.readDir(client, parent);
        } catch (error) {
            if (input.allowMissingFile && index === segments.length - 1) {
                return { storageRootName, relativePath, absolutePath: `${storageRoot}/${relativePath}`, exists: false };
            }
            throw error;
        }
        const entry = entries.find((candidate) => candidate.name === segment);
        if (!entry) {
            if (input.allowMissingFile && index === segments.length - 1) {
                return { storageRootName, relativePath, absolutePath: `${storageRoot}/${relativePath}`, exists: false };
            }
            throw new Error(`Plugin storage path does not exist: ${relativePath}`);
        }
        if (entry.isSymlink) throw new Error('Symbolic links are not allowed in plugin storage paths.');
        if (index < segments.length - 1 && !entry.isDir) {
            throw new Error(`Plugin storage parent is not a directory: ${segment}`);
        }
        if (index === segments.length - 1 && entry.isDir) {
            throw new Error('Plugin storage target must be a file.');
        }
        parent = `${parent}/${segment}`;
    }
    return { storageRootName, relativePath, absolutePath: `${storageRoot}/${relativePath}`, exists: true };
}

export async function readPluginStorageRawForControl(
    client: SiYuanClient,
    input: { pluginName: string; path: string; frontend?: string; allowMissingFile?: boolean },
): Promise<{ storageRootName: string; relativePath: string; absolutePath: string; exists: boolean; content?: string }> {
    const resolved = await resolvePluginStorageFileForControl(client, input);
    if (!resolved.exists) return resolved;
    const read = await client.readFileTextLimited(resolved.absolutePath, MAX_PLUGIN_FILE_BYTES);
    const redacted = redactText(read.content);
    if (redacted.redacted) {
        throw new Error('Plugin configuration contains sensitive fields and cannot be modified through MCP.');
    }
    return { ...resolved, content: read.content };
}

export async function listPluginStorage(
    client: SiYuanClient,
    input: { pluginName: string; path?: string; recursive?: boolean; maxDepth?: number; frontend?: string },
): Promise<{ storageRootName: string; path: string; entries: PluginStorageEntry[]; truncated: boolean }> {
    const relativePath = normalizePluginRelativePath(input.path);
    assertPublicStoragePath(assertSafePluginName(input.pluginName), relativePath);
    const { storageRootName, storageRoot } = await resolvePluginStorage(client, input.pluginName, input.frontend);
    assertPublicStoragePath(storageRootName, relativePath);
    if (relativePath) await assertNoSymlinkInPath(client, storageRoot, relativePath);
    const startPath = relativePath ? `${storageRoot}/${relativePath}` : storageRoot;
    const maxDepth = Math.max(0, Math.min(MAX_PLUGIN_LIST_DEPTH, input.maxDepth ?? (input.recursive ? 2 : 0)));
    const entries: PluginStorageEntry[] = [];
    let truncated = false;

    const walk = async (absolutePath: string, relativeParent: string, depth: number): Promise<void> => {
        const children = await workspaceFilesApi.readDir(client, absolutePath);
        for (const child of children) {
            if (storageRootName === CONTROL_PLANE_OWNER && !relativeParent && child.name === CONTROL_PLANE_PRIVATE_DIR) {
                continue;
            }
            if (entries.length >= MAX_PLUGIN_LIST_ENTRIES) {
                truncated = true;
                return;
            }
            const path = relativeParent ? `${relativeParent}/${child.name}` : child.name;
            entries.push({ ...child, path, depth });
            if (child.isDir && !child.isSymlink && depth < maxDepth) {
                await walk(`${absolutePath}/${child.name}`, path, depth + 1);
                if (truncated) return;
            }
        }
    };
    await walk(startPath, relativePath, 0);
    return { storageRootName, path: relativePath, entries, truncated };
}

export async function readPluginStorage(
    client: SiYuanClient,
    input: { pluginName: string; path: string; maxChars?: number; frontend?: string },
): Promise<{
    storageRootName: string;
    path: string;
    content: string;
    byteLength: number;
    redacted: boolean;
    truncated: boolean;
    format: 'json' | 'text';
}> {
    const relativePath = normalizePluginRelativePath(input.path);
    if (!relativePath) throw new Error('A plugin storage file path is required.');
    assertReadablePluginFile(relativePath);
    assertPublicStoragePath(assertSafePluginName(input.pluginName), relativePath);
    const { storageRootName, storageRoot } = await resolvePluginStorage(client, input.pluginName, input.frontend);
    assertPublicStoragePath(storageRootName, relativePath);
    await assertNoSymlinkInPath(client, storageRoot, relativePath);
    const read = await client.readFileTextLimited(`${storageRoot}/${relativePath}`, MAX_PLUGIN_FILE_BYTES);
    const redacted = redactText(read.content);
    const truncated = truncateContent(redacted.content, Math.max(1, Math.min(input.maxChars ?? 12_000, 32_000)));
    return {
        storageRootName,
        path: relativePath,
        content: truncated.content,
        byteLength: read.byteLength,
        redacted: redacted.redacted,
        truncated: truncated.truncated,
        format: redacted.format,
    };
}

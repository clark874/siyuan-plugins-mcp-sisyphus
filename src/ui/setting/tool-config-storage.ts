import { getLegacyToolConfigWarning, normalizeToolConfig, type ToolConfig } from './tool-config';

const CONFIG_STORAGE_KEY = 'mcpToolsConfig';
const HTTP_SETTINGS_STORAGE_KEY = 'mcpHttpSettings';
const VERSION_CONTROL_SETTINGS_STORAGE_KEY = 'versionControlSettings';
const PERMISSION_DISPLAY_SETTINGS_STORAGE_KEY = 'permissionDisplaySettings';
const DEFAULT_HTTP_PORT = 36806;
const DEFAULT_HTTP_HOST = '127.0.0.1';

type PluginStorage = {
    loadData?: (storageName: string) => Promise<unknown>;
    saveData?: (storageName: string, content: unknown) => Promise<void>;
};

export interface ToolConfigLoadState { config: ToolConfig; warning: string | null }
export interface VersionControlSettings { enabled: boolean; recentDocumentsEnabled: boolean; showDebugMeta: boolean }
export interface PermissionDisplaySettings { showInFileTree: boolean }

export function buildDefaultPermissionDisplaySettings(): PermissionDisplaySettings { return { showInFileTree: true }; }
export function normalizePermissionDisplaySettings(raw: unknown): PermissionDisplaySettings {
    const defaults = buildDefaultPermissionDisplaySettings();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
    const record = raw as Record<string, unknown>;
    return { showInFileTree: typeof record.showInFileTree === 'boolean' ? record.showInFileTree : defaults.showInFileTree };
}
export function buildDefaultVersionControlSettings(): VersionControlSettings {
    return { enabled: true, recentDocumentsEnabled: true, showDebugMeta: false };
}
export function normalizeVersionControlSettings(raw: unknown): VersionControlSettings {
    const defaults = buildDefaultVersionControlSettings();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
    const record = raw as Record<string, unknown>;
    return {
        enabled: typeof record.enabled === 'boolean' ? record.enabled : defaults.enabled,
        recentDocumentsEnabled: typeof record.recentDocumentsEnabled === 'boolean' ? record.recentDocumentsEnabled : defaults.recentDocumentsEnabled,
        showDebugMeta: typeof record.showDebugMeta === 'boolean' ? record.showDebugMeta : defaults.showDebugMeta,
    };
}

export async function loadPersistedToolConfigState(plugin?: PluginStorage): Promise<ToolConfigLoadState> {
    const raw = await plugin?.loadData?.(CONFIG_STORAGE_KEY);
    return { config: normalizeToolConfig(raw), warning: getLegacyToolConfigWarning(raw, `plugin storage "${CONFIG_STORAGE_KEY}"`) };
}
export async function loadPersistedToolConfig(plugin?: PluginStorage): Promise<ToolConfig> { return (await loadPersistedToolConfigState(plugin)).config; }
export async function savePersistedToolConfig(config: ToolConfig, plugin?: PluginStorage): Promise<ToolConfig> {
    const normalized = normalizeToolConfig(config);
    await plugin?.saveData?.(CONFIG_STORAGE_KEY, normalized);
    return normalized;
}
export async function loadPersistedVersionControlSettings(plugin?: PluginStorage): Promise<VersionControlSettings> {
    return normalizeVersionControlSettings(await plugin?.loadData?.(VERSION_CONTROL_SETTINGS_STORAGE_KEY));
}
export async function savePersistedVersionControlSettings(settings: VersionControlSettings, plugin?: PluginStorage): Promise<VersionControlSettings> {
    const normalized = normalizeVersionControlSettings(settings);
    await plugin?.saveData?.(VERSION_CONTROL_SETTINGS_STORAGE_KEY, normalized);
    return normalized;
}
export async function loadPersistedPermissionDisplaySettings(plugin?: PluginStorage): Promise<PermissionDisplaySettings> {
    return normalizePermissionDisplaySettings(await plugin?.loadData?.(PERMISSION_DISPLAY_SETTINGS_STORAGE_KEY));
}
export async function savePersistedPermissionDisplaySettings(settings: PermissionDisplaySettings, plugin?: PluginStorage): Promise<PermissionDisplaySettings> {
    const normalized = normalizePermissionDisplaySettings(settings);
    await plugin?.saveData?.(PERMISSION_DISPLAY_SETTINGS_STORAGE_KEY, normalized);
    return normalized;
}

export const HTTP_BIND_HOST_OPTIONS = ['127.0.0.1', '0.0.0.0'] as const;
export type HttpServerHost = typeof HTTP_BIND_HOST_OPTIONS[number];
export interface HttpServerSettings {
    enabled: boolean; host: HttpServerHost; port: number; token: string; authEnabled: boolean;
    tlsEnabled: boolean; tlsCertFile: string; tlsKeyFile: string; tlsCaFile: string; skillsExtensionEnabled: boolean;
}
function generateRandomToken(): string {
    const bytes = new Uint8Array(32);
    if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') globalThis.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}
export function hasValidHttpTlsFiles(settings: HttpServerSettings): boolean { return !settings.tlsEnabled || Boolean(settings.tlsCertFile.trim() && settings.tlsKeyFile.trim()); }
export function buildDefaultHttpServerSettings(): HttpServerSettings {
    return { enabled: true, host: DEFAULT_HTTP_HOST, port: DEFAULT_HTTP_PORT, token: generateRandomToken(), authEnabled: true, tlsEnabled: false, tlsCertFile: '', tlsKeyFile: '', tlsCaFile: '', skillsExtensionEnabled: true };
}
export function normalizeHttpServerHost(raw: unknown): HttpServerHost {
    const value = typeof raw === 'string' ? raw.trim() : '';
    return HTTP_BIND_HOST_OPTIONS.includes(value as HttpServerHost) ? value as HttpServerHost : DEFAULT_HTTP_HOST;
}
export function normalizeHttpServerSettings(raw: unknown): HttpServerSettings {
    const defaults = buildDefaultHttpServerSettings();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
    const record = raw as Record<string, unknown>;
    const rawPort = typeof record.port === 'number' && Number.isFinite(record.port) ? Math.floor(record.port) : defaults.port;
    return {
        enabled: typeof record.enabled === 'boolean' ? record.enabled : defaults.enabled,
        host: normalizeHttpServerHost(record.host),
        port: Math.max(1, Math.min(65535, rawPort)),
        token: typeof record.token === 'string' && record.token.length >= 8 ? record.token : defaults.token,
        authEnabled: typeof record.authEnabled === 'boolean' ? record.authEnabled : defaults.authEnabled,
        tlsEnabled: typeof record.tlsEnabled === 'boolean' ? record.tlsEnabled : defaults.tlsEnabled,
        tlsCertFile: typeof record.tlsCertFile === 'string' ? record.tlsCertFile : defaults.tlsCertFile,
        tlsKeyFile: typeof record.tlsKeyFile === 'string' ? record.tlsKeyFile : defaults.tlsKeyFile,
        tlsCaFile: typeof record.tlsCaFile === 'string' ? record.tlsCaFile : defaults.tlsCaFile,
        skillsExtensionEnabled: typeof record.skillsExtensionEnabled === 'boolean' ? record.skillsExtensionEnabled : defaults.skillsExtensionEnabled,
    };
}
export function regenerateHttpServerToken(settings: HttpServerSettings): HttpServerSettings { return { ...settings, token: generateRandomToken() }; }
export async function loadPersistedHttpServerSettings(plugin?: PluginStorage): Promise<HttpServerSettings> {
    const raw = await plugin?.loadData?.(HTTP_SETTINGS_STORAGE_KEY);
    const normalized = normalizeHttpServerSettings(raw);
    if (!raw) await plugin?.saveData?.(HTTP_SETTINGS_STORAGE_KEY, normalized);
    return normalized;
}
export async function savePersistedHttpServerSettings(settings: HttpServerSettings, plugin?: PluginStorage): Promise<HttpServerSettings> {
    const normalized = normalizeHttpServerSettings(settings);
    await plugin?.saveData?.(HTTP_SETTINGS_STORAGE_KEY, normalized);
    return normalized;
}

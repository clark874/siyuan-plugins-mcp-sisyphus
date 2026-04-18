import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface FileConfig {
    apiUrl?: string;
    token?: string;
}

export interface ResolvedConfig {
    apiUrl: string;
    token: string;
}

export function getDefaultConfigPath(): string {
    return join(homedir(), '.siyuan-sisyphus', 'config.json');
}

export function getLegacyConfigPath(): string {
    return join(homedir(), '.siyuan-mcp', 'config.json');
}

export function loadFileConfig(configPath?: string): FileConfig {
    const resolved = resolveReadableConfigPath(configPath);
    if (!existsSync(resolved)) return {};
    try {
        const raw = readFileSync(resolved, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            return {
                apiUrl: typeof parsed.apiUrl === 'string' ? parsed.apiUrl : undefined,
                token: typeof parsed.token === 'string' ? parsed.token : undefined,
            };
        }
        return {};
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`[siyuan-sisyphus] Failed to load config at ${resolved}: ${msg}`);
    }
}

function resolveReadableConfigPath(configPath?: string): string {
    if (configPath) return configPath;

    const defaultPath = getDefaultConfigPath();
    if (existsSync(defaultPath)) return defaultPath;

    const legacyPath = getLegacyConfigPath();
    if (existsSync(legacyPath)) return legacyPath;

    return defaultPath;
}

export function resolveConfig(
    fileConfig: FileConfig,
    cliUrl?: string,
    cliToken?: string,
): ResolvedConfig {
    const apiUrl = cliUrl || process.env.SIYUAN_API_URL || fileConfig.apiUrl || 'http://127.0.0.1:6806';
    const token = cliToken || process.env.SIYUAN_TOKEN || fileConfig.token || '';
    return { apiUrl, token };
}

export function applyConfigToEnv(config: ResolvedConfig): void {
    process.env.SIYUAN_API_URL = config.apiUrl;
    if (config.token) process.env.SIYUAN_TOKEN = config.token;
}

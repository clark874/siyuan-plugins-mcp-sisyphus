import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';

const run = promisify(execFile);
export const gatewayUrl = 'http://127.0.0.1:36806/mcp';

export function codexHome(options) {
    return options.explicitHome || !process.env.CODEX_HOME
        ? path.join(options.home, '.codex') : path.resolve(process.env.CODEX_HOME);
}

export async function inspectCodexGateway(options, activeHome = codexHome(options)) {
    let servers;
    try {
        const { stdout } = await run('codex', ['mcp', 'list', '--json'], {
            cwd: os.tmpdir(), env: { ...process.env, CODEX_HOME: activeHome }, timeout: 4000,
        });
        servers = JSON.parse(stdout);
        if (!Array.isArray(servers)) throw new Error();
    } catch {
        throw new Error('无法用 Codex CLI 核对 MCP 配置，请确认 codex 命令可用。');
    }
    const matches = servers.filter(server => server.transport?.url === gatewayUrl);
    if (matches.length > 1 || servers.some(server => server.name === 'siyuan_sisyphus' && server.transport?.url !== gatewayUrl)) {
        throw new Error('Codex 的思源连接存在名称冲突或重复入口，已保留原配置。');
    }
    const server = matches[0];
    const transport = server?.transport;
    const rawToken = Object.entries(transport?.http_headers ?? {}).find(([name]) => name.toLowerCase() === 'authorization')?.[1]
        ?? (transport?.bearer_token_env_var ? process.env[transport.bearer_token_env_var] : undefined)
        ?? process.env[Object.entries(transport?.env_http_headers ?? {}).find(([name]) => name.toLowerCase() === 'authorization')?.[1]];
    const token = typeof rawToken === 'string' ? rawToken.trim().replace(/^Bearer\s+/i, '') : undefined;
    return { server, token: token && token.length >= 16 && !/\s/.test(token) ? token : undefined };
}

export function resolveJsonGatewayEntry(config, bridge) {
    const servers = config?.mcpServers ?? config?.mcp?.servers ?? {};
    const matches = Object.entries(servers).filter(([, server]) =>
        (server?.url ?? server?.serverUrl) === gatewayUrl || (bridge && server?.args?.[0] === bridge));
    if (matches.length > 1 || ['siyuan', 'siyuan-sisyphus'].some(name => servers[name] && name !== matches[0]?.[0])) {
        throw new Error('思源连接存在同名冲突或重复入口，已保留原配置。');
    }
    const [name, server] = matches[0] ?? ['siyuan'];
    return { name, server };
}

export async function validateCodexCandidate(options, content) {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'sisyphus-codex-config-'));
    try {
        await writeFile(path.join(temporary, 'config.toml'), content, { mode: 0o600 });
        const { server, token } = await inspectCodexGateway(options, temporary);
        if (!server?.enabled || !token) throw new Error('Codex 未读到有效的思源入口。');
    } catch {
        throw new Error('Codex 未能加载候选配置，已保留用户配置。');
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
}

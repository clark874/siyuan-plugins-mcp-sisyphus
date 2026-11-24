import { access, readFile } from 'node:fs/promises';
import { constants, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { inspectCodexGateway, resolveJsonGatewayEntry } from './codex-gateway.mjs';

const SISYPHUS_URL = 'http://127.0.0.1:36806/mcp';

function parseArguments(argv) {
    const options = { client: 'auto', home: os.homedir(), json: false, timeoutMs: 3000 };
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (value === '--client') options.client = argv[++index] ?? '';
        else if (value === '--home') { options.home = path.resolve(argv[++index] ?? ''); options.explicitHome = true; }
        else if (value === '--json') options.json = true;
        else if (value === '--timeout') options.timeoutMs = Number(argv[++index]);
        else if (value === '--help' || value === '-h') {
            console.log('用法：node bin/check-sisyphus.cjs [--client codex|kimi|zcode|antigravity|devin|auto] [--home <目录>] [--json] [--timeout <毫秒>]');
            process.exit(0);
        } else throw new Error(`Unknown argument: ${value}`);
    }
    if (!['codex', 'kimi', 'zcode', 'antigravity', 'devin', 'auto'].includes(options.client)) throw new Error('--client 支持 codex、kimi、zcode、antigravity、devin 或 auto。');
    if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1) throw new Error('--timeout must be a positive number.');
    return options;
}

async function exists(target, mode) {
    try {
        await access(target, mode);
        return true;
    } catch {
        return false;
    }
}

function normalizeToken(value) {
    if (typeof value !== 'string') return undefined;
    const token = value.trim().replace(/^Bearer\s+/i, '');
    if (token.length < 16 || /\s/.test(token)) return undefined;
    return token;
}

async function clientPaths(options) {
    const byClient = {
        kimi: [
            process.env.KIMI_CODE_HOME ? path.join(path.resolve(process.env.KIMI_CODE_HOME), 'mcp.json') : '',
            path.join(options.home, '.kimi/mcp.json'),
            path.join(options.home, '.kimi-code/mcp.json'),
        ].filter(Boolean),
        zcode: [path.join(options.home, '.zcode/cli/config.json')],
        antigravity: [path.join(options.home, '.gemini/antigravity/mcp_config.json')],
        devin: [path.join(options.home, '.config/devin/mcp_config.json')],
    };
    const clients = options.client === 'auto' ? ['kimi', 'zcode'] : [options.client];
    return clients.flatMap((client) => byClient[client].map((target) => ({ client, target })));
}

export async function readConfiguredGateway(options) {
    if (options.client === 'codex') {
        const { server, token } = await inspectCodexGateway(options);
        return server?.enabled && token && !server.disabled_tools?.includes('system')
            && (!server.enabled_tools || server.enabled_tools.includes('system'))
            ? { client: 'codex', url: SISYPHUS_URL, token }
            : { client: 'codex', issue: 'host_reload_required' };
    }
    for (const { client, target } of await clientPaths(options)) {
        if (!await exists(target)) continue;
        let config;
        try {
            config = JSON.parse(await readFile(target, 'utf8'));
        } catch {
            return { client, issue: 'host_reload_required' };
        }
        const bridge = path.join(options.home, '.siyuan-sisyphus/bin/check-sisyphus.cjs');
        let server;
        try { ({ server } = resolveJsonGatewayEntry(config, client === 'devin' ? bridge : undefined)); }
        catch { return { client, issue: 'host_reload_required' }; }
        if (!server || typeof server !== 'object') continue;
        if (client === 'devin') {
            const token = normalizeToken(server.env?.SIYUAN_MCP_TOKEN);
            if (server.disabled || server.enabled === false || server.disabledTools?.includes('system') || !token || !path.isAbsolute(server.command ?? '')
                || JSON.stringify(server.args) !== JSON.stringify([bridge, '--stdio-bridge'])
                || !await exists(bridge) || !await exists(server.command, constants.X_OK)) {
                return { client, issue: 'host_reload_required' };
            }
            return { client, token, bridge };
        }
        const token = normalizeToken(server?.headers?.Authorization);
        const url = client === 'antigravity' ? server.serverUrl : server.url;
        if (server.disabled === true || server.enabled === false || server.disabledTools?.includes('system') || url !== SISYPHUS_URL || !token) return { client, issue: 'host_reload_required' };
        return { client, url: SISYPHUS_URL, token };
    }
    return { client: options.client, issue: 'host_reload_required' };
}

function parseBootstrap(result) {
    if (result?.isError) throw new Error('bootstrap_failed');
    if (result?.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent;
    const text = result?.content?.find((item) => item?.type === 'text')?.text;
    if (typeof text !== 'string') return undefined;
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

function classifyInitialize(error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/\b(?:401|403)\b|unauthorized|forbidden/i.test(message)) return 'gateway_unauthorized';
    if (isGatewayTimeout(error)) return 'gateway_timeout';
    if (/ECONNREFUSED|ECONNRESET|ENOTFOUND|EHOSTUNREACH|fetch failed|network|socket|aborted/i.test(message)) return 'gateway_not_running';
    return 'mcp_initialize_failed';
}

function isGatewayTimeout(error) {
    const message = error instanceof Error ? error.message : String(error);
    return /tim(?:e|ed)[ _-]*out/i.test(`${message} ${error?.cause?.code ?? ''}`);
}

export async function checkSisyphus(options) {
    const configured = await readConfiguredGateway(options);
    if (configured.issue) return { ready: false, issue: configured.issue, client: configured.client, sessionMount: 'not_observable' };

    const client = new Client({ name: 'siyuan-sisyphus-agent-kit-check', version: '0.9.2' });
    const transport = configured.bridge ? new StdioClientTransport({
        command: process.execPath, args: [configured.bridge, '--stdio-bridge'],
        env: { SIYUAN_MCP_TOKEN: configured.token, NODE_USE_ENV_PROXY: '0', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' },
        stderr: 'ignore',
    }) : new StreamableHTTPClientTransport(new URL(configured.url), {
        requestInit: { headers: { Authorization: `Bearer ${configured.token}` } },
    });
    try {
        try {
            await client.connect(transport, { timeout: options.timeoutMs });
        } catch (error) {
            return { ready: false, issue: classifyInitialize(error), client: configured.client, sessionMount: 'not_observable' };
        }
        let tools;
        try {
            tools = (await client.listTools(undefined, { timeout: options.timeoutMs })).tools;
        } catch (error) {
            return { ready: false, issue: isGatewayTimeout(error) ? 'gateway_timeout' : 'tools_list_failed', client: configured.client, sessionMount: 'not_observable' };
        }
        if (!tools.some((tool) => tool.name === 'system')) {
            return { ready: false, issue: 'required_tool_missing', client: configured.client, sessionMount: 'not_observable' };
        }
        let bootstrap;
        try {
            bootstrap = parseBootstrap(await client.callTool(
                { name: 'system', arguments: { action: 'bootstrap' } },
                { timeout: options.timeoutMs },
            ));
        } catch (error) {
            return { ready: false, issue: isGatewayTimeout(error) ? 'gateway_timeout' : 'bootstrap_failed', client: configured.client, sessionMount: 'not_observable' };
        }
        const deliveryPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../delivery.json');
        const delivery = JSON.parse(await readFile(deliveryPath, 'utf8'));
        if (bootstrap?.schemaVersion !== delivery.firstCall.expectedSchemaVersion
            || bootstrap?.bootstrap !== true || typeof bootstrap?.toolConfiguration !== 'object') {
            return { ready: false, issue: 'bootstrap_schema_mismatch', client: configured.client, sessionMount: 'not_observable' };
        }
        if (bootstrap.toolConfiguration.current !== true) {
            return { ready: false, issue: 'tool_configuration_stale', client: configured.client, sessionMount: 'not_observable' };
        }
        return { ready: true, status: 'ready', client: configured.client, sessionMount: 'not_observable' };
    } finally {
        await client.close().catch(() => undefined);
    }
}

// 原样中继协议帧，仍由原网关完成认证、权限检查和写入协调。
async function runStdioBridge() {
    const token = normalizeToken(process.env.SIYUAN_MCP_TOKEN);
    if (!token) throw new Error('本机思源网关缺少 Bearer 令牌。');
    const stdio = new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: 34 * 1024 * 1024 });
    const http = new StreamableHTTPClientTransport(new URL(SISYPHUS_URL), {
        fetch: (input, init) => fetch(input, {
            ...init,
            redirect: 'error',
            ...(init?.method === 'DELETE' ? { signal: AbortSignal.timeout(2000) } : {}),
        }),
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    stdio.onmessage = message => {
        http.send(message).catch(error => {
            const denied = [401, 403].includes(error?.status)
                || /\b(?:401|403)\b|unauthorized|forbidden/iu.test(String(error));
            const status = denied ? '网关认证失败（401 或 403）' : '本机思源网关不可用，或请求结果待核对';
            if ('id' in message && 'method' in message) {
                void stdio.send({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: status } }).catch(() => {});
            }
        });
    };
    http.onmessage = message => {
        const version = message.result?.protocolVersion;
        if (typeof version === 'string') http.setProtocolVersion(version);
        void stdio.send(message).catch(() => {});
    };
    stdio.onclose = () => {
        void http.terminateSession().catch(() => {}).finally(() => http.close().catch(() => {}));
    };
    process.stdin.once('end', () => { void stdio.close().catch(() => {}); });
    await http.start();
    await stdio.start();
}

async function main() {
    if (process.argv.length === 3 && process.argv[2] === '--stdio-bridge') {
        await runStdioBridge();
        return;
    }
    const options = parseArguments(process.argv.slice(2));
    const result = await checkSisyphus(options);
    if (options.json) console.log(JSON.stringify(result));
    else console.log(result.ready ? 'ready' : `not ready: ${result.issue}`);
    if (!result.ready) process.exitCode = 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}

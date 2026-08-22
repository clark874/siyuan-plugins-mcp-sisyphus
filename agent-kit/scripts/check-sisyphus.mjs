import { access, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const SISYPHUS_URL = 'http://127.0.0.1:36806/mcp';

function parseArguments(argv) {
    const options = { client: 'auto', home: os.homedir(), json: false, timeoutMs: 3000 };
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (value === '--client') options.client = argv[++index] ?? '';
        else if (value === '--home') options.home = path.resolve(argv[++index] ?? '');
        else if (value === '--json') options.json = true;
        else if (value === '--timeout') options.timeoutMs = Number(argv[++index]);
        else if (value === '--help' || value === '-h') {
            console.log('Usage: node scripts/check-sisyphus.mjs [--client kimi|zcode|auto] [--home <dir>] [--json] [--timeout <ms>]');
            process.exit(0);
        } else throw new Error(`Unknown argument: ${value}`);
    }
    if (!['kimi', 'zcode', 'auto'].includes(options.client)) throw new Error('--client must be kimi, zcode, or auto.');
    if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1) throw new Error('--timeout must be a positive number.');
    return options;
}

async function exists(target) {
    try {
        await access(target);
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

function serverFromConfig(config) {
    return config?.mcpServers?.siyuan
        ?? config?.mcpServers?.['siyuan-sisyphus']
        ?? config?.mcp?.servers?.siyuan
        ?? config?.mcp?.servers?.['siyuan-sisyphus'];
}

async function clientPaths(options) {
    const byClient = {
        kimi: [
            process.env.KIMI_CODE_HOME ? path.join(path.resolve(process.env.KIMI_CODE_HOME), 'mcp.json') : '',
            path.join(options.home, '.kimi/mcp.json'),
            path.join(options.home, '.kimi-code/mcp.json'),
        ].filter(Boolean),
        zcode: [path.join(options.home, '.zcode/cli/config.json')],
    };
    const clients = options.client === 'auto' ? ['kimi', 'zcode'] : [options.client];
    return clients.flatMap((client) => byClient[client].map((target) => ({ client, target })));
}

export async function readConfiguredGateway(options) {
    for (const { client, target } of await clientPaths(options)) {
        if (!await exists(target)) continue;
        let config;
        try {
            config = JSON.parse(await readFile(target, 'utf8'));
        } catch {
            return { client, issue: 'host_reload_required' };
        }
        const server = serverFromConfig(config);
        if (!server || typeof server !== 'object') continue;
        const token = normalizeToken(server?.headers?.Authorization);
        if (server.url !== SISYPHUS_URL || !token) return { client, issue: 'host_reload_required' };
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
    if (/ECONNREFUSED|ECONNRESET|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|fetch failed|network|socket|aborted|timeout/i.test(message)) return 'gateway_not_running';
    return 'mcp_initialize_failed';
}

export async function checkSisyphus(options) {
    const configured = await readConfiguredGateway(options);
    if (configured.issue) return { ready: false, issue: configured.issue, client: configured.client, sessionMount: 'not_observable' };

    const client = new Client({ name: 'siyuan-sisyphus-agent-kit-check', version: '0.9.1' });
    const transport = new StreamableHTTPClientTransport(new URL(configured.url), {
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
        } catch {
            return { ready: false, issue: 'tools_list_failed', client: configured.client, sessionMount: 'not_observable' };
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
        } catch {
            return { ready: false, issue: 'bootstrap_failed', client: configured.client, sessionMount: 'not_observable' };
        }
        if (bootstrap?.schemaVersion !== 2 || bootstrap?.bootstrap !== true || typeof bootstrap?.toolConfiguration !== 'object') {
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

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const result = await checkSisyphus(options);
    if (options.json) console.log(JSON.stringify(result));
    else console.log(result.ready ? 'ready' : `not ready: ${result.issue}`);
    if (!result.ready) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}

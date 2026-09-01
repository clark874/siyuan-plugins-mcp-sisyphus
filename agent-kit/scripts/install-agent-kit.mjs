#!/usr/bin/env node

import {
    access,
    chmod,
    copyFile,
    cp,
    mkdir,
    readFile,
    rename,
    writeFile,
} from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SISYPHUS_URL = 'http://127.0.0.1:36806/mcp';
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(scriptDirectory, '..');

function parseArguments(argv) {
    const options = { client: 'auto', home: os.homedir(), dryRun: false, explicitHome: false, requireReady: false };
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (value === '--client') {
            options.client = argv[++index] ?? '';
        } else if (value === '--home') {
            options.home = path.resolve(argv[++index] ?? '');
            options.explicitHome = true;
        } else if (value === '--dry-run') {
            options.dryRun = true;
        } else if (value === '--require-ready') {
            options.requireReady = true;
        } else if (value === '--help' || value === '-h') {
            console.log('用法：node scripts/install-agent-kit.mjs --client kimi|zcode|all|auto [--home <目录>] [--dry-run] [--require-ready]');
            process.exit(0);
        } else {
            throw new Error(`未知参数：${value}`);
        }
    }
    if (!['kimi', 'zcode', 'all', 'auto'].includes(options.client)) {
        throw new Error('--client 仅支持 kimi、zcode、all 或 auto。');
    }
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

async function readJson(target, { optional = false } = {}) {
    if (!await exists(target)) {
        if (optional) return {};
        throw new Error(`配置文件不存在：${target}`);
    }
    const content = await readFile(target, 'utf8');
    try {
        return JSON.parse(content);
    } catch (error) {
        throw new Error(`配置文件不是有效 JSON：${target}；${error instanceof Error ? error.message : String(error)}`);
    }
}

function normalizeToken(value) {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim().replace(/^Bearer\s+/i, '');
    if (normalized.length < 16 || /\s/.test(normalized)) return undefined;
    return normalized;
}

function tokenFromConfig(config) {
    const candidates = [
        config?.mcpServers?.siyuan?.headers?.Authorization,
        config?.mcpServers?.['siyuan-sisyphus']?.headers?.Authorization,
        config?.mcp?.servers?.siyuan?.headers?.Authorization,
        config?.mcp?.servers?.['siyuan-sisyphus']?.headers?.Authorization,
    ];
    return candidates.map(normalizeToken).find(Boolean);
}

function kimiConfigPath(options) {
    if (!options.explicitHome && process.env.KIMI_CODE_HOME) {
        return path.join(path.resolve(process.env.KIMI_CODE_HOME), 'mcp.json');
    }
    const legacy = path.join(options.home, '.kimi/mcp.json');
    return legacy;
}

async function resolvedKimiConfigPath(options) {
    const legacy = kimiConfigPath(options);
    if (await exists(legacy)) return legacy;
    return path.join(options.home, '.kimi-code/mcp.json');
}

function zcodeConfigPath(options) {
    return path.join(options.home, '.zcode/cli/config.json');
}

async function resolveClients(options) {
    if (options.client !== 'auto') {
        return options.client === 'all' ? ['kimi', 'zcode'] : [options.client];
    }
    const clients = [];
    if (await exists(path.join(options.home, '.kimi')) || await exists(path.join(options.home, '.kimi-code'))) {
        clients.push('kimi');
    }
    if (await exists(path.join(options.home, '.zcode/cli/config.json'))) clients.push('zcode');
    if (clients.length === 0) {
        throw new Error('无法自动识别支持的 MCP 客户端；请显式传入 --client kimi 或 --client zcode。');
    }
    return clients;
}

async function resolveToken(options, targetPaths) {
    const environmentToken = normalizeToken(process.env.SIYUAN_MCP_TOKEN);
    if (environmentToken) return environmentToken;

    const candidates = new Set([
        ...targetPaths,
        path.join(options.home, '.kimi/mcp.json'),
        path.join(options.home, '.kimi-code/mcp.json'),
        path.join(options.home, '.zcode/cli/config.json'),
    ]);
    for (const candidate of candidates) {
        if (!await exists(candidate)) continue;
        const token = tokenFromConfig(await readJson(candidate));
        if (token) return token;
    }
    throw new Error([
        '未找到 Sisyphus Bearer token。',
        '请由用户在本地终端设置 SIYUAN_MCP_TOKEN 后重试；不要把 token 放进聊天、网址或公开交付包。',
    ].join(' '));
}

function isOfficialMcpUrl(value) {
    if (typeof value !== 'string') return false;
    try {
        const url = new URL(value);
        return url.protocol === 'http:'
            && ['127.0.0.1', 'localhost'].includes(url.hostname)
            && url.port === '6806'
            && url.pathname.replace(/\/$/, '') === '/mcp';
    } catch {
        return false;
    }
}

function officialServerNames(config) {
    const containers = [config?.mcpServers, config?.mcp?.servers].filter(Boolean);
    const names = [];
    for (const servers of containers) {
        for (const [name, server] of Object.entries(servers)) {
            if (isOfficialMcpUrl(server?.url)) names.push(name);
        }
    }
    return names;
}

async function atomicJsonWrite(target, value, dryRun) {
    if (dryRun) return;
    await mkdir(path.dirname(target), { recursive: true });
    const serialized = `${JSON.stringify(value, null, 2)}\n`;
    if (await exists(target)) {
        if (await readFile(target, 'utf8') === serialized) {
            await chmod(target, 0o600);
            return;
        }
        const backup = `${target}.backup-${Date.now()}`;
        await copyFile(target, backup);
        await chmod(backup, 0o600);
    }
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, serialized, { mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, target);
    await chmod(target, 0o600);
}

async function installSkill(options) {
    const source = path.join(kitRoot, 'skills/siyuan-mcp-sisyphus');
    const destination = path.join(options.home, '.agents/skills/siyuan-mcp-sisyphus');
    if (options.dryRun) return destination;
    await mkdir(path.dirname(destination), { recursive: true });
    if (await exists(destination)) {
        const sourceSkill = await readFile(path.join(source, 'SKILL.md'), 'utf8');
        const destinationSkill = await readFile(path.join(destination, 'SKILL.md'), 'utf8').catch(() => '');
        if (sourceSkill === destinationSkill) return destination;
        const backup = `${destination}.backup-${Date.now()}`;
        await rename(destination, backup);
    }
    await cp(source, destination, { recursive: true, force: true });
    return destination;
}

async function installSessionCaptureHelper(options) {
    const source = path.join(kitRoot, 'scripts/capture-agent-session.cjs');
    const destination = path.join(options.home, '.siyuan-sisyphus/bin/capture-agent-session.cjs');
    if (options.dryRun) return destination;
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
    await chmod(destination, 0o755);
    return destination;
}

async function configureClient(client, target, token, options) {
    const config = await readJson(target, { optional: true });
    const officialNames = officialServerNames(config);
    if (officialNames.length > 0) {
        console.warn(`警告：${client} 已配置思源官方 MCP（${officialNames.join(', ')}）。安装器不会删除它；请在客户端中禁用，避免两组思源工具并列。`);
    }
    const server = {
        transport: 'http',
        url: SISYPHUS_URL,
        headers: { Authorization: `Bearer ${token}` },
    };
    if (client === 'kimi') {
        config.mcpServers = { ...(config.mcpServers ?? {}), siyuan: server };
    } else {
        config.mcp = config.mcp ?? {};
        config.mcp.servers = {
            ...(config.mcp.servers ?? {}),
            siyuan: { type: 'http', url: SISYPHUS_URL, headers: server.headers, enabled: true, timeoutMs: 60000 },
        };
    }
    await atomicJsonWrite(target, config, options.dryRun);
}

async function verifyInstallation(options) {
    if (options.dryRun) return { ready: false, status: 'installed_unverified' };
    const bundledChecker = path.join(kitRoot, 'bin', 'check-sisyphus.cjs');
    const checker = await exists(bundledChecker)
        ? bundledChecker
        : path.join(scriptDirectory, 'check-sisyphus.mjs');
    const client = options.client === 'all' ? 'auto' : options.client;
    return await new Promise((resolve) => {
        execFile(process.execPath, [
            checker,
            '--client', client,
            '--home', options.home,
            '--json',
            '--timeout', '800',
        ], {
            encoding: 'utf8',
            timeout: 5000,
            env: process.env,
        }, (_error, stdout) => {
            try {
                const result = JSON.parse(stdout.trim());
                resolve(result?.ready === true
                    ? { ready: true, status: 'ready' }
                    : { ready: false, status: 'installed_unverified', issue: result?.issue });
            } catch {
                resolve({ ready: false, status: 'installed_unverified' });
            }
        });
    });
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const clients = await resolveClients(options);
    const paths = [];
    for (const client of clients) {
        paths.push(client === 'kimi' ? await resolvedKimiConfigPath(options) : zcodeConfigPath(options));
    }
    const token = await resolveToken(options, paths);
    const skillPath = await installSkill(options);
    const captureHelperPath = await installSessionCaptureHelper(options);
    for (let index = 0; index < clients.length; index += 1) {
        await configureClient(clients[index], paths[index], token, options);
    }
    const verification = await verifyInstallation(options);
    console.log(`${options.dryRun ? '预检完成' : '安装完成'}：已注册唯一外部 MCP ${SISYPHUS_URL}`);
    console.log(`Skill：${skillPath}`);
    console.log(`会话捕获助手：${captureHelperPath}`);
    console.log(`Verification：${verification.status}${verification.issue ? ` (${verification.issue})` : ''}`);
    console.log('重新加载客户端后，首次调用 system(action="bootstrap")。');
    if (options.requireReady && !verification.ready) process.exitCode = 1;
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});

#!/usr/bin/env node

import {
    access,
    chmod,
    copyFile,
    cp,
    mkdir,
    lstat,
    readdir,
    readFile,
    realpath,
    rename,
    writeFile,
} from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codexHome, inspectCodexGateway, resolveJsonGatewayEntry, validateCodexCandidate } from './codex-gateway.mjs';

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
            console.log('用法：node scripts/install-agent-kit.mjs --client codex|zcode|devin|antigravity|kimi|all|auto（可逗号分隔） [--home <目录>] [--dry-run] [--require-ready]');
            process.exit(0);
        } else {
            throw new Error(`未知参数：${value}`);
        }
    }
    const requested = options.client.split(',');
    if (requested.some(client => !['codex', 'kimi', 'zcode', 'antigravity', 'devin'].includes(client))
        && options.client !== 'all' && options.client !== 'auto') {
        throw new Error('--client 支持 codex、zcode、devin、antigravity、kimi，或单独使用 all、auto。');
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
    const servers = config?.mcpServers ?? config?.mcp?.servers ?? {};
    return Object.values(servers).filter(server => (server?.url ?? server?.serverUrl) === SISYPHUS_URL)
        .map(server => normalizeToken(Object.entries(server.headers ?? {}).find(([name]) => name.toLowerCase() === 'authorization')?.[1])).find(Boolean);
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

async function antigravityConfigPath(options) {
    const target = path.join(options.home, '.gemini/antigravity/mcp_config.json');
    // 配置可能链接至中央目录，写入实际文件以保留客户端入口软链。
    return await exists(target) ? realpath(target) : target;
}

async function resolveClients(options) {
    if (options.client !== 'auto') {
        return options.client === 'all' ? ['kimi', 'zcode'] : [...new Set(options.client.split(','))];
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

async function resolveToken(options, targetPaths, codex) {
    const environmentToken = normalizeToken(process.env.SIYUAN_MCP_TOKEN);
    if (environmentToken) return environmentToken;
    if (options.client === 'devin') {
        const bridge = path.join(options.home, '.siyuan-sisyphus/bin/check-sisyphus.cjs');
        const { server: current } = resolveJsonGatewayEntry(await readJson(targetPaths[0], { optional: true }), bridge);
        const cursor = (await readJson(path.join(options.home, '.cursor/mcp.json'), { optional: true }))?.mcpServers?.siyuan;
        const token = normalizeToken(current?.env?.SIYUAN_MCP_TOKEN)
            ?? normalizeToken(current?.url === SISYPHUS_URL ? current.headers?.Authorization : undefined)
            ?? normalizeToken(cursor?.url === SISYPHUS_URL ? cursor.headers?.Authorization : undefined);
        if (!token) throw new Error('请在本机环境设置 SIYUAN_MCP_TOKEN 后再安装 Devin 接入。');
        return token;
    }

    if (codex?.token) return codex.token;
    const candidates = new Set([
        ...targetPaths,
        path.join(options.home, '.kimi/mcp.json'),
        path.join(options.home, '.kimi-code/mcp.json'),
        path.join(options.home, '.zcode/cli/config.json'),
        path.join(options.home, '.gemini/antigravity/mcp_config.json'),
    ]);
    for (const candidate of candidates) {
        if (candidate.endsWith('config.toml') || !await exists(candidate)) continue;
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
            if (isOfficialMcpUrl(server?.url ?? server?.serverUrl)) names.push(name);
        }
    }
    return names;
}

async function atomicJsonWrite(target, value, dryRun) {
    return atomicConfigWrite(target, `${JSON.stringify(value, null, 2)}\n`, dryRun);
}

async function atomicConfigWrite(target, serialized, dryRun) {
    if (dryRun) return;
    await mkdir(path.dirname(target), { recursive: true });
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

// 旧生成器已发布的精确名称；不得按前缀迁移用户自建技能。
const legacySkillNames = [
    'siyuan-sisyphus',
    'siyuan-mcp-sisyphus',
    'siyuan-sisyphus-literature-source',
    'siyuan-mcp-literature-source',
    'siyuan-sisyphus-browse-read',
    'siyuan-mcp-browse-read',
    'siyuan-sisyphus-create-edit',
    'siyuan-mcp-create-edit',
    'siyuan-sisyphus-knowledge-ingest',
    'siyuan-mcp-knowledge-ingest',
    'siyuan-sisyphus-project-knowledge-compile',
    'siyuan-mcp-project-knowledge-compile',
    'siyuan-sisyphus-project-coordinator',
    'siyuan-mcp-project-coordinator',
    'siyuan-sisyphus-knowledge-governance',
    'siyuan-mcp-knowledge-governance',
    'siyuan-sisyphus-search-query',
    'siyuan-mcp-search-query',
    'siyuan-sisyphus-cross-project-relation-closure',
    'siyuan-mcp-cross-project-relation-closure',
    'siyuan-sisyphus-database',
    'siyuan-mcp-database',
    'siyuan-sisyphus-project-source',
    'siyuan-mcp-project-source',
    'siyuan-sisyphus-timeline',
    'siyuan-mcp-timeline',
    'siyuan-sisyphus-system-cli',
    'siyuan-mcp-system-safety',
    'siyuan-markup-guide',
    'siyuan-mcp-markup-guide',
    'siyuan-mcp-read-discover',
    'siyuan-mcp-write-format',
    'siyuan-mcp-data-files',
    'siyuan-mcp-organize-safety',
];

async function isProjectSkill(directory, name) {
    const info = await lstat(directory).catch(() => undefined);
    if (!info?.isDirectory() || info.isSymbolicLink()) return false;
    const content = await readFile(path.join(directory, 'SKILL.md'), 'utf8').catch(() => '');
    return content.startsWith('---\n')
        && content.split('\n').includes(`name: ${name}`)
        && (content.includes('SiYuan Sisyphus') || content.includes('SiYuan Note through the Sisyphus')
            || content.includes('Requires the maintained siyuan-sisyphus CLI to be installed and configured for the target SiYuan workspace.'));
}

async function validateSkillSource(directory, prefix = '') {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink()) throw new Error(`技能发布目录不得包含符号链接：${relative}`);
        if (entry.isDirectory()) files.push(...await validateSkillSource(path.join(directory, entry.name), relative));
        else if (entry.isFile()) files.push(relative);
    }
    return files.sort();
}

async function installSkill(options) {
    const source = path.join(kitRoot, 'skills/siyuan');
    const skillRoot = options.client === 'antigravity' ? '.gemini/antigravity/skills' : '.agents/skills';
    const destination = path.join(options.home, skillRoot, 'siyuan');
    const sourceFiles = await validateSkillSource(source);
    const skillFiles = sourceFiles.filter((file) => path.basename(file) === 'SKILL.md');
    if (skillFiles.length !== 1 || skillFiles[0] !== 'SKILL.md' || !await isProjectSkill(source, 'siyuan')) {
        throw new Error('技能发布目录必须只包含 siyuan 这一份 SKILL.md。');
    }
    if ((await lstat(destination).catch(() => undefined))?.isSymbolicLink()) {
        const linked = await realpath(destination);
        const linkedFiles = await validateSkillSource(linked);
        if (await isProjectSkill(linked, 'siyuan') && JSON.stringify(linkedFiles) === JSON.stringify(sourceFiles)
            && (await Promise.all(sourceFiles.map(async file =>
                (await readFile(path.join(source, file))).equals(await readFile(path.join(linked, file)))))).every(Boolean)) {
            return destination;
        }
        throw new Error(`目标技能由符号链接管理，请先通过原管理器更新，已保留：${destination}`);
    }
    if (await exists(destination) && !await isProjectSkill(destination, 'siyuan')) {
        throw new Error(`目标目录不属于本项目，已保留：${destination}`);
    }
    if (options.dryRun) return destination;
    const legacy = [];
    for (const name of legacySkillNames) {
        if (await isProjectSkill(path.join(path.dirname(destination), name), name)) legacy.push(name);
    }
    if (legacy.length === 0 && await isProjectSkill(destination, 'siyuan')) {
        const existingFiles = await validateSkillSource(destination).catch(() => []);
        if (JSON.stringify(existingFiles) === JSON.stringify(sourceFiles)
            && (await Promise.all(sourceFiles.map(async (file) =>
                (await readFile(path.join(source, file))).equals(await readFile(path.join(destination, file)))))).every(Boolean)) {
            return destination;
        }
    }
    await mkdir(path.dirname(destination), { recursive: true });
    // 备份与暂存均位于技能扫描根之外，避免旧入口继续被发现。
    const backupParent = options.client === 'antigravity' ? '.gemini/.sisyphus-skill-backups' : '.agents/.sisyphus-skill-backups';
    const backupRoot = path.join(options.home, backupParent, `${Date.now()}-${process.pid}`);
    const staged = path.join(backupRoot, '.staged-siyuan');
    await mkdir(backupRoot, { recursive: true });
    await cp(source, staged, { recursive: true });
    const moved = [];
    try {
        for (const name of ['siyuan', ...legacy]) {
            const existing = path.join(path.dirname(destination), name);
            if (!await isProjectSkill(existing, name)) continue;
            const backup = path.join(backupRoot, name);
            await rename(existing, backup);
            moved.push({ existing, backup });
        }
        await rename(staged, destination);
        if (moved.length > 0) console.log(`旧技能备份：${backupRoot}`);
    } catch (error) {
        for (const { existing, backup } of moved.reverse()) await rename(backup, existing);
        throw error;
    }
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
    const bridge = path.join(options.home, '.siyuan-sisyphus/bin/check-sisyphus.cjs');
    const { name, server: previousEntry } = resolveJsonGatewayEntry(config, client === 'devin' ? bridge : undefined);
    const headers = Object.fromEntries(Object.entries(previousEntry?.headers ?? {}).filter(([key]) => key.toLowerCase() !== 'authorization'));
    headers.Authorization = 'Bearer ' + token;
    const server = {
        transport: 'http',
        url: SISYPHUS_URL,
        headers,
    };
    if (client === 'devin') {
        const source = path.join(kitRoot, 'bin/check-sisyphus.cjs');
        const previous = previousEntry;
        if (!await exists(source)) throw new Error('请使用已封包的 Agent Kit 安装 Devin 接入。');
        if (!options.dryRun) {
            await mkdir(path.dirname(bridge), { recursive: true });
            const temporary = `${bridge}.${process.pid}.tmp`;
            await copyFile(source, temporary);
            await chmod(temporary, 0o755);
            await rename(temporary, bridge);
        }
        config.mcpServers = { ...(config.mcpServers ?? {}), [name]: {
            ...(previous?.disabled === true ? { disabled: true } : {}),
            command: process.execPath, args: [bridge, '--stdio-bridge'],
            env: { SIYUAN_MCP_TOKEN: token, NODE_USE_ENV_PROXY: '0', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' },
            ...(previous?.disabledTools ? { disabledTools: previous.disabledTools } : {}),
        } };
    } else if (client === 'kimi') {
        config.mcpServers = { ...(config.mcpServers ?? {}), [name]: { ...previousEntry, ...server } };
    } else if (client === 'antigravity') {
        config.mcpServers = {
            ...(config.mcpServers ?? {}),
            [name]: { ...previousEntry, serverUrl: SISYPHUS_URL, headers: server.headers },
        };
    } else {
        config.mcp = config.mcp ?? {};
        config.mcp.servers = {
            ...(config.mcp.servers ?? {}),
            [name]: { enabled: true, timeoutMs: 60000, ...previousEntry, type: 'http', url: SISYPHUS_URL, headers: server.headers },
        };
    }
    await atomicJsonWrite(await exists(target) ? await realpath(target) : target, config, options.dryRun);
}

async function verifyInstallation(options) {
    if (options.dryRun) return { ready: false, status: 'installed_unverified' };
    const bundledChecker = path.join(kitRoot, 'bin', 'check-sisyphus.cjs');
    const checker = await exists(bundledChecker)
        ? bundledChecker
        : path.join(scriptDirectory, 'check-sisyphus.mjs');
    const client = options.client;
    return await new Promise((resolve) => {
        execFile(process.execPath, [
            checker,
            '--client', client,
            ...(options.explicitHome ? ['--home', options.home] : []),
            '--json',
            '--timeout', '3000',
        ], {
            encoding: 'utf8',
            timeout: 14000,
            env: options.explicitHome ? { ...process.env, CODEX_HOME: path.join(options.home, '.codex') } : process.env,
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
    const codex = clients.includes('codex') ? await inspectCodexGateway(options) : undefined;
    const paths = [];
    for (const client of clients) {
        paths.push(client === 'codex' ? path.join(codexHome(options), 'config.toml')
            : client === 'kimi' ? await resolvedKimiConfigPath(options)
            : client === 'antigravity' ? await antigravityConfigPath(options)
                : client === 'devin' ? path.join(options.home, '.config/devin/mcp_config.json') : zcodeConfigPath(options));
    }
    const token = await resolveToken(options, paths, codex);
    let codexConfig;
    if (codex && !codex.server) {
        const configuredPath = paths[clients.indexOf('codex')];
        const target = await exists(configuredPath) ? await realpath(configuredPath) : configuredPath;
        const current = await exists(target) ? await readFile(target, 'utf8') : '';
        const section = ['[mcp_servers.siyuan_sisyphus]', 'url = '+JSON.stringify(SISYPHUS_URL), 'enabled = true',
            'http_headers = { Authorization = '+JSON.stringify('Bearer '+token)+' }'].join('\n');
        const serialized = (current ? current + '\n\n' : '') + section + '\n';
        await validateCodexCandidate(options, serialized);
        codexConfig = { target, serialized };
    }
    if (codex?.server && !codex.token) throw new Error('Codex 已有思源入口但未取得其认证配置，请先修复该条目。');
    for (const [index, client] of clients.entries()) {
        if (client === 'codex') continue;
        const config = await readJson(paths[index], { optional: true });
        const bridge = path.join(options.home, '.siyuan-sisyphus/bin/check-sisyphus.cjs');
        resolveJsonGatewayEntry(config, client === 'devin' ? bridge : undefined);
    }
    const shared = clients.find(client => client === 'kimi' || client === 'zcode');
    if (shared) await installSkill({ ...options, client: shared });
    if (clients.includes('antigravity')) await installSkill({ ...options, client: 'antigravity' });
    if (clients.some(client => client !== 'devin')) await installSessionCaptureHelper(options);
    for (const [index, client] of clients.entries()) {
        if (client === 'codex') {
            if (codexConfig) await atomicConfigWrite(codexConfig.target, codexConfig.serialized, options.dryRun);
        } else {
            await configureClient(client, paths[index], token, options);
        }
    }
    const checks = await Promise.all(clients.map(async client => ({ client, ...await verifyInstallation({ ...options, client }) })));
    console.log(`${options.dryRun ? '预检完成' : '持久登记完成'}：${clients.join('、')} → ${SISYPHUS_URL}`);
    for (const check of checks) console.log(`${check.client} Verification：${check.status}${check.issue ? ' ('+check.issue+')' : ''}`);
    console.log('检查结果只证明本机网关可调用。若客户端尚未读到配置，请手动重载，再开新对话验证。也可调用 system(action="bootstrap") 查看实际挂载。');
    if (options.requireReady && checks.some(check => !check.ready)) process.exitCode = 1;
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});

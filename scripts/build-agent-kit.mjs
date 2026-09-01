#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'agent-kit');
const output = path.join(root, 'siyuan-agent-kit.zip');
const fixedDate = new Date('2026-08-12T00:00:00.000Z');

const packageManifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const delivery = JSON.parse(await readFile(path.join(source, 'delivery.json'), 'utf8'));
const kimiManifest = JSON.parse(await readFile(path.join(source, 'kimi.plugin.json'), 'utf8'));
const codexManifestPath = path.join(root, 'agent-plugin/siyuan-sisyphus/.codex-plugin/plugin.json');
const codexManifest = JSON.parse(await readFile(codexManifestPath, 'utf8'));
const codexMcpConfig = JSON.parse(await readFile(path.join(root, 'agent-plugin/siyuan-sisyphus/.mcp.json'), 'utf8'));
const startHere = await readFile(path.join(source, 'START-HERE.md'), 'utf8');

if (delivery.packageVersion !== packageManifest.version
    || kimiManifest.version !== packageManifest.version
    || codexManifest.version !== packageManifest.version) {
    throw new Error(`接入包版本漂移：package=${packageManifest.version}, delivery=${delivery.packageVersion}, kimi=${kimiManifest.version}, codex=${codexManifest.version}。`);
}
const codexServers = Object.entries(codexMcpConfig.mcpServers ?? {});
if (codexServers.length !== 1
    || codexServers[0][0] !== 'siyuan-sisyphus'
    || codexServers[0][1]?.type !== 'http'
    || codexServers[0][1]?.url !== 'http://127.0.0.1:36806/mcp') {
    throw new Error('Codex Agent Plugin 必须只注册 http://127.0.0.1:36806/mcp。');
}
if (/github\.com\/clark874\/siyuan-plugins-mcp-sisyphus\/(?:releases\/download|releases\/tag)\/v\d/i.test(startHere)
    || /raw\.githubusercontent\.com\/clark874\/siyuan-plugins-mcp-sisyphus\/v\d/i.test(startHere)) {
    throw new Error('START-HERE.md 不得写死版本化发布地址；请通过稳定通道解析当前 Agent Kit。');
}
if (!startHere.includes('release-channel.json') || !startHere.includes('agentKit.url')) {
    throw new Error('START-HERE.md 必须从稳定通道读取 agentKit.url。');
}

async function listFiles(directory, prefix = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        if (entry.name === '.DS_Store' || entry.name === '__MACOSX') continue;
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (relative === 'scripts/check-sisyphus.mjs') continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await listFiles(absolute, relative));
        } else if (entry.isFile()) {
            files.push({ relative, absolute });
        }
    }
    return files;
}

const files = await listFiles(source);
if (!files.some((file) => file.relative === 'kimi.plugin.json')) {
    throw new Error('agent-kit 缺少 kimi.plugin.json。');
}
if (!files.some((file) => file.relative === 'START-HERE.md')
    || !files.some((file) => file.relative === 'delivery.json')
    || !files.some((file) => file.relative === 'scripts/install-agent-kit.mjs')
    || !files.some((file) => file.relative === 'bin/check-sisyphus.cjs')
    || !files.some((file) => file.relative === 'scripts/capture-agent-session.cjs')) {
    throw new Error('agent-kit 缺少便携安装入口、机器契约或安装器。');
}

const zip = new JSZip();
for (const file of files) {
    zip.file(file.relative, await readFile(file.absolute), {
        date: fixedDate,
        unixPermissions: file.relative.startsWith('scripts/') ? 0o755 : 0o644,
        createFolders: false,
    });
}

const archive = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    platform: 'UNIX',
});
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, archive, { mode: 0o644 });
console.log(`Generated ${path.basename(output)} with ${files.length} files (${archive.length} bytes).`);

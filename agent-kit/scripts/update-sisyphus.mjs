#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    access,
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rename,
    rm,
    writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const executeFile = promisify(execFile);
const PLUGIN_NAME = 'siyuan-plugins-mcp-sisyphus';
const DEFAULT_CHANNEL_URL = 'https://raw.githubusercontent.com/clark874/siyuan-plugins-mcp-sisyphus/codex/local-maintenance/release-channel.json';
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const MAX_ENTRY_COUNT = 10_000;
const MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;

function parseArguments(argv) {
    const options = {
        apply: false,
        channelUrl: DEFAULT_CHANNEL_URL,
        channelFile: undefined,
        packageFile: undefined,
        pluginDirectory: process.env.SIYUAN_SISYPHUS_PLUGIN_DIR,
    };
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (value === '--apply') options.apply = true;
        else if (value === '--plugin-dir') options.pluginDirectory = path.resolve(argv[++index] ?? '');
        else if (value === '--channel-url') options.channelUrl = argv[++index] ?? '';
        else if (value === '--channel-file') options.channelFile = path.resolve(argv[++index] ?? '');
        else if (value === '--package-file') options.packageFile = path.resolve(argv[++index] ?? '');
        else if (value === '--help' || value === '-h') {
            console.log([
                '用法：node scripts/update-sisyphus.mjs [--apply] [--plugin-dir <目录>]',
                '默认仅检查版本；--apply 才会校验、备份并替换思源中的唯一插件实例。',
                '测试或离线更新可传 --channel-file <清单> --package-file <安装包>。',
            ].join('\n'));
            process.exit(0);
        } else throw new Error(`未知参数：${value}`);
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

async function readJson(target, label) {
    try {
        return JSON.parse(await readFile(target, 'utf8'));
    } catch (error) {
        throw new Error(`${label}不是有效 JSON：${error instanceof Error ? error.message : String(error)}`);
    }
}

async function fetchBuffer(url, label) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error(`${label}只允许 HTTPS 地址。`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
        const response = await fetch(parsed, { redirect: 'follow', signal: controller.signal });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > MAX_ARCHIVE_BYTES) throw new Error(`${label}超过 ${MAX_ARCHIVE_BYTES} 字节上限。`);
        return buffer;
    } finally {
        clearTimeout(timeout);
    }
}

async function loadChannel(options) {
    const channel = options.channelFile
        ? await readJson(options.channelFile, '发布通道清单')
        : JSON.parse((await fetchBuffer(options.channelUrl, '发布通道清单')).toString('utf8'));
    if (channel?.schemaVersion !== 1 || channel?.channel !== 'stable') {
        throw new Error('发布通道清单的 schemaVersion 或 channel 无效。');
    }
    if (typeof channel.version !== 'string' || channel.version.length === 0) {
        throw new Error('发布通道清单缺少 version。');
    }
    if (typeof channel.package?.url !== 'string'
        || !/^[a-f0-9]{64}$/i.test(channel.package?.sha256 ?? '')) {
        throw new Error('发布通道清单缺少合法的安装包 URL 或 SHA-256。');
    }
    return channel;
}

async function resolvePluginDirectory(explicit) {
    const candidates = explicit ? [path.resolve(explicit)] : [
        path.join(os.homedir(), 'Downloads/SiYuan/data/plugins', PLUGIN_NAME),
        path.join(os.homedir(), 'Documents/SiYuan/data/plugins', PLUGIN_NAME),
        path.join(os.homedir(), 'SiYuan/data/plugins', PLUGIN_NAME),
        path.join(os.homedir(), 'Library/Application Support/SiYuan/data/plugins', PLUGIN_NAME),
    ];
    for (const candidate of candidates) {
        if (await exists(path.join(candidate, 'plugin.json'))) return candidate;
    }
    throw new Error('未找到已安装的 Sisyphus 插件。请用 --plugin-dir 指向 data/plugins/siyuan-plugins-mcp-sisyphus。');
}

async function verifyInstalledPlugin(pluginDirectory) {
    const manifest = await readJson(path.join(pluginDirectory, 'plugin.json'), '当前插件清单');
    if (manifest.name !== PLUGIN_NAME || typeof manifest.version !== 'string') {
        throw new Error(`目标目录不是 ${PLUGIN_NAME} 的有效安装目录。`);
    }
    return manifest;
}

function sha256(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}

function unsafeArchiveEntry(entry) {
    const normalized = entry.replaceAll('\\', '/');
    const withoutDirectoryMarker = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
    return withoutDirectoryMarker.length === 0
        || withoutDirectoryMarker.startsWith('/')
        || /^[A-Za-z]:\//.test(withoutDirectoryMarker)
        || withoutDirectoryMarker.split('/').some((segment) => segment === '..' || segment === '');
}

async function verifyArchive(packageFile) {
    const { stdout: namesOutput } = await executeFile('unzip', ['-Z1', packageFile], {
        maxBuffer: 8 * 1024 * 1024,
    });
    const entries = namesOutput.split(/\r?\n/).filter(Boolean);
    if (entries.length === 0 || entries.length > MAX_ENTRY_COUNT) {
        throw new Error(`安装包条目数量异常：${entries.length}。`);
    }
    const unsafe = entries.find(unsafeArchiveEntry);
    if (unsafe) throw new Error(`安装包包含不安全路径：${unsafe}`);

    const { stdout: totalsOutput } = await executeFile('unzip', ['-Z', '-t', packageFile], {
        maxBuffer: 1024 * 1024,
    });
    const totals = totalsOutput.match(/(\d+)\s+files?,\s+(\d+)\s+bytes?\s+uncompressed/i);
    if (!totals) throw new Error('无法核验安装包解压规模。');
    if (Number(totals[1]) !== entries.length || Number(totals[2]) > MAX_UNCOMPRESSED_BYTES) {
        throw new Error('安装包解压规模超过安全上限或条目统计不一致。');
    }
}

async function scanExtractedTree(directory) {
    let count = 0;
    let totalBytes = 0;
    async function visit(current) {
        for (const entry of await readdir(current, { withFileTypes: true })) {
            count += 1;
            if (count > MAX_ENTRY_COUNT) throw new Error('解压目录条目超过安全上限。');
            const target = path.join(current, entry.name);
            const metadata = await lstat(target);
            if (metadata.isSymbolicLink()) throw new Error(`安装包包含符号链接：${entry.name}`);
            if (metadata.isDirectory()) await visit(target);
            else if (metadata.isFile()) {
                totalBytes += metadata.size;
                if (totalBytes > MAX_UNCOMPRESSED_BYTES) throw new Error('解压内容超过安全上限。');
            } else throw new Error(`安装包包含不支持的文件类型：${entry.name}`);
        }
    }
    await visit(directory);
}

function backupLabel(version) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${timestamp}-${version}`;
}

async function applyUpdate(options, channel, pluginDirectory, currentManifest) {
    const parent = path.dirname(pluginDirectory);
    const stagingRoot = await mkdtemp(path.join(parent, '.sisyphus-update-'));
    const packageFile = path.join(stagingRoot, 'package.zip');
    const extracted = path.join(stagingRoot, 'extracted');
    let backupDirectory;
    let currentMoved = false;
    try {
        const archive = options.packageFile
            ? await readFile(options.packageFile)
            : await fetchBuffer(channel.package.url, '插件安装包');
        if (archive.length > MAX_ARCHIVE_BYTES) throw new Error('插件安装包超过安全上限。');
        const actualHash = sha256(archive);
        if (actualHash !== channel.package.sha256.toLowerCase()) {
            throw new Error(`插件安装包 SHA-256 不匹配：期望 ${channel.package.sha256}，实际 ${actualHash}。`);
        }
        await writeFile(packageFile, archive, { mode: 0o600 });
        await verifyArchive(packageFile);
        await mkdir(extracted);
        await executeFile('unzip', ['-qq', packageFile, '-d', extracted]);
        await scanExtractedTree(extracted);

        const nextManifest = await readJson(path.join(extracted, 'plugin.json'), '待安装插件清单');
        if (nextManifest.name !== PLUGIN_NAME || nextManifest.version !== channel.version) {
            throw new Error('安装包中的插件名称或版本与发布通道清单不一致。');
        }
        if (!await exists(path.join(extracted, 'mcp-server.cjs'))) {
            throw new Error('安装包缺少 mcp-server.cjs。');
        }

        const backupRoot = path.join(parent, '.sisyphus-backups');
        await mkdir(backupRoot, { recursive: true, mode: 0o700 });
        backupDirectory = path.join(backupRoot, backupLabel(currentManifest.version));
        await rename(pluginDirectory, backupDirectory);
        currentMoved = true;
        try {
            await rename(extracted, pluginDirectory);
            currentMoved = false;
        } catch (error) {
            await rename(backupDirectory, pluginDirectory);
            currentMoved = false;
            throw error;
        }
        console.log(`更新完成：${channel.version}`);
        console.log(`备份位置：${backupDirectory}`);
        console.log('请重启思源，再让各 Agent 重新连接并调用 system(action="bootstrap") 验收；无需重写客户端 MCP 配置。');
    } finally {
        if (currentMoved && backupDirectory && !await exists(pluginDirectory)) {
            await rename(backupDirectory, pluginDirectory).catch(() => undefined);
        }
        await rm(stagingRoot, { recursive: true, force: true });
    }
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const pluginDirectory = await resolvePluginDirectory(options.pluginDirectory);
    const currentManifest = await verifyInstalledPlugin(pluginDirectory);
    const channel = await loadChannel(options);
    if (currentManifest.version === channel.version) {
        console.log(`已是最新版本：${channel.version}`);
        return;
    }
    console.log(`可更新：${currentManifest.version} → ${channel.version}`);
    if (!options.apply) {
        console.log('当前仅检查版本；确认后添加 --apply。客户端配置和 Bearer token 不会被修改。');
        return;
    }
    await applyUpdate(options, channel, pluginDirectory, currentManifest);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});

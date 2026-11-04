/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-28 20:03:59
 * @FilePath     : /scripts/make_install.js
 * @LastEditTime : 2024-09-06 18:08:19
 * @Description  : 
 */
// make_install.js
import fs from 'fs';
import path from 'node:path';
import { log, error, getSiYuanDir, chooseTarget, getThisPluginName } from './utils.js';
import { exchangePluginDirectories } from '../agent-kit/scripts/exchange-plugin-directories.mjs';

let targetDir = '';

/**
 * 1. Get the parent directory to install the plugin
 */
log('>>> Try to visit constant "targetDir" in make_install.js...');
if (targetDir === '') {
    log('>>> Constant "targetDir" is empty, try to get SiYuan directory automatically....');
    let res = await getSiYuanDir();

    if (res === null || res === undefined || res.length === 0) {
        error('>>> Can not get SiYuan directory automatically');
        process.exit(1);
    } else {
        targetDir = await chooseTarget(res);
    }
    log(`>>> Successfully got target directory: ${targetDir}`);
}
if (!fs.existsSync(targetDir)) {
    error(`Failed! Plugin directory not exists: "${targetDir}"`);
    error('Please set the plugin directory in scripts/make_install.js');
    process.exit(1);
}

/**
 * 2. The dist directory, which contains the compiled plugin code
 */
const distDir = `${process.cwd()}/dist`;
if (!fs.existsSync(distDir)) {
    throw new Error('构建目录不存在，请先完成构建。');
}

/**
 * 3. The target directory to install the plugin
 */
const name = getThisPluginName();
if (name === null) {
    process.exit(1);
}
const targetPath = `${targetDir}/${name}`;

// 正式路径只做一次交换；复制、校验和失败清理均在隐藏暂存目录完成。
let current;
try { current = fs.lstatSync(targetPath); }
catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
if (current && !current.isDirectory()) throw new Error('目标必须是真实插件目录，不替换开发符号链接。');
const backupRoot = path.join(targetDir, '.sisyphus-backups');
fs.mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
const staged = fs.mkdtempSync(path.join(backupRoot, 'install-'));
let attempted = false;
try {
    fs.cpSync(distDir, staged, { recursive: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(staged, 'plugin.json'), 'utf8'));
    if (manifest.name !== name || !manifest.version || !fs.statSync(path.join(staged, 'mcp-server.cjs')).isFile()) {
        throw new Error('构建目录的插件清单或服务文件无效，保留当前安装。');
    }
    if (current) {
        attempted = true;
        await exchangePluginDirectories(targetPath, staged);
        log(`完整旧版备份：${staged}`);
    } else {
        fs.renameSync(staged, targetPath);
    }
    log(`安装完成：${manifest.version}。请用户手动重新加载插件。`);
} finally {
    // 一旦请求交换便保留两份目录，结果未知时也不删除旧版。
    if (!attempted) fs.rmSync(staged, { recursive: true, force: true });
}

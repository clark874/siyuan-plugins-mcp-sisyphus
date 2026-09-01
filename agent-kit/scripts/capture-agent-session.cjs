#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROVIDERS = new Set(['codex', 'zcode', 'claude-code', 'hermes', 'kimi', 'cursor', 'other']);

function fail(message) {
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
}

function parseArgs(argv) {
    const options = { provider: '', hostAlias: 'local', inferLatest: false };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--provider') options.provider = argv[++index] || '';
        else if (arg === '--host-alias') options.hostAlias = argv[++index] || '';
        else if (arg === '--infer-latest') options.inferLatest = true;
        else if (arg === '--help' || arg === '-h') options.help = true;
        else throw new Error(`未知参数：${arg}`);
    }
    return options;
}

function environmentCandidates(provider) {
    const candidates = {
        codex: ['CODEX_THREAD_ID', 'CODEX_SESSION_ID'],
        zcode: ['ZCODE_SESSION_ID'],
        'claude-code': ['CLAUDE_SESSION_ID'],
        hermes: ['HERMES_SESSION_ID', 'HERMES_SESSION_KEY'],
        kimi: ['KIMI_SESSION_ID'],
        cursor: ['CURSOR_SESSION_ID'],
        other: ['AGENT_SESSION_ID'],
    };
    return candidates[provider] || [];
}

function detectProvider(requested) {
    if (requested) return requested;
    for (const provider of PROVIDERS) {
        if (environmentCandidates(provider).some((name) => process.env[name])) return provider;
    }
    return '';
}

function readEnvironmentSession(provider) {
    for (const name of environmentCandidates(provider)) {
        const value = process.env[name]?.trim();
        if (value) return { sessionId: value, environmentVariable: name };
    }
    return null;
}

function inferLatestZCodeSession() {
    const rolloutDir = path.join(os.homedir(), '.zcode', 'cli', 'rollout');
    const candidates = fs.readdirSync(rolloutDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /^model-io-sess_[^/]+\.jsonl$/.test(entry.name))
        .map((entry) => {
            const absolute = path.join(rolloutDir, entry.name);
            return { name: entry.name, mtimeMs: fs.statSync(absolute).mtimeMs };
        })
        .sort((left, right) => right.mtimeMs - left.mtimeMs);
    if (candidates.length === 0) throw new Error(`未在 ${rolloutDir} 找到 ZCode rollout。`);
    return candidates[0].name.replace(/^model-io-/, '').replace(/\.jsonl$/, '');
}

function validIdentifier(value) {
    return typeof value === 'string' && value.length >= 1 && value.length <= 256 && !/[\u0000-\u001f]/.test(value);
}

function main() {
    let options;
    try { options = parseArgs(process.argv.slice(2)); } catch (error) { fail(error.message); return; }
    if (options.help) {
        process.stdout.write('用法：capture-agent-session.cjs [--provider codex|zcode|claude-code|hermes|kimi|cursor|other] [--host-alias local] [--infer-latest]\n');
        return;
    }
    const provider = detectProvider(options.provider);
    if (!PROVIDERS.has(provider)) { fail('无法确定 Agent 提供方；请显式传入 --provider。'); return; }
    if (!/^[\w.-]{1,64}$/.test(options.hostAlias)) { fail('host alias 只能包含字母、数字、下划线、句点和连字符。'); return; }

    const environment = readEnvironmentSession(provider);
    let sessionId = environment?.sessionId || '';
    let captureMethod = 'environment';
    let warning;
    if (!sessionId && options.inferLatest && provider === 'zcode') {
        try { sessionId = inferLatestZCodeSession(); } catch (error) { fail(error.message); return; }
        captureMethod = 'inferred_latest_rollout';
        warning = '会话标识按 ZCode rollout 修改时间推断；并发会话可能造成误配，写入后必须人工核对。';
    }
    if (!sessionId) {
        fail(`当前进程没有 ${provider} 会话标识。仅 ZCode 可在确认无并发后显式使用 --infer-latest。`);
        return;
    }
    if (!validIdentifier(sessionId)) { fail('捕获到的会话标识格式无效。'); return; }
    process.stdout.write(`${JSON.stringify({
        provider,
        sessionId,
        hostAlias: options.hostAlias,
        captureMethod,
        ...(environment ? { environmentVariable: environment.environmentVariable } : {}),
        ...(warning ? { warning } : {}),
    }, null, 2)}\n`);
}

main();

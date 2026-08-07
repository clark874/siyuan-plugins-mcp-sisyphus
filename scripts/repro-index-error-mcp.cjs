#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const { Client, InMemoryTransport } = require('@modelcontextprotocol/client');

const DIST_SERVER_PATH = path.join(__dirname, '..', 'dist', 'mcp-server.cjs');
const { createSiYuanServer } = require(DIST_SERVER_PATH);

const SIYUAN_URL = (process.env.SIYUAN_API_URL || 'http://127.0.0.1:6806').replace(/\/+$/, '');
const CONFIG_PATH = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpToolsConfig';
const TOKEN = process.env.SIYUAN_TOKEN || '';
const LOOPS = parsePositiveInt(process.env.REPRO_LOOPS, 120);
const MIN_BASE_BLOCKS = parsePositiveInt(process.env.REPRO_BLOCKS, 4);
const CONCURRENCY = parsePositiveInt(process.env.REPRO_CONCURRENCY, 6);
const READ_PROBES = parsePositiveInt(process.env.REPRO_READ_PROBES, 8);
const APPEND_BURST = parsePositiveInt(process.env.REPRO_APPEND_BURST, 4);
const UPDATE_BURST = parsePositiveInt(process.env.REPRO_UPDATE_BURST, 3);
const DELETE_BURST = parsePositiveInt(process.env.REPRO_DELETE_BURST, 3);
const KEEP_ON_FAIL = parseBoolean(process.env.REPRO_KEEP_ON_FAIL, true);
const ALWAYS_KEEP = parseBoolean(process.env.REPRO_ALWAYS_KEEP, false);
const LOG_FILE = process.env.REPRO_LOG_FILE || '';

const ENABLED_CONFIG = {
    notebook: {
        enabled: true,
        actions: { list: true, create: true, remove: true },
    },
    document: {
        enabled: true,
        actions: { create: true, remove: true, get_doc: true, get_child_blocks: true },
    },
    block: {
        enabled: true,
        actions: { append: true, update: true, delete: true, get_children: true },
    },
    av: { enabled: false, actions: {} },
    file: { enabled: false, actions: {} },
    search: { enabled: false, actions: {} },
    tag: { enabled: false, actions: {} },
    system: { enabled: true, actions: { get_version: true, get_current_time: true } },
    mascot: { enabled: false, actions: {} },
};

const state = {
    notebookId: null,
    documentId: null,
    documentPath: null,
    roundsCompleted: 0,
    lastSuccessfulStep: null,
    failed: false,
    events: [],
};

main().catch((error) => {
    console.error('\n=== FAILED ===');
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
});

async function main() {
    ensureDistExists();
    printConfig();

    const startedAt = Date.now();
    let failed = false;

    try {
        await withConfigMode(async () => withClient(async (client) => {
            await collectEnvironmentInfo(client);
            await setupFixture(client);
            await runConcurrentRepro(client);
        }));
        console.log('\n=== DONE ===');
        console.log(`Completed ${state.roundsCompleted}/${LOOPS} MCP rounds without reproducing the failure.`);
    } catch (error) {
        failed = true;
        state.failed = true;
        console.error('\n=== REPRO OR FAILURE CAPTURED ===');
        console.error(`Last successful step: ${state.lastSuccessfulStep || 'none'}`);
        console.error(`Rounds completed: ${state.roundsCompleted}/${LOOPS}`);
        throw error;
    } finally {
        await flushLog({
            finishedAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt,
            failed,
            keptFixture: ALWAYS_KEEP || (failed && KEEP_ON_FAIL),
        });
    }
}

function ensureDistExists() {
    if (!fs.existsSync(DIST_SERVER_PATH)) {
        throw new Error(`Missing built MCP server at ${DIST_SERVER_PATH}. Run "npm run build" first.`);
    }
}

async function withConfigMode(fn) {
    const originalFetch = global.fetch;
    global.fetch = async (url, options = {}) => {
        if (String(url) === `${SIYUAN_URL}/api/file/getFile`) {
            const body = options.body ? JSON.parse(options.body) : {};
            if (body.path === CONFIG_PATH) {
                return new Response(JSON.stringify(ENABLED_CONFIG), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        }
        return originalFetch(url, options);
    };

    try {
        return await fn();
    } finally {
        global.fetch = originalFetch;
    }
}

async function withClient(fn) {
    const server = await createSiYuanServer();
    const client = new Client({ name: 'repro-index-mcp', version: '0.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
        return await fn(client);
    } finally {
        await safeCleanup(async () => {
            if (state.notebookId && !shouldKeepFixture()) {
                await cleanupFixture(client);
            } else if (state.notebookId) {
                console.log(`[cleanup] keeping fixture notebook=${state.notebookId} doc=${state.documentId}`);
            }
        });
        await client.close().catch(() => {});
        await server.close().catch(() => {});
    }
}

async function collectEnvironmentInfo(client) {
    const version = await callToolJson(client, 'system', { action: 'get_version' }, 'system get_version').catch(() => null);
    const currentTime = await callToolJson(client, 'system', { action: 'get_current_time' }, 'system get_current_time').catch(() => null);
    logEvent('environment', {
        version: version?.json ?? null,
        currentTime: currentTime?.json ?? null,
        baseUrl: SIYUAN_URL,
    });
}

async function setupFixture(client) {
    const stamp = makeStamp();
    const notebookName = `Index Error MCP ${stamp}`;
    const createdNotebook = await callToolJson(client, 'notebook', {
        action: 'create',
        name: notebookName,
    }, 'notebook create');
    const notebookId = createdNotebook?.json?.notebook?.id || createdNotebook?.json?.id;
    if (typeof notebookId !== 'string' || !notebookId) {
        throw new Error(`Unexpected notebook.create payload: ${safeJson(createdNotebook?.json)}`);
    }

    const documentPath = `/Index Error MCP ${stamp}`;
    const createdDoc = await callToolJson(client, 'document', {
        action: 'create',
        notebook: notebookId,
        path: documentPath,
        markdown: [
            '# MCP Repro',
            '',
            `Created at: ${new Date().toISOString()}`,
            '',
            '- seed line A',
            '- seed line B',
        ].join('\n'),
    }, 'document create');
    const documentId = createdDoc?.json?.id;
    if (typeof documentId !== 'string' || !documentId) {
        throw new Error(`Unexpected document.create payload: ${safeJson(createdDoc?.json)}`);
    }

    state.notebookId = notebookId;
    state.documentId = documentId;
    state.documentPath = documentPath;

    await ensureMinimumBlocks(client, MIN_BASE_BLOCKS);
    state.lastSuccessfulStep = 'setup fixture';
    console.log(`[setup] notebook=${notebookId} doc=${documentId}`);
}

async function runConcurrentRepro(client) {
    for (let round = 1; round <= LOOPS; round += 1) {
        console.log(`\n[round ${round}/${LOOPS}]`);

        const baseline = await getChildBlocks(client, `round ${round} baseline`);
        if (baseline.length < Math.max(MIN_BASE_BLOCKS, UPDATE_BURST)) {
            await ensureMinimumBlocks(client, MIN_BASE_BLOCKS);
        }

        const workingBlocks = await getChildBlocks(client, `round ${round} working`);
        if (workingBlocks.length < Math.max(1, UPDATE_BURST)) {
            throw new Error(`Not enough child blocks for round ${round}: ${safeJson(workingBlocks)}`);
        }

        const updateTargets = workingBlocks.slice(0, Math.min(UPDATE_BURST, workingBlocks.length));
        const overlapProbe = runReadBurst(client, round, 'overlap');

        await runPool(updateTargets, CONCURRENCY, (block, index) => callToolJson(client, 'block', {
            action: 'update',
            id: block?.id,
            dataType: 'markdown',
            data: buildUpdateMarkdown(round, index),
        }, `round ${round} update #${index + 1}`));

        const appendedBlocks = await mapPool(
            Array.from({ length: APPEND_BURST }, (_, index) => index),
            CONCURRENCY,
            async (index) => {
                const result = await callToolJson(client, 'block', {
                    action: 'append',
                    parentID: state.documentId,
                    dataType: 'markdown',
                    data: `- concurrent append ${index + 1} round ${round}`,
                }, `round ${round} append #${index + 1}`);
                const payload = normalizeWritePayload(result.json);
                if (!payload.id) {
                    throw new Error(`round ${round} append #${index + 1} returned no block id: ${safeJson(result.json)}`);
                }
                return payload;
            },
        );

        const deleteTargets = [
            ...appendedBlocks.slice(0, Math.min(DELETE_BURST, appendedBlocks.length)),
            ...updateTargets.slice(0, Math.max(0, DELETE_BURST - appendedBlocks.length)),
        ].slice(0, DELETE_BURST);

        await runPool(deleteTargets, CONCURRENCY, (block, index) => callToolJson(client, 'block', {
            action: 'delete',
            id: block?.id,
        }, `round ${round} delete #${index + 1}`));

        verifyReadBurst(round, await overlapProbe, 'overlap');
        verifyReadBurst(round, await runReadBurst(client, round, 'post-write'), 'post-write');

        state.roundsCompleted = round;
        state.lastSuccessfulStep = `round ${round} concurrent MCP reads`;
    }
}

async function ensureMinimumBlocks(client, minCount) {
    let blocks = await getChildBlocks(client, 'ensure minimum blocks');
    while (blocks.length < minCount) {
        await callToolJson(client, 'block', {
            action: 'append',
            parentID: state.documentId,
            dataType: 'markdown',
            data: `- baseline block ${blocks.length + 1}`,
        }, `seed append ${blocks.length + 1}`);
        blocks = await getChildBlocks(client, 'refresh seeded blocks');
    }
}

async function getChildBlocks(client, label) {
    const result = await callToolJson(client, 'document', {
        action: 'get_child_blocks',
        id: state.documentId,
    }, label);
    return Array.isArray(result.json) ? result.json.filter((item) => item && typeof item === 'object') : [];
}

async function runReadBurst(client, round, phase) {
    return Promise.all(Array.from({ length: READ_PROBES }, (_, index) => readProbe(client, round, phase, index)));
}

async function readProbe(client, round, phase, index) {
    const [docResult, childBlocksResult, blockChildrenResult] = await Promise.allSettled([
        callToolJson(client, 'document', {
            action: 'get_doc',
            id: state.documentId,
            mode: 'markdown',
            page: 1,
            pageSize: 4000,
        }, `round ${round} ${phase} get_doc #${index + 1}`),
        callToolJson(client, 'document', {
            action: 'get_child_blocks',
            id: state.documentId,
        }, `round ${round} ${phase} get_child_blocks #${index + 1}`),
        callToolJson(client, 'block', {
            action: 'get_children',
            id: state.documentId,
        }, `round ${round} ${phase} block.get_children #${index + 1}`),
    ]);

    return { docResult, childBlocksResult, blockChildrenResult, phase, probe: index + 1 };
}

function verifyReadBurst(round, results, phase) {
    for (const result of results) {
        verifyReadProbe(round, result, phase);
    }
}

function verifyReadProbe(round, result, phase) {
    if (result.docResult.status === 'rejected') {
        throw annotateError(result.docResult.reason, `round ${round} ${phase} get_doc probe #${result.probe} failed`);
    }
    if (result.childBlocksResult.status === 'rejected') {
        throw annotateError(result.childBlocksResult.reason, `round ${round} ${phase} get_child_blocks probe #${result.probe} failed`);
    }
    if (result.blockChildrenResult.status === 'rejected') {
        throw annotateError(result.blockChildrenResult.reason, `round ${round} ${phase} get_children probe #${result.probe} failed`);
    }

    const docPayload = result.docResult.value.json;
    const docText = extractDocText(docPayload);
    if (docText !== null && docText.length === 0) {
        throw new Error(`round ${round} ${phase} get_doc probe #${result.probe} returned empty content: ${safeJson(docPayload)}`);
    }

    const childBlocks = extractDirectChildBlocks(result.childBlocksResult.value.json);
    const blockChildren = extractPagedChildren(result.blockChildrenResult.value.json);
    if (childBlocks.length === 0) {
        throw new Error(`round ${round} ${phase} get_child_blocks probe #${result.probe} returned empty array`);
    }
    if (blockChildren.length === 0) {
        throw new Error(`round ${round} ${phase} get_children probe #${result.probe} returned empty array`);
    }
    if (childBlocks.some((item) => !item.id) || blockChildren.some((item) => !item.id)) {
        throw new Error(`round ${round} ${phase} probe #${result.probe} returned malformed block ids`);
    }
}

async function cleanupFixture(client) {
    console.log('[cleanup] removing fixture data');
    await safeCleanup(() => callToolJson(client, 'document', {
        action: 'remove',
        id: state.documentId,
    }, 'cleanup document remove'));
    await safeCleanup(() => callToolJson(client, 'notebook', {
        action: 'remove',
        notebook: state.notebookId,
    }, 'cleanup notebook remove'));
}

async function callToolJson(client, name, args, label) {
    const startedAt = Date.now();
    let result;
    try {
        result = await client.callTool({ name, arguments: args });
    } catch (error) {
        logEvent('mcp-error', {
            label,
            name,
            args,
            durationMs: Date.now() - startedAt,
            message: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }

    const text = result.content?.[0]?.text ?? '';
    let json;
    try {
        json = JSON.parse(text);
    } catch {
        json = text;
    }

    logEvent('mcp', {
        label,
        name,
        action: args.action,
        durationMs: Date.now() - startedAt,
        args: summarizeArgs(args),
        response: summarizeResponse(json),
        isError: Boolean(result.isError),
    });

    if (result.isError) {
        throw new Error(`${label} MCP error: ${truncate(text, 600)}`);
    }

    if (json && typeof json === 'object' && json.error) {
        throw new Error(`${label} tool returned error payload: ${truncate(safeJson(json.error), 600)}`);
    }

    state.lastSuccessfulStep = label;
    return { result, json };
}

function buildUpdateMarkdown(round, index) {
    if (index === 0) {
        return ['## 空间对齐参数', '', `round=${round}`, `worker=${index + 1}`].join('\n');
    }
    return [
        '',
        `### ${round}-${index + 1}号 IMU（前右下坐标系）`,
        '',
        '| 设备 | X（前） | Y（右） | Z（下） |',
        '|:---:|:---:|:---:|:---:|',
        `| GPS | ${(round + index + 0.11).toFixed(2)} | ${(round + index + 0.22).toFixed(2)} | -1.16 |`,
        `| 声通 | ${(round + index + 0.11).toFixed(2)} | ${(round + index + 0.22).toFixed(2)} | -10.99 |`,
    ].join('\n');
}

function normalizeWritePayload(json) {
    if (Array.isArray(json)) return json[0] || {};
    return json && typeof json === 'object' ? json : {};
}

function normalizeBlockList(value) {
    return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
}

function extractDirectChildBlocks(value) {
    return normalizeBlockList(value);
}

function extractPagedChildren(value) {
    if (!value || typeof value !== 'object') return [];
    return normalizeBlockList(value.children);
}

function extractDocText(payload) {
    if (typeof payload === 'string') return payload;
    if (!payload || typeof payload !== 'object') return null;
    const content = [payload.content, payload.markdown, payload.html].find((value) => typeof value === 'string');
    return typeof content === 'string' ? content : null;
}

function shouldKeepFixture() {
    return ALWAYS_KEEP || (state.failed && KEEP_ON_FAIL);
}

function summarizeArgs(args) {
    const summary = { ...args };
    if (typeof summary.data === 'string') summary.data = truncate(summary.data, 120);
    return summary;
}

function summarizeResponse(value) {
    if (Array.isArray(value)) return { type: 'array', length: value.length, first: summarizeResponse(value[0]) };
    if (!value || typeof value !== 'object') return value;
    const summary = {};
    for (const key of ['success', 'id', 'mode', 'page', 'pageCount', 'truncated', 'content']) {
        if (value[key] !== undefined) summary[key] = key === 'content' ? truncate(String(value[key]), 120) : value[key];
    }
    if (Array.isArray(value.children)) {
        summary.children = { length: value.children.length, first: summarizeResponse(value.children[0]) };
    }
    if (Object.keys(summary).length === 0) {
        for (const [key, val] of Object.entries(value).slice(0, 6)) {
            summary[key] = typeof val === 'string' ? truncate(val, 120) : val;
        }
    }
    return summary;
}

function logEvent(type, payload) {
    state.events.push({ ts: new Date().toISOString(), type, payload });
    if (type === 'mcp') {
        console.log(`[mcp] ${payload.label} -> ${payload.durationMs}ms ${safeJson(payload.response)}`);
    }
}

async function flushLog(summary) {
    if (!LOG_FILE) return;
    const target = path.isAbsolute(LOG_FILE) ? LOG_FILE : path.join(process.cwd(), LOG_FILE);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, JSON.stringify({
        summary: {
            ...summary,
            notebookId: state.notebookId,
            documentId: state.documentId,
            documentPath: state.documentPath,
            roundsCompleted: state.roundsCompleted,
            lastSuccessfulStep: state.lastSuccessfulStep,
            baseUrl: SIYUAN_URL,
        },
        events: state.events,
    }, null, 2), 'utf8');
    console.log(`[log] wrote ${target}`);
}

async function safeCleanup(fn) {
    try {
        await fn();
    } catch (error) {
        console.error(`[cleanup] ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function runPool(items, concurrency, worker) {
    await mapPool(items, concurrency, worker);
}

async function mapPool(items, concurrency, worker) {
    const results = new Array(items.length);
    let cursor = 0;
    const runners = Array.from({ length: Math.min(concurrency, items.length || 1) }, async () => {
        while (cursor < items.length) {
            const currentIndex = cursor;
            cursor += 1;
            results[currentIndex] = await worker(items[currentIndex], currentIndex);
        }
    });
    await Promise.all(runners);
    return results;
}

function printConfig() {
    console.log('\n=== CONFIG ===');
    console.log(`baseUrl=${SIYUAN_URL}`);
    console.log(`loops=${LOOPS}`);
    console.log(`minBaseBlocks=${MIN_BASE_BLOCKS}`);
    console.log(`concurrency=${CONCURRENCY}`);
    console.log(`readProbes=${READ_PROBES}`);
    console.log(`appendBurst=${APPEND_BURST}`);
    console.log(`updateBurst=${UPDATE_BURST}`);
    console.log(`deleteBurst=${DELETE_BURST}`);
    console.log(`keepOnFail=${KEEP_ON_FAIL}`);
    console.log(`alwaysKeep=${ALWAYS_KEEP}`);
    if (LOG_FILE) console.log(`logFile=${LOG_FILE}`);
    if (!TOKEN) console.log('token=<empty>');
}

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value, fallback) {
    if (value === undefined) return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
}

function safeJson(value) {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function truncate(value, maxLength) {
    return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function annotateError(error, prefix) {
    if (error instanceof Error) {
        error.message = `${prefix}: ${error.message}`;
        return error;
    }
    return new Error(`${prefix}: ${String(error)}`);
}

function makeStamp() {
    const now = new Date();
    const pad = (num) => String(num).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

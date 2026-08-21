#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const { Client, StreamableHTTPClientTransport } = require('@modelcontextprotocol/client');
const { scoreRanking, summarizeBackend } = require('./score.cjs');

const SIYUAN_URL = (process.env.SIYUAN_API_URL || 'http://127.0.0.1:6806').replace(/\/+$/, '');
const MCP_URL = process.env.SIYUAN_MCP_URL || 'http://127.0.0.1:36806/mcp';
const SETTINGS_PATH = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpHttpSettings';

function readArg(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseFixture(path) {
    const raw = readFileSync(path, 'utf8');
    const fixture = JSON.parse(raw);
    assert.equal(fixture.schemaVersion, 1, '评测集 schemaVersion 必须为 1');
    assert.ok(Array.isArray(fixture.queries) && fixture.queries.length > 0, '评测集必须包含 queries');
    const ids = new Set();
    for (const query of fixture.queries) {
        assert.equal(typeof query.id, 'string');
        assert.equal(typeof query.query, 'string');
        assert.ok(!ids.has(query.id), `重复查询 ID：${query.id}`);
        ids.add(query.id);
        assert.ok(Array.isArray(query.expected), `查询 ${query.id} 缺少 expected`);
        if (query.expectedResolution === 'no_match') {
            assert.equal(query.expected.length, 0, `无答案查询 ${query.id} 的 expected 必须为空`);
        } else {
            assert.ok(query.expected.length > 0, `查询 ${query.id} 缺少 expected`);
        }
    }
    return {
        fixture,
        sha256: createHash('sha256').update(raw).digest('hex'),
    };
}

async function readMcpToken() {
    const response = await fetch(`${SIYUAN_URL}/api/file/getFile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: SETTINGS_PATH }),
    });
    assert.equal(response.ok, true, `读取 MCP 设置失败：HTTP ${response.status}`);
    const settings = await response.json();
    assert.equal(typeof settings.token, 'string', 'MCP 设置缺少 token');
    return settings.token;
}

function parseToolText(result) {
    const text = result.content?.find((item) => item.type === 'text')?.text ?? '';
    return { text, json: JSON.parse(text) };
}

async function callSearch(client, args) {
    const start = performance.now();
    const result = await client.callTool({ name: 'search', arguments: args });
    const latencyMs = performance.now() - start;
    if (result.isError) throw new Error(`search.${args.action} 失败：${result.content?.[0]?.text ?? 'unknown error'}`);
    const parsed = parseToolText(result);
    return {
        json: parsed.json,
        latencyMs,
        responseBytes: Buffer.byteLength(parsed.text, 'utf8'),
    };
}

function idsFromResult(json) {
    const candidates = Array.isArray(json.data) ? json.data : Array.isArray(json.blocks) ? json.blocks : [];
    return candidates.map((item) => item?.id).filter((id) => typeof id === 'string');
}

function expectedResolutionMatches(expected, json) {
    if (!expected) return null;
    if (expected === 'unique') return json.retrievalMode === 'namespace_exact';
    if (expected === 'ambiguity') return json.retrievalMode === 'namespace_ambiguous';
    if (expected === 'fallback') {
        return json.retrievalMode === 'semantic_fallback' || json.retrievalMode === 'namespace_seeded_semantic';
    }
    if (expected === 'no_match') {
        const candidates = Array.isArray(json.data) ? json.data : [];
        return candidates.length === 0;
    }
    return false;
}

const BACKENDS = {
    fulltext: (query) => ({ action: 'fulltext', query, page: 1, pageSize: 10 }),
    semantic: (query) => ({ action: 'semantic', query, page: 1, pageSize: 10 }),
    knowledge_baseline: (query) => ({ action: 'knowledge', query, pageSize: 10, candidateSize: 30, namespaceMode: 'off' }),
    namespace_first: (query, item) => ({
        action: 'knowledge', query, pageSize: 10, candidateSize: 30,
        ...(Array.isArray(item.activeScopes) ? { activeScopes: item.activeScopes } : {}),
    }),
};

async function validateExpectedIds(client, fixture) {
    const expectedIds = [...new Set(fixture.queries.flatMap((query) => query.expected.map((item) => item.id)))];
    const found = new Set();
    for (let offset = 0; offset < expectedIds.length; offset += 100) {
        const batch = expectedIds.slice(offset, offset + 100);
        const quoted = batch.map((id) => `'${String(id).replaceAll("'", "''")}'`).join(',');
        const result = await callSearch(client, {
            action: 'query_sql',
            stmt: `SELECT id, box FROM blocks WHERE id IN (${quoted}) LIMIT ${batch.length}`,
            maxRows: batch.length,
        });
        for (const row of result.json.data ?? []) if (typeof row.id === 'string') found.add(row.id);
    }
    const missing = expectedIds.filter((id) => !found.has(id));
    assert.deepEqual(missing, [], `评测集包含不存在或不可读的目标块：${missing.join(', ')}`);
}

async function main() {
    const fixturePath = readArg('--fixture');
    assert.ok(fixturePath, '用法：node scripts/retrieval-eval/runner.cjs --fixture <fixture.json> [--output result.json]');
    const absoluteFixture = resolve(fixturePath);
    const parsedFixture = parseFixture(absoluteFixture);
    const fixture = parsedFixture.fixture;
    const token = await readMcpToken();
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    const client = new Client({ name: 'sisyphus-retrieval-eval', version: '1.0.0' });
    await client.connect(transport);
    try {
        await validateExpectedIds(client, fixture);
        const rows = [];
        for (const item of fixture.queries) {
            for (const [backend, buildArgs] of Object.entries(BACKENDS)) {
                const result = await callSearch(client, buildArgs(item.query, item));
                const resultIds = idsFromResult(result.json);
                rows.push({
                    queryId: item.id,
                    queryType: item.type,
                    backend,
                    resultIds,
                    metrics: scoreRanking(resultIds, item.expected),
                    falsePositive: item.expectedResolution === 'no_match' ? resultIds.length > 0 : null,
                    resolutionCorrect: backend === 'namespace_first'
                        ? expectedResolutionMatches(item.expectedResolution, result.json)
                        : null,
                    latencyMs: Math.round(result.latencyMs * 100) / 100,
                    responseBytes: result.responseBytes,
                    externalCost: result.json.externalCost === true,
                    dataEgress: result.json.dataEgress === true,
                    retrievalMode: result.json.retrievalMode,
                    resolutionStatus: result.json.resolutionStatus,
                });
            }
        }
        const summary = Object.fromEntries(Object.keys(BACKENDS).map((backend) => [
            backend,
            summarizeBackend(rows.filter((row) => row.backend === backend)),
        ]));
        const queryTypes = [...new Set(fixture.queries.map((query) => query.type))];
        const byType = Object.fromEntries(queryTypes.map((queryType) => [
            queryType,
            Object.fromEntries(Object.keys(BACKENDS).map((backend) => [
                backend,
                summarizeBackend(rows.filter((row) => row.backend === backend && row.queryType === queryType)),
            ])),
        ]));
        const report = {
            schemaVersion: 1,
            generatedAt: new Date().toISOString(),
            fixture: absoluteFixture,
            fixtureSha256: parsedFixture.sha256,
            queryCount: fixture.queries.length,
            summary,
            byType,
            rows,
        };
        const output = readArg('--output');
        if (output) {
            const outputPath = resolve(output);
            mkdirSync(dirname(outputPath), { recursive: true });
            writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
        }
        process.stdout.write(`${JSON.stringify(report)}\n`);
    } finally {
        await client.close();
    }
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
});

#!/usr/bin/env node

const assert = require('node:assert/strict');
const path = require('node:path');
const { Client, InMemoryTransport, StreamableHTTPClientTransport } = require('@modelcontextprotocol/client');
const { createSiYuanServer } = require(path.join(__dirname, '..', '..', 'dist', 'mcp-server.cjs'));

const SIYUAN_URL = process.env.SIYUAN_URL || 'http://127.0.0.1:6806';
const MCP_URL = process.env.SIYUAN_MCP_URL || 'http://127.0.0.1:36806/mcp';
const HTTP_SETTINGS_PATH = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpHttpSettings';
const EXPECTED_TOOLS = [
    'fs', 'notebook', 'document', 'block', 'av', 'file', 'project',
    'search', 'provenance', 'tag', 'timeline', 'system', 'extension',
];
const EXPECTED_EXTENSION_ACTIONS = ['list', 'outline', 'ref', 'search', 'web_fetch', 'web_search'];
const REMOVED = [
    'mascot', 'feedback', 'flashcard', 'search_assets', 'fulltext_asset_content',
    'upload_asset', 'get_image_ocr_text', 'delete_node', 'rollback_document', 'rollback_block',
];

function payload(result) {
    const text = result.content?.find((item) => item.type === 'text')?.text ?? '{}';
    return JSON.parse(text);
}

function assertSurface(tools, expectNativeExtensions = false) {
    assert.deepEqual(tools.map((tool) => tool.name), EXPECTED_TOOLS);
    const actions = tools.flatMap((tool) => (
        tool.inputSchema?.properties?.action?.enum ?? []
    ).filter((action) => action !== 'help'));
    const extension = tools.find((tool) => tool.name === 'extension');
    const extensionActions = (extension?.inputSchema?.properties?.action?.enum ?? []).filter((action) => action !== 'help');
    assert.deepEqual(extensionActions, expectNativeExtensions ? EXPECTED_EXTENSION_ACTIONS : ['list']);
    assert.equal(actions.length, expectNativeExtensions ? 99 : 94);
    const surface = JSON.stringify({ names: tools.map((tool) => tool.name), actions });
    for (const removed of REMOVED) assert.equal(surface.includes(`"${removed}"`), false, `仍暴露旧动作：${removed}`);
}

async function readHttpToken() {
    const response = await fetch(`${SIYUAN_URL}/api/file/getFile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: HTTP_SETTINGS_PATH }),
    });
    assert.equal(response.ok, true, `读取 MCP HTTP 设置失败：HTTP ${response.status}`);
    const settings = await response.json();
    assert.equal(typeof settings.token, 'string');
    assert.ok(settings.token.length > 0, 'MCP HTTP token 为空');
    return settings.token;
}

async function runInMemory() {
    const server = await createSiYuanServer();
    const client = new Client({ name: 'sisyphus-live-smoke', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
        assertSurface((await client.listTools()).tools);
        const version = payload(await client.callTool({ name: 'system', arguments: { action: 'get_version' } }));
        assert.match(version.version, /^3\./);
        const bootstrap = payload(await client.callTool({ name: 'system', arguments: { action: 'bootstrap' } }));
        assert.equal(bootstrap.bootstrap, true);
        const memory = await client.callTool({ name: 'fs', arguments: { action: 'read', path: '/AGENTS.md' } });
        assert.notEqual(memory.isError, true, `读取 /AGENTS.md 失败：${JSON.stringify(payload(memory))}`);
        const removed = await client.callTool({ name: 'feedback', arguments: { action: 'submit' } });
        assert.equal(removed.isError, true);
        return version.version;
    } finally {
        await client.close().catch(() => {});
        await server.close().catch(() => {});
    }
}

async function runHttp() {
    const endpoint = new URL(MCP_URL);
    assert.ok(['127.0.0.1', 'localhost', '::1', '[::1]'].includes(endpoint.hostname), '冒烟测试只允许连接回环 MCP 地址');
    const client = new Client({ name: 'sisyphus-live-http-smoke', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(endpoint, {
        requestInit: { headers: { Authorization: `Bearer ${await readHttpToken()}` } },
    });
    await client.connect(transport);
    try {
        assertSurface((await client.listTools()).tools, true);
        const result = await client.callTool({ name: 'system', arguments: { action: 'get_version' } });
        assert.notEqual(result.isError, true);
    } finally {
        await transport.close();
    }
}

async function main() {
    const response = await fetch(`${SIYUAN_URL}/api/system/version`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!response.ok) throw new Error(`无法连接思源：${SIYUAN_URL}`);
    const version = await runInMemory();
    await runHttp();
    console.log(`Live smoke passed: SiYuan ${version}, 13 tools, 94 maintained actions, 5 allowlisted native extension entrypoints.`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
});

#!/usr/bin/env node

const assert = require('node:assert/strict');

const { Client, StreamableHTTPClientTransport } = require('@modelcontextprotocol/client');

const SIYUAN_URL = (process.env.SIYUAN_API_URL || 'http://127.0.0.1:6806').replace(/\/+$/, '');
const MCP_URL = process.env.SIYUAN_MCP_URL || 'http://127.0.0.1:36806/mcp';
const SETTINGS_PATH = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpHttpSettings';

async function readMcpToken() {
    const response = await fetch(`${SIYUAN_URL}/api/file/getFile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: SETTINGS_PATH }),
    });
    assert.equal(response.ok, true, `读取 MCP 设置失败：HTTP ${response.status}`);
    const settings = await response.json();
    assert.equal(typeof settings.token, 'string', 'MCP 设置中缺少 token');
    assert.ok(settings.token.length > 0, 'MCP token 为空');
    return settings.token;
}

function parseToolResult(result) {
    const text = result.content?.[0]?.text ?? '';
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

async function call(client, name, args) {
    const result = await client.callTool({ name, arguments: args });
    return { result, json: parseToolResult(result) };
}

function childrenOf(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.children)) return payload.children;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
}

async function main() {
    const mcpEndpoint = new URL(MCP_URL);
    assert.ok(['127.0.0.1', 'localhost', '::1', '[::1]'].includes(mcpEndpoint.hostname), '实机抽检只允许把本地 token 发送到回环地址');
    const token = await readMcpToken();
    const client = new Client({ name: 'local19-overwrite-smoke', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(mcpEndpoint, {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const purePath = `/工作日志/_mcp_local19_pure_${stamp}`;
    const anchorPath = `/工作日志/_mcp_local19_anchor_${stamp}`;
    const complexPath = `/工作日志/_mcp_local19_complex_${stamp}`;
    const cleanupPaths = [];
    let primaryError;

    await client.connect(transport);
    try {
        const bootstrap = await call(client, 'system', { action: 'bootstrap' });
        assert.equal(bootstrap.result.isError, undefined, `bootstrap 失败：${JSON.stringify(bootstrap.json)}`);

        const pureCreated = await call(client, 'fs', { action: 'write', path: purePath, markdown: '初始正文' });
        assert.equal(pureCreated.result.isError, undefined, `纯文档创建失败：${JSON.stringify(pureCreated.json)}`);
        cleanupPaths.push(purePath);
        const pureOverwrite = await call(client, 'fs', { action: 'write', path: purePath, markdown: '替换正文', overwrite: true });
        assert.equal(pureOverwrite.result.isError, undefined, `纯 Markdown 覆写应放行：${JSON.stringify(pureOverwrite.json)}`);

        const anchorCreated = await call(client, 'fs', { action: 'write', path: anchorPath, markdown: '- 即时锚点测试' });
        assert.equal(anchorCreated.result.isError, undefined, `锚点文档创建失败：${JSON.stringify(anchorCreated.json)}`);
        cleanupPaths.push(anchorPath);
        const anchorDocId = anchorCreated.json.id;
        const anchorTop = await call(client, 'block', { action: 'get_children', id: anchorDocId });
        const listBlock = childrenOf(anchorTop.json).find((block) => block.type === 'l');
        assert.ok(listBlock?.id, `未找到列表容器：${JSON.stringify(anchorTop.json)}`);
        const anchorNested = await call(client, 'block', { action: 'get_children', id: listBlock.id });
        const listItem = childrenOf(anchorNested.json).find((block) => block.type === 'i');
        assert.ok(listItem?.id, `未找到列表项：${JSON.stringify(anchorNested.json)}`);
        const attrs = await call(client, 'block', {
            action: 'set_attrs',
            id: listItem.id,
            attrs: { name: `local19-fresh-${stamp}`, memo: '索引延迟即时拒绝抽检' },
        });
        assert.equal(attrs.result.isError, undefined, `即时属性写入失败：${JSON.stringify(attrs.json)}`);
        const attrsReadback = await call(client, 'block', { action: 'get_attrs', id: listItem.id });
        assert.equal(attrsReadback.json.name, `local19-fresh-${stamp}`, `name 回读不一致：${JSON.stringify(attrsReadback.json)}`);
        assert.equal(attrsReadback.json.memo, '索引延迟即时拒绝抽检', `memo 回读不一致：${JSON.stringify(attrsReadback.json)}`);
        const anchorOverwrite = await call(client, 'fs', { action: 'write', path: anchorPath, markdown: '不应写入', overwrite: true });
        assert.equal(anchorOverwrite.result.isError, true, '刚写入锚点后立即整篇覆写必须拒绝');
        assert.equal(anchorOverwrite.json.error?.type, 'structured_assets_overwrite_rejected');
        const anchorAfterReject = await call(client, 'fs', { action: 'read', path: anchorPath });
        assert.match(anchorAfterReject.json.content, /即时锚点测试/, '拒绝后原正文必须保持不变');
        assert.doesNotMatch(anchorAfterReject.json.content, /不应写入/, '拒绝后不得出现替换正文');

        const complexCreated = await call(client, 'fs', { action: 'write', path: complexPath, markdown: '- 深层复杂块测试' });
        assert.equal(complexCreated.result.isError, undefined, `复杂块文档创建失败：${JSON.stringify(complexCreated.json)}`);
        cleanupPaths.push(complexPath);
        const complexTop = await call(client, 'block', { action: 'get_children', id: complexCreated.json.id });
        const complexList = childrenOf(complexTop.json).find((block) => block.type === 'l');
        assert.ok(complexList?.id, `未找到复杂块测试列表：${JSON.stringify(complexTop.json)}`);
        const complexNested = await call(client, 'block', { action: 'get_children', id: complexList.id });
        const complexItem = childrenOf(complexNested.json).find((block) => block.type === 'i');
        assert.ok(complexItem?.id, `未找到复杂块测试列表项：${JSON.stringify(complexNested.json)}`);
        const appended = await call(client, 'block', {
            action: 'append',
            parentID: complexItem.id,
            dataType: 'markdown',
            data: '{{ SELECT * FROM blocks LIMIT 1 }}',
        });
        assert.equal(appended.result.isError, undefined, `查询嵌入块创建失败：${JSON.stringify(appended.json)}`);
        const complexAfter = await call(client, 'block', { action: 'get_children', id: complexItem.id });
        assert.ok(childrenOf(complexAfter.json).some((block) => block.type === 'query_embed'), `未生成嵌套 query_embed：${JSON.stringify(complexAfter.json)}`);
        const complexOverwrite = await call(client, 'fs', { action: 'write', path: complexPath, markdown: '不应写入', overwrite: true });
        assert.equal(complexOverwrite.result.isError, true, '列表深处存在 query_embed 时整篇覆写必须拒绝');
        assert.equal(complexOverwrite.json.error?.type, 'complex_blocks_not_supported_by_fs');

        console.log(JSON.stringify({
            success: true,
            checks: ['bootstrap', 'pure_markdown_allowed', 'fresh_attrs_rejected', 'nested_query_embed_rejected'],
        }, null, 2));
    } catch (error) {
        primaryError = error;
        throw error;
    } finally {
        const cleanupFailures = [];
        for (const path of cleanupPaths.reverse()) {
            try {
                const cleanup = await call(client, 'fs', { action: 'rm', path });
                if (cleanup.result.isError) cleanupFailures.push({ path, error: cleanup.json });
            } catch (error) {
                cleanupFailures.push({ path, error: error instanceof Error ? error.message : String(error) });
            }
        }
        await client.close().catch(() => {});
        await transport.close().catch(() => {});
        if (cleanupFailures.length > 0 && !primaryError) {
            throw new Error(`实机抽检清理失败：${JSON.stringify(cleanupFailures)}`);
        }
        if (cleanupFailures.length > 0 && primaryError) {
            console.error(`实机抽检同时发生清理失败：${JSON.stringify(cleanupFailures)}`);
            process.exitCode = 1;
        }
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
});

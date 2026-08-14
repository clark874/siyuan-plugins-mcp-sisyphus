#!/usr/bin/env node

const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');

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

function uuidv7() {
    const timestamp = BigInt(Date.now());
    const bytes = randomBytes(16);
    for (let index = 5; index >= 0; index -= 1) {
        bytes[index] = Number(timestamp >> BigInt((5 - index) * 8) & 0xffn);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x70;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function strictCall(client, name, args) {
    const preflight = await call(client, name, { ...args, validateOnly: true });
    assert.equal(preflight.result.isError, undefined, `严格写入预检失败：${JSON.stringify(preflight.json)}`);
    const execution = { ...args, requestId: uuidv7() };
    const field = preflight.json.preconditionField;
    if (typeof field === 'string') {
        const hashField = Object.keys(preflight.json).find((key) => key.endsWith('Hash') && key !== 'preconditionField');
        assert.ok(hashField, `预检未返回哈希凭据：${JSON.stringify(preflight.json)}`);
        execution[field] = preflight.json[hashField];
    }
    return call(client, name, execution);
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
        assert.equal(bootstrap.json.writeSafety?.protocol, 'preflight-lease-v1', `bootstrap 未返回严格写入协议：${JSON.stringify(bootstrap.json)}`);

        const semantic = await call(client, 'extension', {
            action: 'search',
            arguments: { action: 'semantic', query: '中文文本网络分析 分词', page: 1, pageSize: 5 },
        });
        assert.equal(semantic.result.isError, undefined, `原生语义搜索桥接失败：${JSON.stringify(semantic.json)}`);
        assert.equal(
            semantic.json && typeof semantic.json === 'object' && !Array.isArray(semantic.json)
                ? Object.prototype.hasOwnProperty.call(semantic.json, 'safety')
                : false,
            false,
            `只读语义结果被安全元数据替换：${JSON.stringify(semantic.json)}`,
        );

        const pureCreated = await strictCall(client, 'fs', { action: 'write', path: purePath, markdown: '初始正文' });
        assert.equal(pureCreated.result.isError, undefined, `纯文档创建失败：${JSON.stringify(pureCreated.json)}`);
        cleanupPaths.push(purePath);
        const pureOverwrite = await strictCall(client, 'fs', { action: 'write', path: purePath, markdown: '替换正文', overwrite: true });
        assert.equal(pureOverwrite.result.isError, undefined, `纯 Markdown 覆写应放行：${JSON.stringify(pureOverwrite.json)}`);

        const anchorCreated = await strictCall(client, 'fs', { action: 'write', path: anchorPath, markdown: '- 即时锚点测试' });
        assert.equal(anchorCreated.result.isError, undefined, `锚点文档创建失败：${JSON.stringify(anchorCreated.json)}`);
        cleanupPaths.push(anchorPath);
        const anchorDocId = anchorCreated.json.id;
        const anchorTop = await call(client, 'block', { action: 'get_children', id: anchorDocId });
        const listBlock = childrenOf(anchorTop.json).find((block) => block.type === 'l');
        assert.ok(listBlock?.id, `未找到列表容器：${JSON.stringify(anchorTop.json)}`);
        const anchorNested = await call(client, 'block', { action: 'get_children', id: listBlock.id });
        const listItem = childrenOf(anchorNested.json).find((block) => block.type === 'i');
        assert.ok(listItem?.id, `未找到列表项：${JSON.stringify(anchorNested.json)}`);
        const attrs = await strictCall(client, 'block', {
            action: 'set_attrs',
            id: listItem.id,
            attrs: { name: `local19-fresh-${stamp}`, memo: '索引延迟即时拒绝抽检' },
        });
        assert.equal(attrs.result.isError, undefined, `即时属性写入失败：${JSON.stringify(attrs.json)}`);
        const attrsReadback = await call(client, 'block', { action: 'get_attrs', id: listItem.id });
        assert.equal(attrsReadback.json.name, `local19-fresh-${stamp}`, `name 回读不一致：${JSON.stringify(attrsReadback.json)}`);
        assert.equal(attrsReadback.json.memo, '索引延迟即时拒绝抽检', `memo 回读不一致：${JSON.stringify(attrsReadback.json)}`);
        const anchorOverwrite = await strictCall(client, 'fs', { action: 'write', path: anchorPath, markdown: '不应写入', overwrite: true });
        assert.equal(anchorOverwrite.result.isError, true, '刚写入锚点后立即整篇覆写必须拒绝');
        assert.equal(anchorOverwrite.json.error?.type, 'structured_assets_overwrite_rejected');
        const anchorAfterReject = await call(client, 'fs', { action: 'read', path: anchorPath });
        assert.match(anchorAfterReject.json.content, /即时锚点测试/, '拒绝后原正文必须保持不变');
        assert.doesNotMatch(anchorAfterReject.json.content, /不应写入/, '拒绝后不得出现替换正文');

        const complexCreated = await strictCall(client, 'fs', { action: 'write', path: complexPath, markdown: '- 深层复杂块测试' });
        assert.equal(complexCreated.result.isError, undefined, `复杂块文档创建失败：${JSON.stringify(complexCreated.json)}`);
        cleanupPaths.push(complexPath);
        const complexTop = await call(client, 'block', { action: 'get_children', id: complexCreated.json.id });
        const complexList = childrenOf(complexTop.json).find((block) => block.type === 'l');
        assert.ok(complexList?.id, `未找到复杂块测试列表：${JSON.stringify(complexTop.json)}`);
        const complexNested = await call(client, 'block', { action: 'get_children', id: complexList.id });
        const complexItem = childrenOf(complexNested.json).find((block) => block.type === 'i');
        assert.ok(complexItem?.id, `未找到复杂块测试列表项：${JSON.stringify(complexNested.json)}`);
        const appended = await strictCall(client, 'block', {
            action: 'append',
            parentID: complexItem.id,
            dataType: 'markdown',
            data: '{{ SELECT * FROM blocks LIMIT 1 }}',
        });
        assert.equal(appended.result.isError, undefined, `查询嵌入块创建失败：${JSON.stringify(appended.json)}`);
        const complexAfter = await call(client, 'block', { action: 'get_children', id: complexItem.id });
        assert.ok(childrenOf(complexAfter.json).some((block) => block.type === 'query_embed'), `未生成嵌套 query_embed：${JSON.stringify(complexAfter.json)}`);
        const complexOverwrite = await strictCall(client, 'fs', { action: 'write', path: complexPath, markdown: '不应写入', overwrite: true });
        assert.equal(complexOverwrite.result.isError, true, '列表深处存在 query_embed 时整篇覆写必须拒绝');
        assert.equal(complexOverwrite.json.error?.type, 'complex_blocks_not_supported_by_fs');

        console.log(JSON.stringify({
            success: true,
            checks: ['bootstrap_write_protocol', 'bridged_semantic_read', 'pure_markdown_allowed', 'fresh_attrs_rejected', 'nested_query_embed_rejected'],
        }, null, 2));
    } catch (error) {
        primaryError = error;
        throw error;
    } finally {
        const cleanupFailures = [];
        for (const path of cleanupPaths.reverse()) {
            try {
                const cleanup = await strictCall(client, 'fs', { action: 'rm', path });
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

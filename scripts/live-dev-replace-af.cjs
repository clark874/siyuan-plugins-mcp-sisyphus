#!/usr/bin/env node

const assert = require('node:assert/strict');
const path = require('node:path');
const { Client, InMemoryTransport } = require('@modelcontextprotocol/client');

const { createSiYuanServer } = require(path.join(__dirname, '..', 'dev', 'mcp-server.cjs'));

const SIYUAN_URL = (process.env.SIYUAN_API_URL || 'http://127.0.0.1:6806').replace(/\/+$/, '');
const CONFIG_PATH = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpToolsConfig';
const TEST_PREFIX = `Sisyphus Replace AF ${Date.now()}`;

const ALL_ENABLED_CONFIG = {
    fs: { enabled: true, actions: { ls: true, tree: true, read: true, write: true, replace: true, rm: true, mv: true, search: true } },
    notebook: { enabled: true, actions: { list: true, create: true, set_open_state: true, remove: true, rename: true, get_conf: true, set_conf: true, set_icon: true, get_permissions: true, set_permission: true, get_child_docs: true } },
    document: { enabled: true, actions: { create: true, lookup: true, rename: true, remove: true, move: true, get_child_blocks: true, get_child_docs: true, search_docs: true, get_doc: true, list_tree: true, create_daily_note: true, duplicate: true, heading_to_doc: true, doc_to_heading: true, set_attr: true } },
    block: { enabled: true, actions: { insert: true, prepend: true, append: true, update: true, replace: true, delete: true, move: true, set_fold_state: true, get_kramdown: true, get_children: true, transfer_references: true, set_attrs: true, get_attrs: true, info: true, breadcrumb: true, dom: true, recent_updated: true, word_count: true, add_to_daily_note: true, docs_info: true } },
    av: { enabled: true, actions: {} },
    file: { enabled: true, actions: { export_md: true } },
    search: { enabled: true, actions: { fulltext: true, query_sql: true, search_tag: true, get_backlinks: true, get_backmentions: true, search_refs: true, find_replace: true } },
    tag: { enabled: true, actions: { list: true, rename: true, remove: true } },
    system: { enabled: true, actions: { get_version: true, get_current_time: true, conf: true, network: true, notify: true } },
    flashcard: { enabled: true, actions: {} },
    mascot: { enabled: true, actions: { get_balance: true, shop: true, buy: true } },
    feedback: { enabled: true, actions: {} },
};

function makeConfigFetch(originalFetch) {
    return async (url, options = {}) => {
        if (String(url) === `${SIYUAN_URL}/api/file/getFile`) {
            const body = options.body ? JSON.parse(options.body) : {};
            if (body.path === CONFIG_PATH) {
                return new Response(JSON.stringify(ALL_ENABLED_CONFIG), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        }
        return originalFetch(url, options);
    };
}

function parseToolResult(result) {
    const text = result.content?.[0]?.text ?? '';
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

async function siyuanRequest(endpoint, data = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.SIYUAN_TOKEN) headers.Authorization = `Token ${process.env.SIYUAN_TOKEN}`;
    const response = await fetch(`${SIYUAN_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        throw new Error(`${endpoint} HTTP ${response.status} ${response.statusText}`);
    }
    const payload = await response.json();
    if (payload.code !== 0) {
        throw new Error(`${endpoint} SiYuan API error ${payload.code}: ${payload.msg}`);
    }
    return payload.data;
}

async function callTool(client, name, args, label) {
    const result = await client.callTool({ name, arguments: args });
    const json = parseToolResult(result);
    if (result.isError || json?.error) {
        const message = json?.error?.message || JSON.stringify(json);
        throw new Error(`${label || `${name}.${args.action}`} failed: ${message}`);
    }
    return json;
}

function getDocIdFromLookup(value) {
    return value.id || value.idPath?.id || value.ids?.[0];
}

function getStoragePathFromLookup(value) {
    return typeof value.idPath?.path === 'string'
        ? value.idPath.path
        : typeof value.path?.path === 'string'
            ? value.path.path
            : typeof value.path === 'string'
                ? value.path
                : undefined;
}

function getIdsFromLookup(value) {
    return value.ids || value.idPath?.ids || [];
}

async function callToolMaybeError(client, name, args) {
    const result = await client.callTool({ name, arguments: args });
    return { result, json: parseToolResult(result) };
}

async function withClient(fn) {
    process.env.SIYUAN_API_URL = SIYUAN_URL;
    const originalFetch = global.fetch;
    global.fetch = makeConfigFetch(originalFetch);
    const server = await createSiYuanServer();
    const client = new Client({ name: 'live-dev-replace-af', version: '0.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
        return await fn(client);
    } finally {
        await client.close().catch(() => {});
        await server.close().catch(() => {});
        global.fetch = originalFetch;
    }
}

async function waitForDocFirstBlock(client, docId) {
    for (let i = 0; i < 20; i += 1) {
        const children = await callTool(client, 'block', { action: 'get_children', id: docId }, 'block.get_children');
        const blocks = children.data || children.items || [];
        const first = blocks.find((block) => block.type === 'p' || block.type === 'h') || blocks[0];
        if (first?.id) return first.id;
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`No child block found for doc ${docId}`);
}

async function createDoc(client, notebookId, notebookName, title, markdown) {
    const pathName = `/${notebookName}/${title}`;
    const written = await callTool(client, 'fs', {
        action: 'write',
        path: pathName,
        markdown,
        overwrite: true,
    }, `fs.write ${title}`);
    const resolved = await callTool(client, 'document', {
        action: 'lookup',
        notebook: notebookId,
        hpath: `/${title}`,
        include: ['id', 'path', 'hpath'],
    }, `document.lookup ${title}`);
    const id = getDocIdFromLookup(resolved) || written.id;
    if (!id) throw new Error(`Cannot resolve created document ${pathName}`);
    const blockId = await waitForDocFirstBlock(client, id);
    return { path: pathName, docId: id, blockId };
}

async function createDocViaDocument(client, notebookId, title, markdown, extra = {}) {
    const created = await callTool(client, 'document', {
        action: 'create',
        notebook: notebookId,
        path: `/${title}`,
        markdown,
        ...extra,
    }, `document.create ${title}`);
    const docId = created.id;
    if (!docId) throw new Error(`document.create did not return id for ${title}`);
    const blockId = await waitForDocFirstBlock(client, docId);
    return { path: `/${TEST_PREFIX}/${title}`, hpath: `/${title}`, docId, blockId, created };
}

async function readFs(client, pathName) {
    const read = await callTool(client, 'fs', { action: 'read', path: pathName }, `fs.read ${pathName}`);
    return read.content;
}

async function waitForTag(client, tagName) {
    for (let i = 0; i < 10; i += 1) {
        const result = await callTool(client, 'tag', { action: 'list', query: tagName }, `tag.list ${tagName}`);
        const tags = Array.isArray(result.tags) ? result.tags : Array.isArray(result) ? result : [];
        if (JSON.stringify(tags).includes(tagName)) return true;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
}

async function waitForSearchRef(client, targetId, sourceId) {
    let lastResult = null;
    for (let i = 0; i < 20; i += 1) {
        lastResult = await callTool(client, 'search', { action: 'search_refs', id: targetId }, `search.search_refs ${targetId}`);
        if (JSON.stringify(lastResult).includes(sourceId)) {
            return { found: true, result: lastResult };
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return { found: false, result: lastResult };
}

async function waitForSpanRef(client, targetId, sourceId) {
    let lastRows = [];
    let lastAllRows = [];
    let lastBlockRows = [];
    for (let i = 0; i < 20; i += 1) {
        lastRows = await siyuanRequest('/api/query/sql', {
            stmt: `SELECT s.block_id AS id, s.root_id, s.box, s.path, b.hpath, b.type, b.content, b.markdown, s.markdown AS span_markdown FROM spans s LEFT JOIN blocks b ON b.id = s.block_id WHERE s.type = 'textmark block-ref' AND s.block_id='${sourceId}' LIMIT 20`,
        });
        if (JSON.stringify(lastRows).includes(targetId)) {
            return { found: true, rows: lastRows };
        }
        lastAllRows = await siyuanRequest('/api/query/sql', {
            stmt: `SELECT s.block_id AS id, s.root_id, s.box, s.path, b.hpath, b.type, b.content, b.markdown, s.type AS span_type, s.markdown AS span_markdown FROM spans s LEFT JOIN blocks b ON b.id = s.block_id WHERE s.block_id='${sourceId}' LIMIT 20`,
        });
        lastBlockRows = await siyuanRequest('/api/query/sql', {
            stmt: `SELECT id, root_id, box, path, hpath, type, content, markdown FROM blocks WHERE id='${sourceId}' LIMIT 1`,
        });
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return { found: false, rows: lastRows, allRows: lastAllRows, blockRows: lastBlockRows };
}

async function recordCheck(checks, name, fn) {
    try {
        const detail = await fn();
        checks.push({ name, ok: true, detail });
    } catch (error) {
        checks.push({
            name,
            ok: false,
            message: error instanceof Error ? error.message : String(error),
        });
    }
}

async function runReplace(client, scenario, tool, target, oldText, newText) {
    const args = tool === 'fs'
        ? { action: 'replace', path: target.path, edit: { old: oldText, new: newText } }
        : { action: 'replace', id: target.blockId, edit: { old: oldText, new: newText } };
    const { result, json } = await callToolMaybeError(client, tool, args);
    const ok = !result.isError && !json?.error;
    return {
        scenario,
        ok,
        message: ok ? '' : (json?.error?.message || JSON.stringify(json)),
        json,
    };
}

async function main() {
    await withClient(async (client) => {
        const version = await callTool(client, 'system', { action: 'get_version' }, 'system.get_version');
        const notebook = await callTool(client, 'notebook', { action: 'create', name: TEST_PREFIX }, 'notebook.create');
        const notebookId = notebook.id || notebook.notebook?.id;
        assert.ok(notebookId, 'created notebook id is required');
        await callTool(client, 'notebook', {
            action: 'set_permission',
            notebook: notebookId,
            permission: 'rwd',
        }, 'notebook.set_permission');

        const results = [];
        const checks = [];
        try {
            const targetRefDoc = await createDoc(client, notebookId, TEST_PREFIX, 'Target Ref', '测试笔记本');
            const refToken = `((${targetRefDoc.blockId} "测试笔记本"))`;

            const a = await createDoc(client, notebookId, TEST_PREFIX, 'A FS Ref Paragraph', `引用 ${refToken} 完成`);
            results.push(await runReplace(client, 'A fs.replace 替换包含双链的整段', 'fs', a, `引用 ${refToken} 完成`, 'A 替换成功'));

            const b = await createDoc(client, notebookId, TEST_PREFIX, 'B FS Tag Paragraph', '这是一段 #测试标签B# 内容');
            results.push(await runReplace(client, 'B fs.replace 替换包含标签的整段', 'fs', b, '这是一段 #测试标签B# 内容', 'B 替换成功'));

            const c = await createDoc(client, notebookId, TEST_PREFIX, 'C FS Tag Whole', '这是一段 #测试标签C# 内容');
            results.push(await runReplace(client, 'C fs.replace 把 #标签# 整体替换为普通文本', 'fs', c, '#测试标签C#', '普通文本'));

            const d = await createDoc(client, notebookId, TEST_PREFIX, 'D Block Ref Paragraph', `引用 ${refToken} 完成`);
            results.push(await runReplace(client, 'D block.replace 替换包含双链的整段', 'block', d, `引用 ${refToken} 完成`, 'D 替换成功'));

            const e = await createDoc(client, notebookId, TEST_PREFIX, 'E Block Tag Paragraph', '这是一段 #测试标签E# 内容');
            results.push(await runReplace(client, 'E block.replace 替换包含标签的整段', 'block', e, '这是一段 #测试标签E# 内容', 'E 替换成功'));

            const f = await createDoc(client, notebookId, TEST_PREFIX, 'F Block Tag Whole', '这是一段 #测试标签F# 内容');
            results.push(await runReplace(client, 'F block.replace 把 #标签# 整体替换为普通文本', 'block', f, '#测试标签F#', '普通文本'));

            const readBack = [];
            for (const item of [a, b, c, d, e, f]) {
                const read = await callTool(client, 'fs', { action: 'read', path: item.path }, `fs.read ${item.path}`);
                readBack.push({ path: item.path, content: read.content });
            }

            await recordCheck(checks, 'document.create 正文写 # Title 不产生双标题', async () => {
                const doc = await createDocViaDocument(client, notebookId, 'No Double Title', '# No Double Title\n\n正文');
                const content = await readFs(client, doc.path);
                assert.equal(content, '正文');
                return { content };
            });

            await recordCheck(checks, 'fs.write 正文写 # Title 不产生双标题', async () => {
                const doc = await createDoc(client, notebookId, TEST_PREFIX, 'FS No Double Title', '# FS No Double Title\n\n正文');
                const content = await readFs(client, doc.path);
                assert.equal(content, '正文');
                return { content };
            });

            await recordCheck(checks, 'document.create(path) 返回文档 ID 且路径创建可读', async () => {
                const doc = await createDocViaDocument(client, notebookId, 'Create Returns ID', '内容');
                const content = await readFs(client, doc.path);
                assert.match(doc.docId, /^\d{14}-[a-z0-9]{7}$/);
                assert.equal(content, '内容');
                return { id: doc.docId, content };
            });

            await recordCheck(checks, 'document.create(parentPath+title) 支持笔记本内相对父路径', async () => {
                const parent = await createDocViaDocument(client, notebookId, 'Parent Folder', '父文档');
                const child = await callTool(client, 'document', {
                    action: 'create',
                    notebook: notebookId,
                    parentPath: '/Parent Folder',
                    title: 'Child Created By ParentPath',
                    markdown: '子文档',
                }, 'document.create parentPath relative');
                assert.match(child.id, /^\d{14}-[a-z0-9]{7}$/);
                const content = await readFs(client, `/${TEST_PREFIX}/Parent Folder/Child Created By ParentPath`);
                assert.equal(content, '子文档');
                return { parentId: parent.docId, childId: child.id, content };
            });

            await recordCheck(checks, 'document.create(parentPath+title) 支持 storage parentPath', async () => {
                const parentInfo = await callTool(client, 'document', {
                    action: 'lookup',
                    id: (await createDocViaDocument(client, notebookId, 'Storage Parent', '父文档')).docId,
                    include: ['path', 'hpath'],
                }, 'document.lookup storage parent');
                const storagePath = getStoragePathFromLookup(parentInfo);
                assert.ok(storagePath, 'storage path is required');
                const child = await callTool(client, 'document', {
                    action: 'create',
                    notebook: notebookId,
                    parentPath: storagePath,
                    title: 'Child Created By StoragePath',
                    markdown: '子文档',
                }, 'document.create parentPath storage');
                assert.match(child.id, /^\d{14}-[a-z0-9]{7}$/);
                const content = await readFs(client, `/${TEST_PREFIX}/Storage Parent/Child Created By StoragePath`);
                assert.equal(content, '子文档');
                return { storagePath, childId: child.id, content };
            });

            await recordCheck(checks, '裸 ((id)) 写入会自动补锚文本并保留双链', async () => {
                const target = await createDoc(client, notebookId, TEST_PREFIX, 'Naked Ref Target', '目标标题');
                const source = await createDocViaDocument(client, notebookId, 'Naked Ref Source', `引用 ((` + `${target.blockId}` + `)) 完成`);
                const content = await readFs(client, source.path);
                assert.match(content, new RegExp(`\\(\\(${target.blockId} '目标标题'\\)\\)`));
                return { content };
            });

            await recordCheck(checks, 'siyuan://blocks 链接写入被拒绝', async () => {
                const target = await createDoc(client, notebookId, TEST_PREFIX, 'Link Target', '目标标题');
                const { result, json } = await callToolMaybeError(client, 'document', {
                    action: 'create',
                    notebook: notebookId,
                    path: '/Bad Siyuan Link',
                    markdown: `[目标](siyuan://blocks/${target.blockId})`,
                });
                assert.equal(Boolean(result.isError || json?.error), true);
                assert.match(json?.error?.message || '', /siyuan:\/\/blocks/);
                return { rejected: true, message: json?.error?.message };
            });

            await recordCheck(checks, '脚注式引用写入被拒绝', async () => {
                const { result, json } = await callToolMaybeError(client, 'document', {
                    action: 'create',
                    notebook: notebookId,
                    path: '/Bad Footnote Ref',
                    markdown: '引用[^1]\n\n[^1]: 内容',
                });
                assert.equal(Boolean(result.isError || json?.error), true);
                assert.match(json?.error?.message || '', /footnote|脚注/i);
                return { rejected: true, message: json?.error?.message };
            });

            await recordCheck(checks, 'block.update markdown 创建真实标签且 tag.list 可发现', async () => {
                const doc = await createDocViaDocument(client, notebookId, 'Update Tag Source', '初始');
                await callTool(client, 'block', {
                    action: 'update',
                    id: doc.blockId,
                    dataType: 'markdown',
                    data: '更新后 #live-regression-tag#',
                }, 'block.update tag');
                const content = await readFs(client, doc.path);
                assert.equal(content, '更新后 #live-regression-tag#');
                const found = await waitForTag(client, 'live-regression-tag');
                assert.equal(found, true);
                return { content, tagListed: found };
            });

            await recordCheck(checks, 'fs.replace 可从普通文本创建双链并可删除', async () => {
                const target = await createDoc(client, notebookId, TEST_PREFIX, 'FS Replace Create Ref Target', 'FS替换目标');
                const doc = await createDocViaDocument(client, notebookId, 'FS Replace Create Ref Source', '待创建引用');
                await callTool(client, 'fs', {
                    action: 'replace',
                    path: doc.path,
                    edit: { old: '待创建引用', new: `引用 ((${target.blockId})) 完成` },
                }, 'fs.replace create ref');
                const created = await readFs(client, doc.path);
                assert.match(created, new RegExp(`\\(\\(${target.blockId} 'FS替换目标'\\)\\)`));
                const domAfterCreate = await callTool(client, 'block', { action: 'dom', id: doc.blockId }, 'block.dom fs created ref');
                assert.match(domAfterCreate.dom, /data-type="block-ref"/);
                assert.match(domAfterCreate.dom, new RegExp(`data-id="${target.blockId}"`));
                const spanAfterCreate = await waitForSpanRef(client, target.blockId, doc.blockId);
                assert.equal(
                    spanAfterCreate.found,
                    true,
                    `expected ref source ${doc.blockId} in spans; detail=${JSON.stringify(spanAfterCreate)}`,
                );
                const refsAfterCreate = await waitForSearchRef(client, target.blockId, doc.blockId);

                await callTool(client, 'fs', {
                    action: 'replace',
                    path: doc.path,
                    edit: { old: `引用 ((${target.blockId} 'FS替换目标')) 完成`, new: '引用已删除' },
                }, 'fs.replace delete ref');
                const deleted = await readFs(client, doc.path);
                assert.equal(deleted, '引用已删除');
                const domAfterDelete = await callTool(client, 'block', { action: 'dom', id: doc.blockId }, 'block.dom fs deleted ref');
                assert.equal(/data-type="block-ref"/.test(domAfterDelete.dom), false);
                const spanAfterDelete = await waitForSpanRef(client, target.blockId, doc.blockId);
                return {
                    created,
                    deleted,
                    refsFound: refsAfterCreate.found,
                    spansFound: spanAfterCreate.found,
                    spanStillIndexedAfterDelete: spanAfterDelete.found,
                };
            });

            await recordCheck(checks, 'block.replace 可从普通文本创建双链、改锚文本并删除', async () => {
                const target = await createDoc(client, notebookId, TEST_PREFIX, 'Block Replace Create Ref Target', 'Block替换目标');
                const doc = await createDocViaDocument(client, notebookId, 'Block Replace Create Ref Source', '待创建块引用');
                await callTool(client, 'block', {
                    action: 'replace',
                    id: doc.blockId,
                    edit: { old: '待创建块引用', new: `引用 ((${target.blockId})) 完成` },
                }, 'block.replace create ref');
                const created = await readFs(client, doc.path);
                assert.match(created, new RegExp(`\\(\\(${target.blockId} 'Block替换目标'\\)\\)`));
                const domAfterCreate = await callTool(client, 'block', { action: 'dom', id: doc.blockId }, 'block.dom block created ref');
                assert.match(domAfterCreate.dom, /data-type="block-ref"/);
                const spanAfterCreate = await waitForSpanRef(client, target.blockId, doc.blockId);
                assert.equal(
                    spanAfterCreate.found,
                    true,
                    `expected ref source ${doc.blockId} in spans; detail=${JSON.stringify(spanAfterCreate)}`,
                );

                await callTool(client, 'block', {
                    action: 'replace',
                    id: doc.blockId,
                    edit: {
                        old: `((${target.blockId} 'Block替换目标'))`,
                        new: `((${target.blockId} '改后锚文本'))`,
                    },
                }, 'block.replace update ref anchor');
                const updated = await readFs(client, doc.path);
                assert.match(updated, new RegExp(`\\(\\(${target.blockId} '改后锚文本'\\)\\)`));

                await callTool(client, 'block', {
                    action: 'replace',
                    id: doc.blockId,
                    edit: { old: `引用 ((${target.blockId} '改后锚文本')) 完成`, new: '引用已删除' },
                }, 'block.replace delete ref');
                const deleted = await readFs(client, doc.path);
                assert.equal(deleted, '引用已删除');
                const domAfterDelete = await callTool(client, 'block', { action: 'dom', id: doc.blockId }, 'block.dom block deleted ref');
                assert.equal(/data-type="block-ref"/.test(domAfterDelete.dom), false);
                const spanAfterDelete = await waitForSpanRef(client, target.blockId, doc.blockId);
                return {
                    created,
                    updated,
                    deleted,
                    spansFound: spanAfterCreate.found,
                    spanStillIndexedAfterDelete: spanAfterDelete.found,
                };
            });

            await recordCheck(checks, 'replace 可创建、读取、修改、删除标签', async () => {
                const fsDoc = await createDocViaDocument(client, notebookId, 'FS Replace Create Tag Source', '待创建标签');
                await callTool(client, 'fs', {
                    action: 'replace',
                    path: fsDoc.path,
                    edit: { old: '待创建标签', new: '已创建 #replace-create-tag#' },
                }, 'fs.replace create tag');
                const fsCreated = await readFs(client, fsDoc.path);
                assert.equal(fsCreated, '已创建 #replace-create-tag#');
                assert.equal(await waitForTag(client, 'replace-create-tag'), true);

                await callTool(client, 'fs', {
                    action: 'replace',
                    path: fsDoc.path,
                    edit: { old: '#replace-create-tag#', new: '#replace-updated-tag#' },
                }, 'fs.replace update tag');
                const fsUpdated = await readFs(client, fsDoc.path);
                assert.equal(fsUpdated, '已创建 #replace-updated-tag#');
                assert.equal(await waitForTag(client, 'replace-updated-tag'), true);

                await callTool(client, 'fs', {
                    action: 'replace',
                    path: fsDoc.path,
                    edit: { old: '#replace-updated-tag#', new: '普通文本' },
                }, 'fs.replace delete tag');
                const fsDeleted = await readFs(client, fsDoc.path);
                assert.equal(fsDeleted, '已创建 普通文本');

                const blockDoc = await createDocViaDocument(client, notebookId, 'Block Replace Create Tag Source', '待创建块标签');
                await callTool(client, 'block', {
                    action: 'replace',
                    id: blockDoc.blockId,
                    edit: { old: '待创建块标签', new: '已创建 #block-replace-create-tag#' },
                }, 'block.replace create tag');
                const blockCreated = await readFs(client, blockDoc.path);
                assert.equal(blockCreated, '已创建 #block-replace-create-tag#');
                assert.equal(await waitForTag(client, 'block-replace-create-tag'), true);

                await callTool(client, 'block', {
                    action: 'replace',
                    id: blockDoc.blockId,
                    edit: { old: '#block-replace-create-tag#', new: '普通文本' },
                }, 'block.replace delete tag');
                const blockDeleted = await readFs(client, blockDoc.path);
                assert.equal(blockDeleted, '已创建 普通文本');
                return { fsCreated, fsUpdated, fsDeleted, blockCreated, blockDeleted };
            });

            await recordCheck(checks, 'block.update DOM 中 markdown 双链/标签会被规范化为真实 span', async () => {
                const target = await createDoc(client, notebookId, TEST_PREFIX, 'DOM Ref Target', 'DOM目标');
                const doc = await createDocViaDocument(client, notebookId, 'DOM Update Source', '初始');
                await callTool(client, 'block', {
                    action: 'update',
                    id: doc.blockId,
                    dataType: 'dom',
                    data: `<div data-node-id="${doc.blockId}" data-type="NodeParagraph">DOM 引用 ((${target.blockId} 'DOM目标')) #dom-live-tag#</div>`,
                }, 'block.update dom normalize');
                const content = await readFs(client, doc.path);
                assert.match(content, new RegExp(`\\(\\(${target.blockId} 'DOM目标'\\)\\)`));
                assert.ok(content.includes('#dom-live-tag#'), `expected one tag token, got ${JSON.stringify(content)}`);
                assert.equal(content.includes('##dom-live-tag##'), false);
                const dom = await callTool(client, 'block', { action: 'dom', id: doc.blockId }, 'block.dom');
                assert.match(dom.dom, /data-type="block-ref"/);
                assert.match(dom.dom, /data-type="tag"/);
                return { content };
            });

            await recordCheck(checks, 'block.move(ids) 保持列表顺序', async () => {
                const doc = await createDocViaDocument(client, notebookId, 'Move Order Doc', 'Anchor');
                await callTool(client, 'block', {
                    action: 'append',
                    parentID: doc.docId,
                    dataType: 'markdown',
                    data: 'A\n\nB\n\nC',
                }, 'block.append move blocks');
                const children = await callTool(client, 'block', { action: 'get_children', id: doc.docId, pageSize: 20 }, 'block.get_children move source');
                const rawChildren = children.data || children.items || [];
                const blocks = [];
                for (const child of rawChildren) {
                    if (!child?.id) continue;
                    const kd = await callTool(client, 'block', { action: 'get_kramdown', id: child.id }, `block.get_kramdown ${child.id}`);
                    const content = String(kd.kramdown || '').replace(/\n?\{:[\s\S]*$/, '').trim();
                    if (['Anchor', 'A', 'B', 'C'].includes(content)) {
                        blocks.push({ id: child.id, content });
                    }
                }
                const idsByContent = Object.fromEntries(blocks.map((block) => [block.content, block.id]));
                for (const key of ['Anchor', 'A', 'B', 'C']) {
                    assert.ok(idsByContent[key], `missing block ${key}; children=${JSON.stringify(rawChildren)}; blocks=${JSON.stringify(blocks)}`);
                }
                await callTool(client, 'block', {
                    action: 'move',
                    ids: [idsByContent.A, idsByContent.B, idsByContent.C],
                    previousID: idsByContent.Anchor,
                }, 'block.move ids order');
                const after = await callTool(client, 'block', { action: 'get_children', id: doc.docId, pageSize: 20 }, 'block.get_children move after');
                const order = [];
                for (const child of (after.data || after.items || [])) {
                    if (!child?.id) continue;
                    const kd = await callTool(client, 'block', { action: 'get_kramdown', id: child.id }, `block.get_kramdown after ${child.id}`);
                    const content = String(kd.kramdown || '').replace(/\n?\{:[\s\S]*$/, '').trim();
                    if (['Anchor', 'A', 'B', 'C'].includes(content)) order.push(content);
                }
                assert.deepEqual(order, ['Anchor', 'A', 'B', 'C']);
                return { order };
            });

            await recordCheck(checks, '同 hpath 文档 lookup 返回 ids 可发现同名文档', async () => {
                const first = await createDocViaDocument(client, notebookId, 'Same Name', '第一个');
                const firstInfo = await callTool(client, 'document', { action: 'lookup', id: first.docId, include: ['path'] }, 'lookup first same name');
                const firstStoragePath = getStoragePathFromLookup(firstInfo);
                const second = await callToolMaybeError(client, 'document', {
                    action: 'create',
                    notebook: notebookId,
                    path: '/Same Name',
                    markdown: '第二个',
                });
                const idsByLookup = await callTool(client, 'document', {
                    action: 'lookup',
                    notebook: notebookId,
                    hpath: '/Same Name',
                    include: ['ids'],
                }, 'document.lookup duplicate hpath');
                const ids = getIdsFromLookup(idsByLookup);
                const sqlRows = await siyuanRequest('/api/query/sql', {
                    stmt: `SELECT id FROM blocks WHERE box='${notebookId}' AND hpath='/Same Name' AND type='d'`,
                });
                if (sqlRows.length >= 2) {
                    assert.ok(ids.length >= 2, `expected lookup >=2 ids when SQL has duplicates, got ${ids.length}`);
                    return { duplicatesCreated: true, ids, sqlCount: sqlRows.length, firstStoragePath };
                }
                return {
                    duplicatesCreated: false,
                    note: 'SiYuan did not create two documents with identical hpath in the same parent during this live run.',
                    secondCreate: second.json,
                    lookupIds: ids,
                    sqlCount: sqlRows.length,
                    firstStoragePath,
                };
            });

            const summary = {
                siyuanVersion: version.version,
                serverBundle: 'dev/mcp-server.cjs',
                notebook: { id: notebookId, name: TEST_PREFIX },
                results,
                checks,
                readBack,
            };
            console.log(JSON.stringify(summary, null, 2));

            const failed = [...results.filter((item) => !item.ok), ...checks.filter((item) => !item.ok)];
            if (failed.length > 0) {
                process.exitCode = 1;
            }
        } finally {
            await callToolMaybeError(client, 'notebook', { action: 'remove', notebook: notebookId });
        }
    });
}

main().catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
});

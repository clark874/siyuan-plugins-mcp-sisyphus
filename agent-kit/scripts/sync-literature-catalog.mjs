#!/usr/bin/env node
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const idPattern = /^\d{14}-[a-z0-9]{7}$/;
const itemPattern = /^[A-Z0-9]{8}$/;
const editable = new Set(['title', 'creators', 'date', 'publicationTitle', 'volume', 'issue', 'pages', 'DOI', 'abstractNote', 'url', 'repository', 'archiveID', 'extra']);
const columns = ['题名', '作者', '年份', '期刊', '卷期页', 'DOI', 'Zotero 键', '摘要', '正文版本', '报告号', '来源库', '网址'];
const json = async target => JSON.parse(await readFile(target, 'utf8'));

export function validateManifest(manifest, edits = {}) {
    if (!idPattern.test(manifest.avID) || !Array.isArray(manifest.records) || !manifest.records.length) throw Error('文献目录清单格式无效');
    const docs = new Set(), keys = new Set();
    for (const row of manifest.records) {
        if (!idPattern.test(row.documentId) || !itemPattern.test(row.zoteroKey) || docs.has(row.documentId) || keys.has(row.zoteroKey)) throw Error('清单存在无效或重复的正文、Zotero 键');
        docs.add(row.documentId); keys.add(row.zoteroKey);
    }
    if (!edits || typeof edits !== 'object' || Array.isArray(edits)) throw Error('书目编辑应为按 Zotero 键索引的对象');
    for (const [key, patch] of Object.entries(edits)) {
        if (!keys.has(key) || !patch || typeof patch !== 'object' || Array.isArray(patch)) throw Error('编辑超出清单范围或格式无效');
        for (const [field, value] of Object.entries(patch)) {
            if (!editable.has(field)) throw Error('书目编辑包含未支持字段');
            if (field === 'creators' ? !Array.isArray(value) : typeof value !== 'string') throw Error('书目字段类型无效');
        }
    }
}

export function projectRecord(item) {
    const authors = (item.creators ?? []).filter(a => a.creatorType === 'author').map(a => a.name || [a.firstName, a.lastName].filter(Boolean).join(' '));
    return { '题名': item.title || '', '作者': authors.join('; '), '年份': (item.date || '').match(/\b\d{4}\b/)?.[0] || '',
        '期刊': item.publicationTitle || item.proceedingsTitle || item.institution || '', '卷期页': [item.volume, item.issue ? `(${item.issue})` : '', item.pages].filter(Boolean).join(' '),
        'DOI': item.DOI || '', 'Zotero 键': item.key, '摘要': item.abstractNote || '',
        '正文版本': item.archiveID || '', '报告号': item.reportNumber || '',
        '来源库': item.repository || item.institution || item.publisher || '', '网址': item.url || '' };
}

export function bindRows(raw, records) {
    const primary = raw.av?.keyValues?.find(c => c.key?.type === 'block');
    if (!primary) throw Error('未发现绑定正文的主键列');
    const bindings = new Map();
    for (const record of records) {
        const candidates = (primary.values ?? []).filter(cell => cell.block?.id === record.documentId);
        if (candidates.length !== 1 || !idPattern.test(candidates[0].blockID)) throw Error('正文没有唯一 AV 绑定行');
        bindings.set(record.documentId, candidates[0].blockID);
    }
    return bindings;
}

function cellText(column, rowID) {
    const cell = column?.values?.find(value => value.blockID === rowID);
    return cell?.text?.content ?? cell?.url?.content ?? '';
}

export function planCells(raw, records, items) {
    const byName = new Map();
    for (const column of raw.av.keyValues) {
        if (byName.has(column.key.name)) throw Error('AV 列名重复');
        byName.set(column.key.name, column);
    }
    const bindings = bindRows(raw, records);
    const missingColumns = columns.filter(name => !byName.has(name));
    for (const name of columns) {
        const kind = byName.get(name)?.key?.type;
        if (kind && !['text', 'url'].includes(kind)) throw Error('镜像字段列类型应为文本或网址');
    }
    const cells = [];
    for (const record of records) {
        const item = items.get(record.zoteroKey);
        if (!item || item.deleted) throw Error('清单内 Zotero 条目不存在或已删除');
        const rowID = bindings.get(record.documentId);
        const boundKey = cellText(byName.get('Zotero 键'), rowID);
        if (boundKey && boundKey !== record.zoteroKey) throw Error('正文已绑定不同的 Zotero 键');
        for (const [name, value] of Object.entries(projectRecord(item))) {
            const column = byName.get(name);
            if (column && cellText(column, rowID) !== value) cells.push({ rowID, columnID: column.key.id,
                valueType: column.key.type, ...(column.key.type === 'url' ? { url: value } : { text: value }),
                before: cellText(column, rowID), field: name });
        }
    }
    return { missingColumns, cells };
}

function optionsFrom(argv) {
    const options = { execute: false };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--execute') options.execute = true;
        else if (argv[i] === '--help') return null;
        else if (['--mcp-settings', '--zotero-config', '--manifest', '--edits', '--report'].includes(argv[i]) && argv[i + 1]) options[argv[i].slice(2)] = path.resolve(argv[++i]);
        else throw Error('未知参数或缺少参数值');
    }
    for (const key of ['mcp-settings', 'zotero-config', 'manifest', 'report']) if (!options[key]) throw Error(`缺少 --${key}`);
    return options;
}

async function run(options) {
    const [settings, zotero, manifest, edits] = await Promise.all([json(options['mcp-settings']), json(options['zotero-config']), json(options.manifest), options.edits ? json(options.edits) : {}]);
    validateManifest(manifest, edits);
    const base = new URL(zotero.baseUrl);
    if (base.origin !== 'https://api.zotero.org' || !/^\/(users|groups)\/\d+\/?$/.test(base.pathname) || !zotero.apiKey || base.search || base.hash || base.username || base.password) throw Error('Zotero 配置必须使用官方文库端点和私有密钥');
    if (!['127.0.0.1', 'localhost', '::1'].includes(settings.host) || !Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65535 || (settings.authEnabled && !settings.token)) throw Error('MCP 设置必须使用已配置的本机网关');
    const host = settings.host === '::1' ? '[::1]' : settings.host;
    const endpoint = `http://${host}:${settings.port}/mcp`;
    const scopeHash = createHash('sha256').update(JSON.stringify({ manifest, edits })).digest('hex');
    let priorReport;
    try { priorReport = await json(options.report); }
    catch (error) { if (error.code !== 'ENOENT') throw Error('既有收据不可读取，请先检查'); }
    if (priorReport && priorReport.scopeHash !== scopeHash) throw Error('收据对应不同清单或编辑范围，请使用新收据文件');
    const report = priorReport ?? { scopeHash, rows: manifest.records.length, operations: [], verified: 0 };
    report.mode = options.execute ? '执行' : '预览'; report.state = '准备'; report.verified = 0;
    const save = async () => {
        const temp = options.report + `.${process.pid}.tmp`;
        await writeFile(temp, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
        await rename(temp, options.report);
    };
    let session = '', protocol = '', counter = 0;
    async function mcp(method, params) {
        const id = method.startsWith('notifications/') ? undefined : ++counter;
        const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream',
            ...(settings.authEnabled ? { Authorization: `Bearer ${settings.token}` } : {}), ...(session ? { 'mcp-session-id': session } : {}), ...(protocol ? { 'mcp-protocol-version': protocol } : {}) },
            body: JSON.stringify({ jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, params }), signal: AbortSignal.timeout(45000), redirect: 'error' });
        if (!response.ok) throw Error(`MCP HTTP ${response.status}`);
        session = response.headers.get('mcp-session-id') || session;
        if (id === undefined) { await response.body?.cancel(); return {}; }
        let result;
        if (response.headers.get('content-type')?.includes('text/event-stream')) {
            const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = '';
            try {
                while (!result) {
                    const { value, done } = await reader.read(); if (done) break;
                    pending += decoder.decode(value, { stream: true });
                    let end;
                    while ((end = pending.indexOf('\n')) >= 0) {
                        const line = pending.slice(0, end).trim(); pending = pending.slice(end + 1);
                        if (line.startsWith('data:')) { const event = JSON.parse(line.slice(5).trim()); if (event.id === id) result = event; }
                    }
                }
            } finally { await reader.cancel(); }
        } else result = await response.json();
        if (!result || result.error) throw Error('MCP 协议返回失败');
        return result.result;
    }
    async function call(tool, args) {
        const result = await mcp('tools/call', { name: tool, arguments: args });
        const value = result.structuredContent ?? JSON.parse(result.content.find(x => x.type === 'text').text);
        if (result.isError || value.error || value.success === false) {
            const failure = Error(`MCP ${tool}.${args.action} 返回失败`);
            failure.code = value.error?.code ?? value.error?.type;
            throw failure;
        }
        return value;
    }
    async function readAv() {
        try {
            return await call('av', { action: 'get', id: manifest.avID });
        } catch (error) {
            if (!['kernel_timeout', 'kernel_busy'].includes(error.code)) throw error;
            return call('av', { action: 'get', id: manifest.avID });
        }
    }
    async function avWrite(args) {
        const pre = await call('av', { ...args, validateOnly: true });
        const field = pre.preconditionField;
        const alias = field?.replace(/^expected([A-Z])/, (_, c) => c.toLowerCase());
        const credential = field ? pre[field] ?? pre[alias] : undefined;
        if (!pre.issuedRequestId || (field && !credential)) throw Error('严格预检未签发写入凭据');
        const operation = { type: args.action, state: '预检完成，待回读', cells: args.cells?.length ?? 0 };
        report.operations.push(operation); await save();
        await call('av', { ...args, requestId: pre.issuedRequestId, ...(field ? { [field]: credential } : {}) });
        operation.state = '接口完成'; await save();
    }
    async function api(route, method = 'GET', body, version) {
        const response = await fetch(zotero.baseUrl.replace(/\/$/, '') + route, { method, headers: { 'Zotero-API-Key': zotero.apiKey, 'Zotero-API-Version': '3',
            ...(body ? { 'content-type': 'application/json' } : {}), ...(version !== undefined ? { 'If-Unmodified-Since-Version': String(version) } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000), redirect: 'error' });
        if (!response.ok) throw Error(`Zotero HTTP ${response.status}`);
        return response.status === 204 ? null : response.json();
    }
    async function readItems() {
        const items = new Map();
        for (let start = 0; start < manifest.records.length; start += 50) {
            const keys = manifest.records.slice(start, start + 50).map(x => x.zoteroKey);
            const rows = await api(`/items?itemKey=${keys.join(',')}&limit=100`);
            for (const row of rows) items.set(row.key, row.data);
        }
        if (items.size !== manifest.records.length) throw Error('Zotero 文库未返回全部清单条目');
        return items;
    }
    try {
        const init = await mcp('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'sisyphus-literature-sync', version: '1.0.0' } });
        protocol = init.protocolVersion;
        await mcp('notifications/initialized');
        await call('system', { action: 'bootstrap' });
        let raw = await readAv();
        let items = await readItems();
        planCells(raw, manifest.records, items);
        const proposedEdits = [];
        if (!report.editBaseline) {
            report.editBaseline = Object.fromEntries(Object.entries(edits).map(([key, patch]) => [key, {
                version: items.get(key).version,
                before: Object.fromEntries(Object.keys(patch).map(field => [field, items.get(key)[field] ?? null])),
                desired: patch,
            }]));
            await save();
        }
        for (const [key, patch] of Object.entries(edits)) {
            const old = items.get(key), baseline = report.editBaseline[key];
            if (!baseline || JSON.stringify(baseline.desired) !== JSON.stringify(patch)) throw Error('收据内书目编辑基线不完整');
            for (const [field, desired] of Object.entries(patch)) {
                const current = JSON.stringify(old[field] ?? null);
                if (current !== JSON.stringify(baseline.before[field]) && current !== JSON.stringify(desired)) {
                    throw Error('Zotero 编辑字段出现第三方改动，停止续写');
                }
            }
            const diff = Object.fromEntries(Object.entries(patch).filter(([field, value]) => JSON.stringify(old[field]) !== JSON.stringify(value)));
            if (Object.keys(diff).length) proposedEdits.push({ key, version: old.version, before: Object.fromEntries(Object.keys(diff).map(field => [field, old[field]])), patch: diff });
        }
        const projectedItems = new Map([...items].map(([key, item]) => [key, { ...item, ...edits[key] }]));
        const preview = planCells(raw, manifest.records, projectedItems);
        report.proposedZotero = proposedEdits; report.missingColumns = preview.missingColumns; report.proposedCells = preview.cells.length;
        report.state = '预览完成'; await save();
        if (!options.execute) return report;
        for (const edit of proposedEdits) {
            const operation = { type: 'Zotero PATCH', key: edit.key, state: '待回读' };
            report.operations.push(operation); await save();
            await api(`/items/${edit.key}`, 'PATCH', edit.patch, edit.version);
            const after = (await api(`/items/${edit.key}`)).data;
            if (Object.entries(edit.patch).some(([k, v]) => JSON.stringify(after[k]) !== JSON.stringify(v))) throw Error('Zotero 写后回读不一致');
            operation.state = '已回读'; await save();
        }
        items = await readItems();
        raw = await readAv();
        let planned = planCells(raw, manifest.records, items);
        for (const name of planned.missingColumns) {
            await avWrite({ action: 'add_column', avID: manifest.avID, keyName: name, keyType: 'text' });
            raw = await readAv();
            if (!raw.av.keyValues.some(c => c.key.name === name)) throw Error('新增列未完成回读');
        }
        planned = planCells(raw, manifest.records, items);
        report.proposedCells = planned.cells.length; await save();
        for (let start = 0; start < planned.cells.length; start += 100) {
            const batch = planned.cells.slice(start, start + 100);
            const current = await readAv();
            for (const cell of batch) {
                const column = current.av.keyValues.find(c => c.key.id === cell.columnID);
                if (!column || cellText(column, cell.rowID) !== cell.before) throw Error('AV 在写入期间发生并发编辑，停止同步');
            }
            await avWrite({ action: 'set_cells', avID: manifest.avID, cells: batch.map(({ before, field, ...cell }) => cell) });
            const after = await readAv();
            for (const cell of batch) {
                const column = after.av.keyValues.find(c => c.key.id === cell.columnID);
                if (cellText(column, cell.rowID) !== (cell.text ?? cell.url)) throw Error('AV 单元格写后回读不一致');
            }
        }
        const latest = await readItems();
        if ([...latest].some(([key, item]) => item.version !== items.get(key).version)) throw Error('Zotero 在 AV 同步期间发生变化，请续跑对账');
        const final = planCells(await readAv(), manifest.records, latest);
        if (final.missingColumns.length || final.cells.length) throw Error('AV 最终回读尚有差异');
        report.verified = manifest.records.length; report.state = '两端已回读'; await save();
        return report;
    } catch (error) {
        report.state = '未完成，可按同一清单续跑';
        report.error = /^(?:MCP|Zotero|AV|严格|清单|正文|镜像)/.test(error.message) ? error.message : '连接或响应异常';
        await save(); throw Error(report.error);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const options = optionsFrom(process.argv.slice(2));
    if (!options) console.log('用法：node sync-literature-catalog.mjs --mcp-settings 私有JSON --zotero-config 私有JSON --manifest 清单JSON --report 收据JSON [--edits 编辑JSON] [--execute]');
    else run(options).then(r => console.log(JSON.stringify({ state: r.state, rows: r.rows, verified: r.verified, proposedCells: r.proposedCells }))).catch(error => { console.error(error.message); process.exitCode = 1; });
}

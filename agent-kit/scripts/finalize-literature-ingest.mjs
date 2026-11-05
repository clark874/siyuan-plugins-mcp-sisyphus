#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mcpConnection, tagLiteratureDocument } from './tag-literature-roles.mjs';

const validId = /^\d{14}-[a-z0-9]{7}$/;
function identity(name, value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    return name === 'DOI' ? normalized.replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi\s*:\s*)/, '') : normalized;
}

async function write(call, tool, args, verifyPlan) {
    const pre = await call(tool, { ...args, validateOnly: true });
    if (!pre.issuedRequestId) throw Error('未取得严格写入请求标识');
    const fields = { requestId: pre.issuedRequestId };
    if (pre.preconditionField) {
        const alias = pre.preconditionField.replace(/^expected([A-Z])/, (_, c) => c.toLowerCase());
        const credential = pre[pre.preconditionField] ?? pre[alias];
        if (!credential) throw Error('未取得严格写入前置条件');
        fields[pre.preconditionField] = credential;
    }
    await verifyPlan();
    return call(tool, { ...args, ...fields });
}

/** 已创建的文档以稳定标识续作。新记录只补空字段，书目修改走既有联动入口。 */
export async function finalizeLiteratureIngest(call, paper, execute = false) {
    const { documentId, avID, fields } = paper;
    if (!validId.test(documentId) || !validId.test(avID) || !fields || typeof fields !== 'object' || Array.isArray(fields)
        || Object.values(fields).some(value => typeof value !== 'string') || !fields['题名']?.trim()
        || !/^[0-9a-f]{64}$/i.test(fields['原文哈希'] ?? '')) throw Error('需提供正文与目录标识、题名、原文 SHA-256 和文本字段');
    if (execute && (await call('system', { action: 'bootstrap' })).writeSafety?.strictMode !== true) throw Error('入库登记需要启用严格写入');

    async function plan() {
        const result = await call('av', { action: 'get', id: avID });
        const columns = result.av?.keyValues;
        const primary = columns?.find(column => column.key?.type === 'block');
        if (!primary) throw Error('目录缺少绑定正文的主键列');
        const matches = (primary.values ?? []).filter(cell => cell.block?.id === documentId);
        if (matches.length > 1) throw Error('正文对应多条目录记录');
        const rowID = matches[0]?.blockID;
        if (matches.length && !validId.test(rowID)) throw Error('绑定行标识无效');
        const cells = [];
        for (const [name, text] of Object.entries(fields)) {
            const matches = columns.filter(column => column.key.name === name);
            if (matches.length !== 1 || matches[0].key.type !== 'text') throw Error('目录须有唯一文本列：' + name);
            const column = matches[0];
            if (['DOI', 'Zotero 键', '原文哈希'].includes(name) && text.trim() && column.values?.some(cell =>
                cell.blockID !== rowID && identity(name, cell.text?.content) === identity(name, text))) {
                throw Error('其他目录记录已使用该身份字段：' + name);
            }
            const current = rowID ? column.values?.find(cell => cell.blockID === rowID)?.text?.content ?? '' : '';
            if (current === text) continue;
            if (current) throw Error('目录已有不同字段值，请走书目联动流程：' + name);
            cells.push({ rowID, columnID: column.key.id, valueType: 'text', text });
        }
        return { rowID, cells };
    }

    let av = await plan();
    let roles;
    for (let attempt = 0; ; attempt += 1) {
        try {
            roles = await tagLiteratureDocument(call, documentId, { execute, failOnConflict: true });
            break;
        } catch (error) {
            if (error.code !== 'literature_index_pending' || attempt === 4) throw error;
            await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
        }
    }
    if (!execute) return { status: '预览', documentId, avID, roleCount: roles.pending, addRow: !av.rowID, fieldsToFill: av.cells.length };
    av = await plan();
    if (!av.rowID) {
        await write(call, 'av', { action: 'add_rows', avID, blockIDs: [documentId] }, async () => {
            if ((await plan()).rowID) throw Error('目录绑定在预检期间变化，请重跑');
        });
        av = await plan();
        if (!av.rowID) throw Error('目录绑定后未读到唯一行');
    }
    if (av.cells.length) await write(call, 'av', { action: 'set_cells', avID, cells: av.cells }, async () => {
        const live = await plan();
        if (live.rowID !== av.rowID || JSON.stringify(live.cells) !== JSON.stringify(av.cells)) throw Error('待补目录字段在预检期间变化，请重跑');
    });
    const verified = await plan();
    if (verified.rowID !== av.rowID || verified.cells.length) throw Error('入库目录回读不一致');
    return { status: '已回读', documentId, avID, rowID: av.rowID, roleCount: roles.pending, contentUnchanged: roles.contentUnchanged ?? null };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    try {
        const args = process.argv.slice(2);
        if (![2, 3].includes(args.length) || args.length === 3 && args[2] !== '--execute') {
            throw Error('用法：node finalize-literature-ingest.mjs MCP设置.json 单篇登记.json [--execute]');
        }
        const [settings, paper] = await Promise.all(args.slice(0, 2).map(async file => JSON.parse(await readFile(file, 'utf8'))));
        const result = await finalizeLiteratureIngest(await mcpConnection(settings), paper, args.includes('--execute'));
        console.log(JSON.stringify(result));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

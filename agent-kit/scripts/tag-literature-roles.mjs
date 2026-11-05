#!/usr/bin/env node
import { readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const roleAttribute = 'custom-literature-role';
export const roleHashAttribute = 'custom-literature-role-sha256';
const validId = /^\d{14}-[a-z0-9]{7}$/;
const abstractHeading = /^(?:(?:translational|structured|plain language) )?(?:abstract|abstrac|摘要|内容提要)$/iu;
const inlineAbstract = /^(?:(?:translational|structured|plain language) )?(?:abstract|摘要)\s*[:：—–-]\s*\S/iu;
const referenceHeading = /^(?:(?:\d+(?:\.\d+)*\.?|[IVX]+\.)\s+)?(?:references|bibliography|literature cited|works cited|参考文献|參考文獻)\s*[.:：]?$/iu;
const endReferences = /^(?:(?:\d+(?:\.\d+)*\.?|[IVX]+\.)\s+)?(?:appendi(?:x|ces)\b|supplement(?:ary|al)?\b|acknowledg(?:e)?ments?\b|author (?:note|contributions?)\b|additional information\b|附录|附錄|补充材料|致谢)/iu;
const structuredAbstract = /^(?:background|objectives?|aims?|design|methods?|results?|conclusions?|背景|目的|方法|结果|结论)\s*[:：—–-]\s*\S/iu;
const keywordLabel = /^(?:key\s*words?|index terms|关键词|關鍵詞)(?:\s*[:：—–-]|$)/iu;
const metaPrefix = /^(?:jel classification|copyright|correspondence|corresponding authors?|author affiliations?|conflicts? of interest|data availability statement|funding|(?:原始)?(?:PDF|MD)绝对路径|(?:原始)?(?:MD\s*)?SHA-256|内容状态|转换说明)\s*[:：—–-]/iu;
const frontMatter = /^(?:\d+\s*)?(?:(?:department|school|faculty|institute|college|university|laboratory|division) of\b|corresponding author\b|author note\b)/iu;
const publicationHistory = /^(?:received|accepted|revision received|revised|published online)\s+(?:(?:on\s+)?\p{L}+\s+\d|\d)/iu;
const figOrTable = /^(?:fig(?:ure)?\.?|table|图|圖|表)\s*[A-Z]?[. -]?\d+(?:[.:-]\d+)*([.：:]|\s+|$)/iu;
const captionNote = /^(?:notes?\.?\s*[:：.]?|注[释釋]?[.：:]?)\s/u;
const bareImagePlaceholder = /^\[原文图像位置[^\]]*\]/u;
const doiOrPmid = /(?:doi\.\s*org\/|\bdoi:\s*|\bPMID:\s*|\b10\.\d{4,9}\/)/iu;
const authorWithYear = /^(?:(?:\[?\d{1,3}[.\])])\s*)?[\p{L}][\p{L}\p{M}'’\-]+,\s*(?:[\p{L}]\.\s*){1,4}[^.!?]{0,110}\(?/u;
const numberedAuthor = /^(?:\[\d+\]|\d+\.)?\s*[\p{L}][\p{L}\p{M}'’\-]+\s+[A-Z]{1,4}(?:,\s*|\.\s*)/u;
const bracketYear = /\((?:18|19|20)\d{2}[a-z]?\)\.\s/u;
const bibliographicYear = /\b(?:18|19|20)\d{2}\s*[;:]\s*\d{1,4}(?:\(|[:.])/u;
const evidenceTypes = new Set(['p', 'm', 't', 'c']);
const explicitFallbackRoles = new Set(['body', 'unknown']);
const trim = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ');
const quote = id => "'" + id + "'";
const sha = value => createHash('sha256').update(value).digest('hex');

function looksLikeReference(text) {
    return authorWithYear.test(text) && bracketYear.test(text)
        || numberedAuthor.test(text) && (bibliographicYear.test(text) || doiOrPmid.test(text));
}

function looksLikeTable(row) {
    return row?.type === 't' || /<table\b/iu.test(row?.sample ?? '');
}

function looksLikeTitle(text) {
    if (text.length < 8 || text.length > 160 || /[.!?。！？：:]$/u.test(text)) return false;
    const words = text.match(/[A-Za-z][A-Za-z'-]*/gu) ?? [];
    return words.length > 2 && words.filter(word => /^[A-Z]/u.test(word)).length >= words.length / 2;
}

function numberedCaption(row) {
    const text = trim(row.sample);
    const match = figOrTable.exec(text);
    if (!match) return false;
    const tail = text.slice(match[0].length).trim();
    if (!tail || /^goes here$/iu.test(tail) || looksLikeTitle(tail)) return true;
    const firstLine = trim(String(row.sample).split(/\r?\n/u)[0]);
    return /[.：:]$/u.test(match[0]) || firstLine === text.slice(0, match[0].trimEnd().length);
}

/** 使用内核返回的真实排列，SQL 只按块 ID 补齐结构和当前属性。 */
export function classifyLiteratureRoles(orderedRows, nestedRows = []) {
    const byId = new Map();
    const samples = [];
    const wrapperIndex = orderedRows.findIndex(row => row.type === 'h' && trim(row.sample) === '原始转换全文');
    const standardCover = wrapperIndex > 0 && wrapperIndex <= 12
        && orderedRows.slice(0, wrapperIndex).every(row => row.type === 'h' || row.type === 'l' && /MD\s*(?:绝对路径|SHA-256)/iu.test(trim(row.sample)));
    let referenceSection = false;
    let abstractBudget = 0;
    let front = true;
    let keywordBudget = 0;

    function add(row, role, rule, relatedId) {
        byId.set(row.id, { id: row.id, role, rule, ...(relatedId ? { relatedId } : {}), ...(typeof row.current === 'string' ? { current: row.current } : {}) });
    }

    for (const [index, row] of orderedRows.entries()) {
        const text = trim(row.sample);
        const next = orderedRows[index + 1];
        if (standardCover && index < wrapperIndex) {
            add(row, 'metadata', '入库封面');
            continue;
        }
        if (keywordLabel.test(text) || metaPrefix.test(text) || publicationHistory.test(text)
            || front && (frontMatter.test(text) || /^\s*\d*\s*[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\s*$/u.test(text))) {
            add(row, 'metadata', '明确书目信息');
            if (keywordLabel.test(text)) keywordBudget = 4;
            continue;
        }
        if (row.type === 'h' || row.type === 'p' && referenceHeading.test(text) && looksLikeReference(trim(next?.sample))) {
            abstractBudget = 0;
            keywordBudget = 0;
            referenceSection = referenceHeading.test(text);
            if (referenceSection) {
                front = false;
                add(row, 'references', '参考文献标题');
            } else if (abstractHeading.test(text) || /^summary$/iu.test(text) && front) {
                abstractBudget = 4;
                add(row, 'abstract', '文首摘要标题');
            } else if (row.type === 'h') {
                if (!/^原始转换全文$/u.test(text) && (endReferences.test(text) || row.subtype !== 'h1')) front = false;
                if (/^(?:references|bibliography|abstract|summary)/iu.test(text) && samples.length < 8) {
                    samples.push({ id: row.id, heading: text.slice(0, 100) });
                }
            }
            continue;
        }
        if (endReferences.test(text)) referenceSection = false;
        if (referenceSection) {
            if (['p', 'l', 'i'].includes(row.type) && !looksLikeTable(row)) add(row, 'references', '参考文献区间');
            continue;
        }
        if (row.type === 'p' && looksLikeReference(text)) {
            add(row, 'references', '独立参考文献条目格式');
            continue;
        }
        if (row.type === 'p' && !looksLikeTable(row) && (inlineAbstract.test(text) || abstractBudget === 4 || abstractBudget > 0 && structuredAbstract.test(text))) {
            add(row, 'abstract', inlineAbstract.test(text) ? '块内摘要前缀' : '摘要后首段或结构化续段');
            abstractBudget = inlineAbstract.test(text) ? 3 : abstractBudget - 1;
            front = false;
            continue;
        }
        abstractBudget = 0;
        if (keywordBudget > 0 && row.type === 'p' && text.length < 120
            && /(?:[,;，；]|[\p{L}\p{N}-]$)/u.test(text)
            && !/[.!?。！？]/u.test(text)
            && text.split(/\s+/u).length <= 12) {
            add(row, 'metadata', '关键词短续行');
            keywordBudget -= 1;
            continue;
        }
        keywordBudget = 0;
        if (row.type === 'p' && !looksLikeTable(row)) {
            const prev = orderedRows[index - 1];
            const beforePrev = orderedRows[index - 2];
            const nearbyTable = [next, prev, beforePrev].find(looksLikeTable);
            const imageNearby = [next, prev].some(item => bareImagePlaceholder.test(trim(item?.sample)));
            if (bareImagePlaceholder.test(text) || numberedCaption(row)
                || (looksLikeTable(next) || imageNearby) && looksLikeTitle(text) || nearbyTable && captionNote.test(text)) {
                add(row, 'caption', bareImagePlaceholder.test(text) ? '原始图像位置或图注' : nearbyTable ? '图表附近的标题或表注' : '独立图表说明', nearbyTable?.id);
            }
        }
    }

    const all = new Map([...orderedRows, ...nestedRows].map(row => [row.id, row]));
    const topIds = new Set(orderedRows.map(row => row.id));
    for (const row of nestedRows) {
        if (!evidenceTypes.has(row.type)) continue;
        let ancestor = all.get(row.parentId);
        const visited = new Set([row.id]);
        while (ancestor && !visited.has(ancestor.id)) {
            visited.add(ancestor.id);
            const parent = byId.get(ancestor.id);
            if (parent && ['l', 'i', 'b', 's'].includes(ancestor.type) && ['metadata', 'references'].includes(parent.role)) {
                add(row, parent.role, '继承已明确归类的容器', ancestor.id);
                break;
            }
            if (topIds.has(ancestor.id)) break;
            ancestor = all.get(ancestor.parentId);
        }
    }
    // 已登记的角色也进入验收清单，包括本轮规则无法覆盖的人工标签。
    for (const row of all.values()) {
        if (typeof row.current !== 'string' || byId.has(row.id)) continue;
        if (explicitFallbackRoles.has(row.current)) add(row, row.current, '保留已有属性');
        else add(row, 'unknown', '已有排除属性缺少当前结构依据');
    }
    return { roles: [...byId.values()], uncertainHeadings: samples };
}

export async function mcpConnection(settings) {
    if (!['127.0.0.1', 'localhost', '::1'].includes(settings.host) || !Number.isInteger(settings.port)
        || settings.port < 1 || settings.port > 65535 || (settings.authEnabled && !settings.token)) throw Error('MCP 设置必须指向已配置的本机网关');
    const host = settings.host === '::1' ? '[::1]' : settings.host;
    const endpoint = 'http://' + host + ':' + settings.port + '/mcp';
    let session = '', protocol = '', request = 0;
    async function send(method, params) {
        const id = method.startsWith('notifications/') ? undefined : ++request;
        const response = await fetch(endpoint, {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(90000),
            headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream',
                ...(settings.authEnabled ? { Authorization: 'Bearer ' + settings.token } : {}),
                ...(session ? { 'mcp-session-id': session } : {}), ...(protocol ? { 'mcp-protocol-version': protocol } : {}) },
            body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        });
        if (!response.ok) throw Error('MCP HTTP ' + response.status);
        session = response.headers.get('mcp-session-id') || session;
        if (id === undefined) { await response.body?.cancel(); return {}; }
        let envelope;
        if (response.headers.get('content-type')?.includes('text/event-stream')) {
            const reader = response.body.getReader(), decoder = new TextDecoder();
            let pending = '';
            try {
                while (!envelope) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    pending += decoder.decode(value, { stream: true });
                    let end;
                    while ((end = pending.indexOf('\n')) >= 0) {
                        const line = pending.slice(0, end).trim();
                        pending = pending.slice(end + 1);
                        if (!line.startsWith('data:')) continue;
                        const item = JSON.parse(line.slice(5));
                        if (item.id === id) envelope = item;
                    }
                }
            } finally { await reader.cancel(); }
        } else envelope = await response.json();
        if (!envelope || envelope.error || envelope.id !== id) throw Error('MCP 协议返回失败');
        return envelope.result;
    }
    const init = await send('initialize', { protocolVersion: '2025-06-18', capabilities: {},
        clientInfo: { name: 'sisyphus-literature-roles', version: '1.0.0' } });
    protocol = init.protocolVersion;
    await send('notifications/initialized');
    return async function call(tool, args) {
        const result = await send('tools/call', { name: tool, arguments: args });
        const value = result.structuredContent ?? JSON.parse(result.content.find(item => item.type === 'text').text);
        if (result.isError || value.error || value.success === false) {
            throw Error('MCP ' + tool + '.' + args.action + ' 失败' + (value.error?.code ? ' ' + value.error.code : ''));
        }
        return value;
    };
}

async function sql(call, statement, maxRows) {
    const result = await call('search', { action: 'query_sql', stmt: statement, maxRows });
    if (!Array.isArray(result.data) || result.truncated || result.kernelTruncated) throw Error('文献块查询被截断');
    return result.data;
}

const attributeValue = name => "(SELECT a.value FROM attributes a WHERE a.block_id=b.id AND a.name='" + name + "' LIMIT 1)";
const indexedHash = attributeValue(roleHashAttribute);
const roleProjection = attributeValue(roleAttribute) + ' AS current,' + indexedHash + ' AS roleHash';

async function readStructure(call, documentId) {
    const [outline, root] = await Promise.all([
        call('document', { action: 'get_child_blocks', id: documentId }),
        sql(call, 'SELECT id, type FROM blocks WHERE id=' + quote(documentId) + ' LIMIT 1', 1),
    ]);
    if (!Array.isArray(outline.value) || !outline.value.length || (root[0] && root[0].type !== 'd')) throw Error('全文根块不存在或没有有序内容');
    if (!root.length) throw Object.assign(Error('实时全文已存在，根块待 SQL 索引'), { code: 'literature_index_pending' });
    const indexed = new Map();
    let cursor = '';
    const pageSize = 400;
    do {
        const page = await sql(call, 'SELECT b.id,b.parent_id AS parentId,b.type,b.subtype,b.hash AS blockHash,'
            + 'substr(b.content,1,420) AS sample,' + roleProjection + ',CASE WHEN ' + indexedHash
            + ' IS NOT NULL THEN b.content END AS roleContent FROM blocks b WHERE b.root_id=' + quote(documentId)
            + ' AND b.id>' + quote(cursor) + ' ORDER BY b.id LIMIT ' + pageSize, pageSize);
        for (const row of page) indexed.set(row.id, row);
        cursor = page.length === pageSize ? page.at(-1).id : '';
    } while (cursor);
    const ordered = outline.value.map(block => {
        const row = indexed.get(block.id);
        if (!row || row.type !== block.type) {
            throw Object.assign(Error('实时块树与 SQL 索引未对齐，待索引稳定后续作'), { code: 'literature_index_pending' });
        }
        return row;
    });
    const topIds = new Set(ordered.map(row => row.id));
    const nested = [...indexed.values()].filter(row => row.type !== 'd' && !topIds.has(row.id));
    return { ordered, nested, indexed };
}

async function readTargets(call, documentId, ids) {
    const rows = await sql(call, 'SELECT b.id,b.hash AS blockHash,b.content AS roleContent,' + roleProjection + ' FROM blocks b WHERE b.root_id='
        + quote(documentId) + ' AND b.id IN (' + ids.map(quote).join(',') + ') LIMIT ' + ids.length, ids.length);
    if (rows.length !== ids.length) throw Error('目标块已变化或未全部返回');
    return new Map(rows.map(row => [row.id, row]));
}

async function readContentState(call, documentId) {
    const result = await call('block', { action: 'get_kramdown', id: documentId });
    if (typeof result.kramdown !== 'string' || !result.kramdown) throw Error('未取得原文回读');
    // 仅忽略本次写入的属性和内核时间戳。其他属性按键排序后仍参与对照。
    const currentRoles = new Map();
    const currentHashes = new Map();
    const canonical = result.kramdown.replace(/\{:[^\r\n]*?\}/gu, ial => {
        const tokens = [...ial.matchAll(/([^\s=]+)="((?:\\.|[^"\\])*)"/gu)];
        const id = tokens.find(token => token[1] === 'id' && validId.test(token[2]))?.[2];
        if (!id) return ial;
        const role = tokens.find(token => token[1] === roleAttribute);
        if (role) currentRoles.set(id, role[2]);
        const hash = tokens.find(token => token[1] === roleHashAttribute);
        if (hash) currentHashes.set(id, hash[2]);
        return tokens.filter(token => !['updated', roleAttribute, roleHashAttribute].includes(token[1])).map(token => token[0]).sort().join(' ');
    });
    return { digest: sha(canonical), currentRoles, currentHashes };
}

export async function tagLiteratureDocument(call, documentId, { execute = false, batchSize = 50, failOnConflict = false, audit = async () => {} } = {}) {
    if (!validId.test(documentId)) throw Error('文献文档标识无效');
    if (typeof call !== 'function' || typeof execute !== 'boolean' || typeof failOnConflict !== 'boolean' || typeof audit !== 'function') {
        throw Error('补标执行选项无效');
    }
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw Error('批大小应为 1 至 100 的整数');
    const before = execute ? await readContentState(call, documentId) : null;
    const { ordered, nested, indexed } = await readStructure(call, documentId);
    const { roles, uncertainHeadings } = classifyLiteratureRoles(ordered, nested);
    const classified = new Set(roles.map(item => item.id));
    for (const row of indexed.values()) {
        if (typeof row.roleHash === 'string' && !classified.has(row.id)) {
            roles.push({ id: row.id, role: 'unknown', rule: '已有自动角色签名但缺少角色' });
        }
    }
    const report = { documentId, scanned: ordered.length + nested.length, counts: {}, items: roles, uncertainHeadings, batches: [] };
    for (const item of roles) {
        const row = indexed.get(item.id);
        if (typeof row.roleHash === 'string' && (typeof item.current !== 'string' || typeof row.roleContent !== 'string' || sha(row.roleContent) !== row.roleHash)) {
            item.state = '冲突保留';
            item.reason = '已登记的自动角色与当前块内容不一致';
        } else if (item.current === undefined) {
            item.state = evidenceTypes.has(row.type) ? '待登记' : '仅用于结构判断';
        } else item.state = item.current === item.role ? '已登记' : '冲突保留';
        if (item.state !== '仅用于结构判断') report.counts[item.role] = (report.counts[item.role] ?? 0) + 1;
    }
    report.pending = roles.filter(item => item.state === '待登记').length;
    report.conflicts = roles.filter(item => item.state === '冲突保留').length;
    await audit(report);
    if (failOnConflict && report.conflicts) throw Error('已有文献角色与自动判定冲突，需核对后继续入库');
    if (!execute || !report.pending) return report;
    const targets = roles.filter(item => item.state === '待登记');
    for (let start = 0; start < targets.length; start += batchSize) {
        const batch = targets.slice(start, start + batchSize);
        const ids = batch.map(item => item.id);
        const snapshot = await readTargets(call, documentId, ids);
        const desired = new Map();
        for (const item of batch) {
            const row = snapshot.get(item.id);
            if (typeof row.roleContent !== 'string' || row.current != null || row.roleHash != null || row.blockHash !== indexed.get(item.id)?.blockHash) {
                throw Error('预览后目标发生变化，重新预览再补标');
            }
            desired.set(item.id, sha(row.roleContent));
        }
        const args = { action: 'set_attrs', items: batch.map(item => ({ id: item.id,
            attrs: { [roleAttribute]: item.role, [roleHashAttribute]: desired.get(item.id) } })) };
        const t = performance.now();
        const pre = await call('block', { ...args, validateOnly: true });
        if (!pre.issuedRequestId || pre.preconditionField !== 'expectedStateHash' || !(pre.expectedStateHash ?? pre.stateHash)) throw Error('严格预检未签发写入凭据');
        const [live, content] = await Promise.all([readTargets(call, documentId, ids), readContentState(call, documentId)]);
        if (before.digest !== content.digest || ids.some(id => content.currentRoles.has(id) || content.currentHashes.has(id))) {
            throw Error('实时文档或角色在预检后变化，重新预览再补标');
        }
        if (ids.some(id => live.get(id)?.current != null || live.get(id)?.roleHash != null
            || live.get(id)?.blockHash !== snapshot.get(id)?.blockHash || live.get(id)?.roleContent !== snapshot.get(id)?.roleContent)) {
            throw Error('预览后目标发生变化，重新预览再补标');
        }
        const record = { first: ids[0], count: ids.length, state: '预检完成', preflightMs: Math.round(performance.now() - t) };
        report.batches.push(record);
        await audit(report);
        const started = performance.now();
        const result = await call('block', { ...args, requestId: pre.issuedRequestId, expectedStateHash: pre.expectedStateHash ?? pre.stateHash });
        if (result.verification?.status !== 'verified' || result.verification.itemCount !== ids.length) throw Error('写入未得到完整属性回读');
        record.state = '接口已回读';
        record.writeMs = Math.round(performance.now() - started);
        for (const item of batch) {
            item.state = '接口已回读';
            item.roleHash = desired.get(item.id);
        }
        await audit(report);
    }
    const final = await readContentState(call, documentId);
    report.contentUnchanged = final.digest === before.digest;
    if (!report.contentUnchanged) throw Error('写后正文或既有属性出现变化，需检查当前文档');
    if (targets.some(item => final.currentRoles.get(item.id) !== item.role || final.currentHashes.get(item.id) !== item.roleHash)
        || [...before.currentRoles].some(([id, role]) => final.currentRoles.get(id) !== role)
        || [...before.currentHashes].some(([id, hash]) => final.currentHashes.get(id) !== hash)) {
        throw Error('最终文档回读的角色未完全对齐');
    }
    // 内核可能延迟提交派生属性索引。先读取真实文档，再在篇末统一核对 SQL。
    for (const delay of [0, 500, 1000, 2000, 4000]) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        const { indexed: after } = await readStructure(call, documentId);
        if (targets.every(item => after.get(item.id)?.current === item.role && after.get(item.id)?.roleHash === item.roleHash)) {
            for (const item of targets) item.state = '已写入并回读';
            for (const record of report.batches) record.state = 'SQL 已回读';
            break;
        }
    }
    if (targets.some(item => item.state !== '已写入并回读')) throw Error('角色已通过实时回读但尚未进入 SQL 索引，停止续写');
    await audit(report);
    return report;
}

function parseOptions(argv) {
    const opts = { execute: false, batchSize: 50 };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--execute') opts.execute = true;
        else if (arg === '--help') return null;
        else if (['--mcp-settings', '--manifest', '--report', '--document-id', '--batch-size'].includes(arg) && argv[i + 1]) {
            opts[arg.slice(2)] = argv[++i];
        } else throw Error('参数无效');
    }
    if (!opts['mcp-settings'] || !opts.report || Boolean(opts.manifest) === Boolean(opts['document-id'])) throw Error('需要 --mcp-settings、--report 及 --manifest 或 --document-id 中的一项');
    if (opts['batch-size']) opts.batchSize = Number(opts['batch-size']);
    if (!Number.isInteger(opts.batchSize) || opts.batchSize < 1 || opts.batchSize > 100) throw Error('批大小应为 1 至 100 的整数');
    return opts;
}

async function main(opts) {
    const json = async file => JSON.parse(await readFile(file, 'utf8'));
    const [settings, manifest] = await Promise.all([json(opts['mcp-settings']), opts.manifest ? json(opts.manifest) : null]);
    const ids = manifest ? manifest.records?.map(row => row.documentId) : [opts['document-id']];
    if (!Array.isArray(ids) || !ids.length || ids.some(id => !validId.test(id)) || new Set(ids).size !== ids.length
        || manifest && !validId.test(manifest.avID)) throw Error('文献清单有无效或重复的文档标识');
    const call = await mcpConnection(settings);
    const boot = await call('system', { action: 'bootstrap' });
    if (opts.execute && boot.writeSafety?.strictMode !== true) throw Error('执行补标需要启用 MCP 严格写入');
    if (manifest) {
        const raw = await call('av', { action: 'get', id: manifest.avID });
        const bindings = raw.av?.keyValues?.find(column => column.key?.type === 'block')?.values ?? [];
        const counts = new Map();
        for (const cell of bindings) counts.set(cell.block?.id, (counts.get(cell.block?.id) ?? 0) + 1);
        if (ids.some(id => counts.get(id) !== 1)) throw Error('清单存在未唯一绑定到指定 AV 的全文');
    }
    const report = { version: 1, mode: opts.execute ? '执行' : '预览', scope: ids.length, state: '处理中', documents: [] };
    const save = async () => {
        const temporary = opts.report + '.' + process.pid + '.tmp';
        await writeFile(temporary, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
        await rename(temporary, opts.report);
    };
    try {
        for (const documentId of ids) {
            const audit = async document => {
                if (report.documents.at(-1)?.documentId !== documentId) report.documents.push(document);
                if (opts.execute) await save();
            };
            await tagLiteratureDocument(call, documentId, { ...opts, audit });
        }
        report.state = '完成';
    } catch (error) {
        report.state = '停止';
        report.error = error.message;
        throw error;
    } finally { await save(); }
    const counts = {};
    let scanned = 0, pending = 0, verified = 0, conflicts = 0;
    for (const document of report.documents) {
        scanned += document.scanned;
        pending += document.pending;
        conflicts += document.conflicts;
        verified += document.items.filter(item => item.state === '已写入并回读').length;
        for (const [role, count] of Object.entries(document.counts)) counts[role] = (counts[role] ?? 0) + count;
    }
    console.log(JSON.stringify({ mode: report.mode, documents: report.documents.length, scanned, pending, verified, conflicts, counts }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    try {
        const opts = parseOptions(process.argv.slice(2));
        if (!opts) console.log('用法 node tag-literature-roles.mjs --mcp-settings 文件 --manifest 文件或 --document-id 文档ID --report 文件 [--execute] [--batch-size 50]');
        else await main(opts);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

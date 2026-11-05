#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { finalizeLiteratureIngest } from './finalize-literature-ingest.mjs';
import { ensureZoteroItem } from './register-literature-zotero.mjs';
import { projectRecord } from './sync-literature-catalog.mjs';
import { mcpConnection } from './tag-literature-roles.mjs';

const idPattern = /^\d{14}-[a-z0-9]{7}$/;
const shaPattern = /^[a-f0-9]{64}$/;
const digest = data => createHash('sha256').update(data).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const normalizeDoi = value => String(value ?? '').trim().toLowerCase().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi\s*:\s*)/, '');

async function save(file, value) {
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    await rename(temp, file);
}

async function loadReceipt(file) {
    try { return await json(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function normalizeText(text) {
    return text.normalize('NFKC').replace(/\{:[^\n]*\}/g, '').replace(/<[^>]+>/g, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
}

async function verifyDocument(call, documentId, body, sourceSha256, existingBinding, previousDigest) {
    const raw = await call('block', { action: 'get_kramdown', id: documentId });
    if (typeof raw.kramdown !== 'string') throw Error('无法回读思源正文');
    if (!existingBinding && !raw.kramdown.includes(`原始MD SHA-256：${sourceSha256}`)) throw Error('同名文档缺少本次原文指纹');
    const normalized = normalizeText(raw.kramdown);
    const bodyDigest = digest(raw.kramdown.replace(/\{:[^\n]*\}/g, '').replace(/\s+/g, ' ').trim());
    if (previousDigest && previousDigest !== bodyDigest) throw Error('思源正文在既有登记后变化，需核对版本');
    const paragraphs = body.split(/\n\s*\n/).map(normalizeText).filter(part => part.length >= 48);
    const anchors = [...new Set([paragraphs[0]?.slice(0, 48), paragraphs[Math.floor(paragraphs.length / 2)]?.slice(0, 48), paragraphs.at(-1)?.slice(-48)])];
    if (!paragraphs.length || !anchors.every(anchor => normalized.includes(anchor)) || normalized.length < normalizeText(body).length * 0.9) {
        throw Error('思源回读与原文首、中、尾锚点或长度不符');
    }
    return bodyDigest;
}

async function intakeDocument(call, project, row, body, entry, persist, execute) {
    const title = row.siyuanTitle ?? row.zoteroItem.title;
    const existingBinding = row.documentId && row.documentId === entry.avDocumentId;
    if (entry.documentId) {
        const resolved = await call('document', { action: 'lookup', id: entry.documentId, include: ['id', 'identity'] });
        if (resolved.identity?.id !== entry.documentId || resolved.identity.notebook !== project.siyuan.notebook) throw Error('既有正文不属于指定笔记本');
        entry.bodyDigest = await verifyDocument(call, entry.documentId, body, row.sourceSha256, existingBinding, entry.bodyDigest);
        return entry.documentId;
    }
    const lookup = () => call('document', { action: 'lookup', notebook: project.siyuan.notebook,
        ...(project.siyuan.parentID ? { parentID: project.siyuan.parentID } : {}), segments: [title] });
    let result = await lookup();
    if (result.status === 'resolved' && idPattern.test(result.id)) {
        entry.bodyDigest = await verifyDocument(call, result.id, body, row.sourceSha256, false, entry.bodyDigest);
        entry.documentId = result.id;
        if (execute) await persist();
        return result.id;
    }
    if (result.status !== 'missing') throw Error('同名思源文档存在歧义或索引暂不可用');
    if (entry.createRequested) throw Error('此前创建结果待核，暂未发现文档');
    if (!execute) return null;
    const args = { action: 'create', notebook: project.siyuan.notebook, parentID: project.siyuan.parentID,
        title, icon: '1f4c4', markdown: `原始MD SHA-256：${row.sourceSha256}\n\n${body}` };
    const pre = await call('document', { ...args, validateOnly: true });
    if (!pre.issuedRequestId) throw Error('未取得创建文档预检凭据');
    result = await lookup();
    if (result.status !== 'missing') throw Error('文档位置在预检期间变化');
    const credentials = { requestId: pre.issuedRequestId };
    if (pre.preconditionField) {
        const alias = pre.preconditionField.replace(/^expected([A-Z])/, (_, c) => c.toLowerCase());
        const credential = pre[pre.preconditionField] ?? pre[alias];
        if (!credential) throw Error('未取得创建文档前置条件');
        credentials[pre.preconditionField] = credential;
    }
    entry.createRequested = true;
    await persist();
    const created = await call('document', { ...args, ...credentials });
    if (!idPattern.test(created.id)) throw Error('创建响应缺少可对账的文档标识');
    entry.documentId = created.id;
    await persist();
    entry.bodyDigest = await verifyDocument(call, entry.documentId, body, row.sourceSha256, false, entry.bodyDigest);
    await persist();
    return entry.documentId;
}

function validate(project, manifest) {
    const target = project.siyuan;
    if (!idPattern.test(target?.avID) || !idPattern.test(target?.notebook)
        || !(target.parentID === null || idPattern.test(target.parentID))) throw Error('项目须指定 AV、笔记本和父文档标识');
    if (project.notebooklm && (typeof project.notebooklm.notebookTitle !== 'string' || !project.notebooklm.notebookTitle.trim()
        || project.notebooklm.notebookId && !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(project.notebooklm.notebookId))) throw Error('云端笔记本配置无效');
    if (!Array.isArray(manifest.papers) || !manifest.papers.length) throw Error('批次清单缺少论文');
    const hashes = new Set(), titles = new Set(), dois = new Set(), keys = new Set(), docs = new Set();
    for (const row of manifest.papers) {
        const title = row.siyuanTitle ?? row.zoteroItem?.title;
        const doi = normalizeDoi(row.zoteroItem?.DOI);
        if (!row.zoteroItem?.title?.trim() || typeof title !== 'string' || !title.trim() || title.length > 512 || /[\r\n]/.test(title)
            || typeof row.sourcePath !== 'string' || !path.isAbsolute(row.sourcePath) || path.extname(row.sourcePath).toLowerCase() !== '.md'
            || !shaPattern.test(row.sourceSha256) || row.documentId && !idPattern.test(row.documentId)
            || row.zoteroKey && !/^[A-Z0-9]{8}$/.test(row.zoteroKey) || row.sourceId && !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(row.sourceId)) throw Error('批次论文格式无效');
        if ((row.adoptUploadPath !== undefined || row.adoptUploadSha256 !== undefined) &&
            (!row.sourceId || !path.isAbsolute(row.adoptUploadPath ?? '') || !shaPattern.test(row.adoptUploadSha256))) {
            throw Error('历史上传副本需要来源标识、绝对路径和 SHA-256');
        }
        if (hashes.has(row.sourceSha256) || titles.has(title) || doi && dois.has(doi) || row.zoteroKey && keys.has(row.zoteroKey)
            || row.documentId && docs.has(row.documentId)) throw Error('批次存在重复正文、标题或书目身份');
        hashes.add(row.sourceSha256); titles.add(title);
        if (doi) dois.add(doi);
        if (row.zoteroKey) keys.add(row.zoteroKey);
        if (row.documentId) docs.add(row.documentId);
    }
}

export async function ingestLiteratureBatch({ project, manifest, mcpSettings, zoteroConfig, receiptFile, execute = false,
    call, ensure = ensureZoteroItem, upload }) {
    validate(project, manifest);
    const { notebook, parentID, avID } = project.siyuan;
    const cloudTarget = project.notebooklm;
    const scopeHash = digest(JSON.stringify({ siyuan: [notebook, parentID, avID],
        notebooklm: cloudTarget ? [cloudTarget.notebookId, cloudTarget.notebookTitle, cloudTarget.profile] : null,
        gateway: [mcpSettings.host, mcpSettings.port], zotero: zoteroConfig.baseUrl }));
    const receipt = await loadReceipt(receiptFile) ?? { version: 1, scopeHash, papers: {} };
    if (receipt.version !== 1 || receipt.scopeHash !== scopeHash) throw Error('收据绑定不同项目、网关或文库');
    const persist = async () => { if (execute) await save(receiptFile, receipt); };
    const boot = await call('system', { action: 'bootstrap' });
    if (execute && boot.writeSafety?.strictMode !== true) throw Error('入库需要启用思源严格写入');
    const initial = await call('av', { action: 'get', id: project.siyuan.avID });
    const cols = new Map(initial.av?.keyValues?.map(column => [column.key.name, column]) ?? []);
    const primary = [...cols.values()].find(column => column.key.type === 'block');
    if (!primary || ['题名', '原文哈希', 'Zotero 键'].some(name => cols.get(name)?.key.type !== 'text')) throw Error('AV 缺少绑定主键或必要文本列');
    if (initial.av.keyValues.length !== cols.size) throw Error('AV 存在重名列');
    const cell = (name, rowID) => cols.get(name)?.values?.find(value => value.blockID === rowID)?.text?.content ?? '';
    const prepared = [];
    // 先检查整个清单的文件与已登记身份，再产生任何外部写入。
    for (const row of manifest.papers) {
        const bytes = await readFile(row.sourcePath);
        if (digest(bytes) !== row.sourceSha256) throw Error('源 Markdown 已变化：' + row.sourcePath);
        if (row.adoptUploadPath && digest(await readFile(row.adoptUploadPath)) !== row.adoptUploadSha256) throw Error('历史上传副本已变化');
        const body = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
            .replace(/!\[([^\]]*)\]\([^)]*\)/g, '[原文图像位置：$1；参见原始 PDF]')
            .replace(/<img\b[^>]*>/gi, '[原文图像位置；参见原始 PDF]');
        if (!body.trim() || normalizeText(body).length < 48) throw Error('正文太短：' + row.sourcePath);
        const entry = receipt.papers[row.sourceSha256] ?? {};
        const matches = (primary.values ?? []).filter(v => cell('原文哈希', v.blockID) === row.sourceSha256
            || row.documentId && v.block?.id === row.documentId || row.zoteroKey && cell('Zotero 键', v.blockID) === row.zoteroKey
            || row.zoteroItem.DOI && normalizeDoi(cell('DOI', v.blockID)) === normalizeDoi(row.zoteroItem.DOI));
        if (matches.length > 1 || matches.some(v => !idPattern.test(v.block?.id) || cell('原文哈希', v.blockID) !== row.sourceSha256)) throw Error('AV 已登记该身份的另一版本或重复行');
        const bound = matches[0];
        const documentId = entry.documentId ?? row.documentId ?? bound?.block?.id;
        const zoteroKey = entry.zoteroKey ?? row.zoteroKey ?? (bound ? cell('Zotero 键', bound.blockID) : '') ?? '';
        if ([entry.documentId, row.documentId, bound?.block?.id].some(id => id && id !== documentId)
            || [entry.zoteroKey, row.zoteroKey, bound && cell('Zotero 键', bound.blockID)].some(key => key && key !== zoteroKey)
            || entry.sourceId && row.sourceId && entry.sourceId !== row.sourceId) throw Error('收据与现有绑定冲突');
        Object.assign(entry, { documentId, zoteroKey: zoteroKey || undefined, avDocumentId: bound?.block?.id });
        const checked = { ...row, documentId, zoteroKey: entry.zoteroKey };
        await intakeDocument(call, project, checked, body, entry, persist, false);
        const plan = await ensure(zoteroConfig, { ...checked, createRequested: entry.zoteroCreateRequested }, { execute: false });
        if (plan.key && bound && cell('Zotero 键', bound.blockID) && cell('Zotero 键', bound.blockID) !== plan.key) throw Error('已登记的 Zotero 键不一致');
        prepared.push({ row: checked, body, entry, plan });
    }
    if (!execute) return { mode: '预览', papers: prepared.map(({ row, entry, plan }) => ({ sourcePath: row.sourcePath,
        documentId: entry.documentId ?? null, zoteroKey: plan.key, cloudRequested: Boolean(project.notebooklm) })) };

    const sources = [], outcomes = [];
    for (const { row, body, entry, plan } of prepared) {
        receipt.papers[row.sourceSha256] = entry;
        Object.assign(entry, { sourcePath: row.sourcePath, title: row.zoteroItem.title, doi: normalizeDoi(row.zoteroItem.DOI) });
        try {
            const registered = await ensure(zoteroConfig, { ...row, zoteroKey: entry.zoteroKey ?? plan.key ?? undefined, createRequested: entry.zoteroCreateRequested }, {
                execute: true, checkpoint: async key => { entry.zoteroKey = key; await persist(); },
                beforeCreate: async () => { entry.zoteroCreateRequested = true; await persist(); },
            });
            if (!registered.key || !registered.data) throw Error('未确认 Zotero 条目');
            const documentId = await intakeDocument(call, project, row, body, entry, persist, true);
            const fields = Object.fromEntries(Object.entries(projectRecord({ ...registered.data, key: registered.key }))
                .filter(([name, value]) => value && cols.get(name)?.key.type === 'text'));
            fields['原文哈希'] = row.sourceSha256;
            if (cols.get('来源MD绝对路径')?.key.type === 'text' && !entry.avDocumentId) fields['来源MD绝对路径'] = row.sourcePath;
            const result = await finalizeLiteratureIngest(call, { documentId, avID: project.siyuan.avID, fields }, true);
            entry.bodyDigest = await verifyDocument(call, documentId, body, row.sourceSha256, Boolean(entry.avDocumentId), entry.bodyDigest);
            entry.avVerified = true;
            entry.rowID = result.rowID;
            entry.localState = '已回读';
            delete entry.localError;
            const sourceId = entry.sourceId ?? row.sourceId;
            sources.push({ documentId, sourcePath: row.sourcePath, sourceSha256: row.sourceSha256, ...(sourceId ? { sourceId } : {}),
                ...(row.adoptUploadPath ? { adoptUploadPath: row.adoptUploadPath, adoptUploadSha256: row.adoptUploadSha256 } : {}) });
            outcomes.push({ sourceSha256: row.sourceSha256, documentId, rowID: entry.rowID, zoteroKey: entry.zoteroKey, local: '已回读' });
        } catch (error) {
            if (error.code === 'zotero_not_created') entry.zoteroCreateRequested = false;
            entry.localState = '待对账';
            entry.localError = error.message;
            outcomes.push({ sourceSha256: row.sourceSha256, local: '待对账', error: error.message });
        }
        await persist();
    }
    let cloud;
    if (project.notebooklm && sources.length) {
        const cloudFile = receiptFile + '.notebooklm.json';
        const previous = await loadReceipt(cloudFile);
        const notebookId = project.notebooklm.notebookId ?? receipt.notebookId ?? previous?.notebookId;
        if ([receipt.notebookId, previous?.notebookId].some(id => id && id !== notebookId)) throw Error('NotebookLM 收据目标不一致');
        let error;
        try { await upload({ ...project.notebooklm, ...(notebookId ? { notebookId } : {}), sources }, cloudFile); } catch (reason) { error = reason.message; }
        const remote = await loadReceipt(cloudFile);
        if (remote?.notebookId) receipt.notebookId = remote.notebookId;
        const confirmed = new Map((remote?.sources ?? []).filter(source => source.verified === true).map(source => [source.documentId, source]));
        let verified = 0;
        for (const source of sources) {
            const stored = confirmed.get(source.documentId);
            if (stored?.sourceSha256 !== source.sourceSha256 || !stored.sourceId) continue;
            receipt.papers[source.sourceSha256].sourceId = stored.sourceId;
            verified += 1;
        }
        cloud = { notebookId: remote?.notebookId ?? null, scopePath: cloudFile, verified, pending: sources.length - verified, ...(error ? { error } : {}) };
        await persist();
    }
    const complete = outcomes.every(item => item.local === '已回读') && (!project.notebooklm || cloud?.pending === 0 && !cloud.error);
    return { mode: '执行', complete, outcomes, ...(cloud ? { cloud } : {}) };
}

function parse(argv) {
    const options = {};
    for (let i = 0; i < argv.length; i += 1) {
        const flag = argv[i];
        if (flag === '--execute') options.execute = true;
        else if (['--project', '--manifest', '--mcp-settings', '--zotero-config', '--receipt', '--python'].includes(flag) && argv[i + 1]) options[flag.slice(2)] = argv[++i];
        else throw Error('未知参数或缺少参数值：' + flag);
    }
    if (['project', 'manifest', 'mcp-settings', 'zotero-config', 'receipt'].some(key => !options[key])) throw Error('须指定项目、批次、两个私有配置与项目收据');
    return options;
}

async function main(argv) {
    const options = parse(argv);
    const [project, manifest, mcpSettings, zoteroConfig] = await Promise.all([options.project, options.manifest, options['mcp-settings'], options['zotero-config']].map(json));
    const receiptFile = path.resolve(options.receipt);
    const lockFile = receiptFile + '.lock';
    const lock = options.execute ? await open(lockFile, 'wx', 0o600) : null;
    try {
        if (lock) await lock.writeFile(String(process.pid) + '\n');
        const call = await mcpConnection(mcpSettings);
        const upload = async (request, cloudFile) => {
            const requestFile = receiptFile + '.notebooklm-request.json';
            await save(requestFile, request);
            await new Promise((resolve, reject) => {
                const child = spawn(options.python ?? 'python3', [fileURLToPath(new URL('./upload-notebooklm-literature.py', import.meta.url)),
                    '--request', requestFile, '--receipt', cloudFile, '--execute'], { stdio: ['ignore', 'ignore', 'inherit'] });
                child.on('error', reject);
                child.on('exit', code => code === 0 ? resolve() : reject(Error('NotebookLM 上传或回读未完成')));
            });
        };
        const result = await ingestLiteratureBatch({ project, manifest, mcpSettings, zoteroConfig, receiptFile, execute: options.execute, call, upload });
        console.log(JSON.stringify(result, null, 2));
        if (result.complete === false) process.exitCode = 1;
    } finally {
        if (lock) { await lock.close(); await unlink(lockFile); }
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    try { await main(process.argv.slice(2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}

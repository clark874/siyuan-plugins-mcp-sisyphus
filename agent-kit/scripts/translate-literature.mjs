#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, readdir, realpath, unlink, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { writeLiteratureRecord } from './finalize-literature-ingest.mjs';
import { literatureSourceMarkdown as paperMarkdown } from './literature-source.mjs';
import { mcpConnection } from './tag-literature-roles.mjs';
import { readTranslationSource, prepareTranslation, inheritTranslationRoles } from './translation-roles.mjs';
import { findUnsupportedTable, assertMarkdownTablesMatch } from './pandoc-grid-table.mjs';

const run = promisify(execFile);
const idPattern = /^\d{14}-[a-z0-9]{7}$/;
const originalAttribute = 'custom-literature-original-id';
const translationAttribute = 'custom-literature-translation-id';
const sourceHashAttribute = 'custom-literature-translation-source';
const sha256 = text => createHash('sha256').update(text).digest('hex');

const evidenceText = value => paperMarkdown(value).normalize('NFKC').replace(/[^\p{L}\p{N}+=−-]/gu, '').toLowerCase();

function verifyTranslationBody(translation, stored) {
    const expected = evidenceText(translation);
    const actual = evidenceText(stored);
    const anchors = [0, Math.floor(expected.length / 2), Math.max(0, expected.length - 32)]
        .map(start => expected.slice(start, start + 32));
    if (expected.length < 20 || actual.length < expected.length * 0.9 || !anchors.every(anchor => actual.includes(anchor))) {
        throw Error('译文回读与生成稿的首、中、尾或长度不符');
    }
}

// 思源会把 HTML 表格内的空行解析成新段落。只在归档时折叠这些空行，
// 保留译文缓存及代码示例，也不改动对照配对的结构检查。
export function normalizeTranslationArchiveMarkdown(markdown) {
    const normalizeTables = text => text.replace(
        /^ {0,3}\u3000*<table\b[^>]*>(?:(?!<\/?table\b)[\s\S])*<\/table\s*>[ \t]*(?=\r?$)/gimu,
        table => /<(?:pre|textarea|script|style)\b/iu.test(table)
            ? table : table.replace(/(?:\r?\n[ \t]*){2,}/gu, ' '),
    );
    let result = '', start = 0, fence;
    for (const match of markdown.matchAll(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)/gmu)) {
        const [, marker, tail] = match;
        if (!fence) {
            if (marker[0] === '`' && tail.includes('`')) continue;
            result += normalizeTables(markdown.slice(start, match.index));
            start = match.index;
            fence = marker;
        } else if (marker[0] === fence[0] && marker.length >= fence.length && !tail.trim()) {
            const end = match.index + match[0].length;
            result += markdown.slice(start, end);
            start = end;
            fence = undefined;
        }
    }
    return result + (fence ? markdown.slice(start) : normalizeTables(markdown.slice(start)));
}

async function optionalFile(file) {
    try { return await readFile(file, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function checkTranslationTables(source) {
    const unsupported = findUnsupportedTable(source.original);
    if (unsupported) throw Error(`原文第 ${unsupported.line} 行的${unsupported.kind}尚未通过入库验表，请先修复原文再翻译`);
    assertMarkdownTablesMatch(source.original, source.blocks.filter(block => block.type === 't').map(block => block.markdown).join('\n\n'));
}

async function cachedOutput(work, plan, settings) {
    if (!settings?.executable || !path.isAbsolute(settings.configPath ?? '')) return null;
    const configuration = await readFile(settings.configPath);
    const invocationHash = sha256(JSON.stringify(['roles-v1', settings.executable, settings.configPath, sha256(configuration), sha256(plan.text)]));
    const cache = path.join(work, invocationHash);
    const [text, verified, input] = await Promise.all([
        optionalFile(path.join(cache, 'source.zh.md')), optionalFile(path.join(cache, 'verified.sha256')),
        optionalFile(path.join(cache, 'source.md')),
    ]);
    if (input?.trimEnd() !== plan.text.trimEnd()) return { invocationHash, cache, complete: false, resumable: false };
    if (text && verified?.trim() === sha256(text)) return { invocationHash, cache, complete: true, resumable: false };
    const inputPath = await realpath(path.join(cache, 'source.md'));
    const relative = path.relative(await realpath(os.homedir()), inputPath);
    const nested = relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
    const result = nested ? path.join(cache, path.dirname(relative), 'source.zh.md') : path.join(cache, 'source.zh.md');
    const [output, reportRaw] = await Promise.all([optionalFile(result), optionalFile(result + '.report.json')]);
    if (output && reportRaw) {
        try {
            const report = JSON.parse(reportRaw);
            if (report.validation_passed === true && await realpath(report.input_path) === inputPath) {
                plan.restore(output);
                return { invocationHash, cache, complete: true, resumable: false };
            }
        } catch { /* 未核准产物仍按检查点处理。 */ }
    }
    const checkpoints = await readdir(path.join(cache, '.mdtx-state')).catch(error => {
        if (error.code === 'ENOENT') return [];
        throw error;
    });
    return { invocationHash, cache, complete: false, resumable: checkpoints.some(name => name.endsWith('.json')) };
}

async function verifiedPending(work, pending, title, plan) {
    const intent = JSON.parse(pending);
    if (intent.title !== title || !/^[a-f0-9]{64}$/u.test(intent.invocationHash ?? '') || !/^[a-f0-9]{64}$/u.test(intent.sha256 ?? '')) throw Error('译文待对账记录无效');
    const cache = path.join(work, intent.invocationHash);
    const [text, input] = await Promise.all([optionalFile(path.join(cache, 'source.zh.md')), optionalFile(path.join(cache, 'source.md'))]);
    if (!text || sha256(text) !== intent.sha256 || input?.trimEnd() !== plan.text.trimEnd()) throw Error('待归档译文与本次原文计划不符');
    return text;
}

function verifyBlockStructure(source, target, marker) {
    const blocks = target.blocks.filter(block => block.content !== marker);
    if (source.blocks.length !== blocks.length || source.blocks.some((block, index) => block.type !== blocks[index].type
        || block.subtype !== blocks[index].subtype || ['c', 'm'].includes(block.type) && block.content !== blocks[index].content)) {
        throw Error('已有译文块结构未对齐，请先修复归档内容');
    }
    return blocks.every((block, index) => block.pairedSource === source.blocks[index].id
        && (!source.blocks[index].role || block.role === source.blocks[index].role));
}

/** 仅读取现有译文、缓存及检查点，供调用方在任何模型请求前展示实际去向。 */
export async function inspectLiteratureTranslation(call, { documentId, notebook, settings }) {
    if (!idPattern.test(documentId)) throw Error('文献正文标识无效');
    const { identity } = await call('document', { action: 'lookup', id: documentId, include: ['identity'] });
    if (identity?.id !== documentId || notebook && identity.notebook !== notebook) throw Error('原文不属于配置的笔记本');
    notebook = identity.notebook;
    const attrs = await call('block', { action: 'get_attrs', id: documentId });
    if (attrs[originalAttribute]) throw Error('请从规范原文发起翻译');
    const source = await readTranslationSource(call, documentId);
    const sourceHash = sha256(source.original);
    const state = { documentId, sourceHash, sourceDigest: source.digest, status: 'blocked', message: '', willInvokeModel: false };
    try {
        if (!source.original) throw Error('没有读到论文原文');
        checkTranslationTables(source);
        const plan = prepareTranslation(source);
        const marker = '机器译文对应原文 SHA-256：' + sourceHash;
        const title = '中文译文（机器翻译） ' + sourceHash.slice(0, 12) + ' ' + source.digest.slice(0, 8);
        const work = path.join(os.homedir(), '.siyuan-sisyphus', 'literature-translation', documentId, sourceHash);
        const lock = await optionalFile(path.join(work, 'translation.lock'));
        if (lock) throw Error('当前原文有运行任务或待核对的运行锁，请先停止任务或核对运行状态');
        const pending = await optionalFile(path.join(work, 'archive-requested'));
        const linkedId = attrs[translationAttribute];
        if (linkedId && !idPattern.test(linkedId)) throw Error('已有译文标识无效，请先核对');
        let linked;
        if (linkedId && idPattern.test(linkedId)) {
            const linkedAttrs = await call('block', { action: 'get_attrs', id: linkedId });
            if (linkedAttrs[originalAttribute] === documentId && linkedAttrs[sourceHashAttribute] === sourceHash) {
                linked = await readTranslationSource(call, linkedId);
                if (!linked.original.startsWith(marker + '\n')) throw Error('已有译文原文指纹缺失');
                if (verifyBlockStructure(source, linked, marker) && !pending) return { ...state, status: 'ready', message: '已有经过配对核验的当前译文，可直接开启对照阅读。', translationId: linkedId };
                return { ...state, status: 'cached', message: '已有当前译文，将补齐配对并回读，无需模型调用。', translationId: linkedId };
            }
        }
        const existing = await call('document', { action: 'lookup', notebook, parentID: documentId, segments: [title] });
        if (existing.status === 'resolved') {
            if (!pending) throw Error('已有同名译文，但缺少可验证的归档记录，请先核对');
            const text = await verifiedPending(work, pending, title, plan);
            const target = await readTranslationSource(call, existing.id);
            if (!target.original.startsWith(marker + '\n')) throw Error('已有译文的原文指纹不匹配');
            verifyTranslationBody(text, target.original.slice(marker.length));
            verifyBlockStructure(source, target, marker);
            return { ...state, status: 'cached', message: '已有待完成配对的归档译文，将复用并回读，无需模型调用。', translationId: existing.id, pendingArchive: true };
        }
        if (existing.status !== 'missing') throw Error('译文位置不唯一或索引暂不可用');
        if (pending) throw Error('此前译文创建结果待对账，请先核对原文下的子文档');
        const output = await cachedOutput(work, plan, settings);
        if (output?.complete) return { ...state, status: 'cached', message: '已有经校验的当前全文缓存，将直接归档，无需模型调用。' };
        const children = await call('document', { action: 'get_child_docs', id: documentId });
        const previousTranslations = (children.value ?? []).filter(child => idPattern.test(child.id)
            && String(child.name ?? '').startsWith('中文译文（机器翻译） ')).map(child => ({ id: child.id, title: child.name }));
        if (output?.resumable) return { ...state, status: 'resumable', message: '存在当前版本的检查点，将尝试续跑，未完成部分可能调用模型。', willInvokeModel: true, previousTranslations };
        if (previousTranslations.length || linkedId) return { ...state, status: 'previous', message: '发现旧版译文，但与当前原文版本不符。继续将翻译当前版本并可能产生费用。', willInvokeModel: true, previousTranslations };
        return { ...state, status: 'new', message: '未发现当前译文或可复用缓存，继续将首次调用模型翻译。', willInvokeModel: true };
    } catch (error) {
        return { ...state, message: error.message };
    }
}

function translationCancelled() {
    return Object.assign(Error('翻译已取消，检查点已保留，可稍后续跑。'), { code: 'translation_cancelled' });
}

export function mdtxProgress(text) {
    const counts = /Translating bundles:.*?\b(\d+)\/(\d+)\b/u.exec(text);
    if (counts && +counts[2] > 0 && +counts[1] <= +counts[2]) return { stage: '翻译与逐包审校', completed: +counts[1], total: +counts[2] };
    if (/Brief map-reduce|LLM start: brief/u.test(text)) return { stage: '分析全文与准备术语' };
    if (/Pipeline|Job start/u.test(text)) return { stage: '解析原文与安排分包' };
    return null;
}

async function translateMarkdown(work, plan, settings, zoteroApiKeyEnv, progress, { signal, allowModel, beforeModel }) {
    if (!settings?.executable || !path.isAbsolute(settings.configPath ?? '')) throw Error('请在文献工作流中填写 mdtx 命令与配置绝对路径');
    const configuration = await readFile(settings.configPath);
    const invocationHash = sha256(JSON.stringify(['roles-v1', settings.executable, settings.configPath, sha256(configuration), sha256(plan.text)]));
    const cache = path.join(work, invocationHash);
    await mkdir(cache, { mode: 0o700, recursive: true });
    const source = path.join(cache, 'source.md');
    const result = path.join(cache, 'source.zh.md');
    const validationPath = path.join(cache, 'verified.sha256');
    const [cached, verified] = await Promise.all([optionalFile(result), optionalFile(validationPath)]);
    if (cached && verified?.trim() === sha256(cached)) return { text: cached, invocationHash, sha256: verified.trim() };

    await writeFile(source, plan.text + '\n', { mode: 0o600 });
    // mdtx 按输入相对 cwd 的路径决定输出子目录；cwd 是主目录时译文落在嵌套路径。
    const [home, realSource] = await Promise.all([realpath(os.homedir()), realpath(source)]);
    const rel = path.relative(home, realSource);
    const nested = rel && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
    const mdtxResult = nested ? path.join(cache, path.dirname(rel), 'source.zh.md') : path.join(cache, 'source.zh.md');
    // 同一 invocationHash 下已完成的 mdtx 产物直接复用，避免重复付费翻译。
    let haveMdtxOutput = false;
    try {
        const [priorText, priorReport] = await Promise.all([optionalFile(mdtxResult), optionalFile(mdtxResult + '.report.json')]);
        if (priorText && priorReport) {
            const report = JSON.parse(priorReport);
            haveMdtxOutput = report?.validation_passed === true && await realpath(report.input_path) === realSource;
        }
    } catch { /* 复用检查失败则正常调用 mdtx。 */ }
    if (!haveMdtxOutput) {
        if (!allowModel) throw Error('未获准调用模型；请重新检查已有译文和缓存后确认翻译');
        await beforeModel();
        signal?.throwIfAborted();
        const env = { ...process.env };
        if (zoteroApiKeyEnv) delete env[zoteroApiKeyEnv];
        try {
            // cwd 用主目录：mdtx 配置里的 .mdtx/*.sqlite3 相对路径与桌面端、配置桥接一致。
            const task = run(settings.executable, ['--config', settings.configPath, '--to', 'zh', '--output', cache, '--resume', source],
                { cwd: os.homedir(), timeout: 60 * 60_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, env, signal });
            const exited = new Promise(resolve => task.child.once('close', resolve));
            let pending = '';
            const consume = chunk => {
                pending += chunk;
                const lines = pending.split(/[\r\n]/u);
                pending = lines.pop().slice(-2000);
                for (const line of lines) { const event = mdtxProgress(line); if (event) progress(event); }
            };
            task.child.stderr.setEncoding('utf8').on('data', consume);
            task.child.stdout.setEncoding('utf8').on('data', consume);
            try { await task; }
            catch (error) {
                if (signal?.aborted) {
                    const forceStop = setTimeout(() => task.child.kill('SIGKILL'), 3000);
                    try { await exited; } finally { clearTimeout(forceStop); }
                    throw translationCancelled();
                }
                throw error;
            }
            const last = mdtxProgress(pending); if (last) progress(last);
        } catch (error) {
            if (signal?.aborted || error.code === 'translation_cancelled') throw translationCancelled();
            throw Error('mdtx 翻译未完成。请检查本机命令、配置及密钥环境，修复后重试可续跑。');
        }
    }
    const [translated, reportRaw] = await Promise.all([optionalFile(mdtxResult), optionalFile(mdtxResult + '.report.json')]);
    if (!translated || !reportRaw) throw Error('未在 mdtx 输出目录找到 source.zh.md 及校验报告');
    if (JSON.parse(reportRaw).validation_passed !== true || !translated.trim() || translated.trim() === plan.text) throw Error('mdtx 译文未通过结构校验');
    if (sha256(await readFile(settings.configPath)) !== sha256(configuration)) throw Error('mdtx 配置在翻译期间变化');
    progress({ stage: '校验译文并恢复参考文献原文' });
    const restored = plan.restore(translated);
    const translatedHash = sha256(restored);
    await writeFile(result, restored, { mode: 0o600 });
    await writeFile(validationPath, translatedHash + '\n', { mode: 0o600 });
    return { text: restored, invocationHash, sha256: translatedHash };
}

export async function translateLiterature(call, { documentId, notebook, avID, settings, zoteroApiKeyEnv,
    expectedSourceDigest, allowModel }, onProgress = () => {}, { signal } = {}) {
    let committing = false;
    const checkCancelled = () => { if (!committing && signal?.aborted) throw translationCancelled(); };
    const progress = event => onProgress({ cancellable: !committing, ...event });
    const beginCommit = () => { checkCancelled(); committing = true; progress({ stage: '归档与核验中，请等待安全完成' }); };
    checkCancelled();
    progress({ stage: '读取原文与文献角色标记' });
    if (!idPattern.test(documentId) || notebook && !idPattern.test(notebook) || avID && !idPattern.test(avID)) throw Error('文献正文、笔记本和 AV 标识无效');
    if ((await call('system', { action: 'bootstrap' })).writeSafety?.strictMode !== true) throw Error('译文归档需要启用严格写入');
    const { identity } = await call('document', { action: 'lookup', id: documentId, include: ['identity'] });
    if (identity?.id !== documentId || notebook && identity.notebook !== notebook) throw Error('原文不属于配置的笔记本');
    notebook = identity.notebook;
    if (avID) {
        const av = await call('av', { action: 'get', id: avID });
        const records = av.av?.keyValues?.find(column => column.key?.type === 'block')?.values ?? [];
        if (records.filter(cell => cell.block?.id === documentId).length !== 1) throw Error('当前文档不是指定 AV 的唯一全文记录');
    }
    const originalAttrs = await call('block', { action: 'get_attrs', id: documentId });
    if (originalAttrs[originalAttribute]) throw Error('请从规范原文发起翻译');
    const readOriginal = async () => paperMarkdown((await call('block', { action: 'get_kramdown', id: documentId })).kramdown);
    const source = await readTranslationSource(call, documentId);
    const original = source.original;
    if (!original) throw Error('没有读到论文原文');
    checkTranslationTables(source);
    if (expectedSourceDigest !== undefined && expectedSourceDigest !== source.digest) throw Error('原文在预检后变化，请重新检查后再翻译');
    checkCancelled();
    const sourceHash = sha256(original);
    const plan = prepareTranslation(source);
    progress({ stage: '已识别保留原文的内容块', preservedCount: plan.preservedCount });
    const title = '中文译文（机器翻译） ' + sourceHash.slice(0, 12) + ' ' + source.digest.slice(0, 8);
    const marker = '机器译文对应原文 SHA-256：' + sourceHash;
    const lookup = async () => {
        const linkedId = originalAttrs[translationAttribute];
        if (idPattern.test(linkedId ?? '')) {
            const attrs = await call('block', { action: 'get_attrs', id: linkedId });
            if (attrs[originalAttribute] === documentId && attrs[sourceHashAttribute] === sourceHash) return { status: 'resolved', id: linkedId };
        }
        return call('document', { action: 'lookup', notebook, parentID: documentId, segments: [title] });
    };
    const work = path.join(os.homedir(), '.siyuan-sisyphus', 'literature-translation', documentId, sourceHash);
    checkCancelled();
    await mkdir(work, { recursive: true, mode: 0o700 });
    const lockPath = path.join(work, 'translation.lock');
    const lock = await open(lockPath, 'wx', 0o600).catch(error => {
        if (error.code === 'EEXIST') throw Error('同一原文已有翻译任务或待对账记录：' + lockPath);
        throw error;
    });
    try {
        await lock.writeFile(String(process.pid) + '\n');
        const pendingPath = path.join(work, 'archive-requested');
        const pending = await optionalFile(pendingPath);
        const existing = await lookup();
        let translationId = existing.id, translated;
        if (existing.status === 'missing') {
            if (pending) throw Error('上次译文创建结果待对账，请先检查原文下的子文档：' + title);
            translated = await translateMarkdown(work, plan, settings, zoteroApiKeyEnv, progress, { signal,
                allowModel: expectedSourceDigest === undefined ? allowModel !== false : allowModel === true,
                beforeModel: async () => {
                    if (allowModel !== true) {
                        const children = await call('document', { action: 'get_child_docs', id: documentId });
                        if (originalAttrs[translationAttribute] || (children.value ?? []).some(child =>
                            String(child.name ?? '').startsWith('中文译文（机器翻译） '))) {
                            throw Error('发现旧版译文，当前无完整缓存；请先预检并明确确认重新调用模型');
                        }
                    }
                    checkCancelled();
                    if ((await readTranslationSource(call, documentId)).digest !== source.digest) throw Error('原文在模型调用前变化，请重新预检');
                } });
            checkCancelled();
            progress({ stage: '归档中文译文' });
            if ((await readTranslationSource(call, documentId)).digest !== source.digest) throw Error('翻译期间原文或内容角色已变化，请重新发起');
            const created = await writeLiteratureRecord(call, 'document', {
                action: 'create', notebook, parentID: documentId, title, icon: '1f4d6',
                markdown: marker + '\n\n' + normalizeTranslationArchiveMarkdown(translated.text),
            }, async () => {
                if ((await lookup()).status !== 'missing') throw Error('译文位置在预检期间变化');
                if ((await readTranslationSource(call, documentId)).digest !== source.digest) throw Error('原文在归档预检期间变化');
                checkCancelled();
                const intent = { title, invocationHash: translated.invocationHash, sha256: translated.sha256 };
                beginCommit();
                await writeFile(pendingPath, JSON.stringify(intent) + '\n', { mode: 0o600, flag: 'wx' });
            });
            translationId = created.id;
        } else if (existing.status !== 'resolved') {
            throw Error('译文位置不唯一或索引暂不可用');
        }
        if (!idPattern.test(translationId)) throw Error('未取得可回读的译文标识');
        const stored = await call('block', { action: 'get_kramdown', id: translationId });
        const storedMarkdown = paperMarkdown(stored.kramdown);
        if (!storedMarkdown.startsWith(marker + '\n') || evidenceText(storedMarkdown.slice(marker.length)).length < 20) {
            throw Error('同名译文的原文指纹不匹配或正文缺失');
        }
        if (pending) translated = { text: await verifiedPending(work, pending, title, plan) };
        const linked = await call('block', { action: 'get_attrs', id: translationId });
        if (translated) verifyTranslationBody(translated.text, storedMarkdown.slice(marker.length));
        else if (linked[originalAttribute] !== documentId || linked[sourceHashAttribute] !== sourceHash) {
            throw Error('发现同名译文，但没有已验证配对或待对账记录');
        }
        if (sha256(await readOriginal()) !== sourceHash) throw Error('原文已变化，暂缓配对译文');
        if (!committing) beginCommit();
        progress({ stage: '继承文献角色并回读验证' });
        const { inheritedRoleCount, pairedBlockCount } = await inheritTranslationRoles(call, source, translationId, marker, progress);
        if ((await readTranslationSource(call, documentId)).digest !== source.digest) throw Error('配对前原文或角色已变化');
        const current = await call('block', { action: 'get_attrs', id: documentId });
        if (current[translationAttribute] !== translationId || linked[originalAttribute] !== documentId || linked[sourceHashAttribute] !== sourceHash) {
            await writeLiteratureRecord(call, 'block', { action: 'set_attrs', items: [
                { id: documentId, attrs: { [translationAttribute]: translationId } },
                { id: translationId, attrs: { [originalAttribute]: documentId, [sourceHashAttribute]: sourceHash } },
            ] }, async () => {
                if ((await readTranslationSource(call, documentId)).digest !== source.digest) throw Error('配对期间原文或角色已变化');
            });
        }
        const pair = await Promise.all([documentId, translationId].map(id => call('block', { action: 'get_attrs', id })));
        if (pair[0][translationAttribute] !== translationId || pair[1][originalAttribute] !== documentId
            || pair[1][sourceHashAttribute] !== sourceHash) throw Error('原文和译文配对未通过回读');
        await unlink(pendingPath).catch(error => { if (error.code !== 'ENOENT') throw error; });
        progress({ stage: '译文归档与核验完成', done: true, preservedCount: plan.preservedCount });
        return { documentId, translationId, sourceHash, preservedCount: plan.preservedCount, inheritedRoleCount, pairedBlockCount, reused: existing.status === 'resolved' };
    } catch (error) {
        if (!committing && (signal?.aborted || error.code === 'translation_cancelled')) {
            progress({ stage: '翻译已取消，检查点已保留', cancellable: false, done: true });
            return { cancelled: true, documentId };
        }
        throw error;
    } finally {
        await lock.close();
        await unlink(lockPath);
    }
}

/** 为已归档译文补写逐块配对属性；原文在翻译后被修改时拒绝重建配对。 */
export async function pairLiteratureTranslation(call, { documentId }, progress = () => {}) {
    progress({ stage: '读取原文与文献角色标记' });
    if (!idPattern.test(documentId)) throw Error('文献正文标识无效');
    if ((await call('system', { action: 'bootstrap' })).writeSafety?.strictMode !== true) throw Error('译文配对需要启用严格写入');
    const attrs = await call('block', { action: 'get_attrs', id: documentId });
    const translationId = attrs[translationAttribute];
    if (!idPattern.test(translationId ?? '')) throw Error('当前论文还没有归档译文');
    const source = await readTranslationSource(call, documentId);
    const original = source.original;
    if (!original) throw Error('没有读到论文原文');
    const sourceHash = sha256(original);
    const marker = '机器译文对应原文 SHA-256：' + sourceHash;
    const linked = await call('block', { action: 'get_attrs', id: translationId });
    if (linked[originalAttribute] !== documentId) throw Error('原文与译文的配对已失效，请更新译文');
    if (linked[sourceHashAttribute] !== sourceHash) {
        throw Error('原文在翻译后已修改，请更新中文译文以重建配对');
    }
    progress({ stage: '写入逐块配对并回读验证' });
    const { inheritedRoleCount, pairedBlockCount } = await inheritTranslationRoles(call, source, translationId, marker, progress);
    if ((await readTranslationSource(call, documentId)).digest !== source.digest) throw Error('配对期间原文或角色已变化');
    progress({ stage: '逐块配对完成', done: true });
    return { documentId, translationId, sourceHash, inheritedRoleCount, pairedBlockCount };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const controller = new AbortController();
    let lines, finished = false, paper;
    try {
        let input = '';
        if (process.argv.includes('--interactive')) {
            lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
            input = await new Promise((resolve, reject) => {
                let received = false;
                lines.on('line', line => {
                    if (!received) { received = true; resolve(line); }
                    else if (line.trim() === 'cancel') controller.abort();
                });
                lines.on('close', () => {
                    if (!received) reject(Error('未收到翻译请求'));
                    else if (!finished) controller.abort();
                });
                lines.on('error', reject);
            });
        } else {
            for await (const chunk of process.stdin) input += chunk;
        }
        const { mcpSettings, ...request } = JSON.parse(input);
        paper = request;
        const call = await mcpConnection(mcpSettings);
        const progress = event => process.stderr.write('SISYPHUS_PROGRESS ' + JSON.stringify(event) + '\n');
        const result = process.argv.includes('--inspect')
            ? await inspectLiteratureTranslation(call, paper)
            : process.argv.includes('--pair')
                ? await pairLiteratureTranslation(call, paper, progress)
                : await translateLiterature(call, paper, progress, { signal: controller.signal });
        console.log(JSON.stringify(result));
    } catch (error) {
        if (error.code === 'translation_cancelled' && paper) console.log(JSON.stringify({ cancelled: true, documentId: paper.documentId }));
        else { console.error(error.message); process.exitCode = 1; }
    } finally {
        finished = true;
        lines?.close();
        if (lines) process.stdin.pause();
    }
}

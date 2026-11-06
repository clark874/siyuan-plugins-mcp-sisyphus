#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { writeLiteratureRecord } from './finalize-literature-ingest.mjs';
import { mcpConnection } from './tag-literature-roles.mjs';

const run = promisify(execFile);
const idPattern = /^\d{14}-[a-z0-9]{7}$/;
const originalAttribute = 'custom-literature-original-id';
const translationAttribute = 'custom-literature-translation-id';
const sourceHashAttribute = 'custom-literature-translation-source';
const sha256 = text => createHash('sha256').update(text).digest('hex');

function paperMarkdown(kramdown) {
    return String(kramdown ?? '').replace(/^[ \t]*\{:[^\n]*\}[ \t]*$/gm, '')
        .replace(/(^[ \t]*(?:[-+*]|\d+\.)[ \t]+)\{: id="\d{14}-[a-z0-9]{7}"[^\n]*?\}/gm, '$1')
        .replace(/^原始MD SHA-256：[a-f0-9]{64}\s*\n+/u, '').trim();
}

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

async function optionalFile(file) {
    try { return await readFile(file, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function translateMarkdown(work, original, settings, zoteroApiKeyEnv) {
    if (!settings?.executable || !path.isAbsolute(settings.configPath ?? '')) throw Error('请在文献工作流中填写 mdtx 命令与配置绝对路径');
    const configuration = await readFile(settings.configPath);
    const invocationHash = sha256(JSON.stringify([settings.executable, settings.configPath, sha256(configuration)]));
    const cache = path.join(work, invocationHash);
    await mkdir(cache, { mode: 0o700, recursive: true });
    const source = path.join(cache, 'source.md');
    const result = path.join(cache, 'source.zh.md');
    const validationPath = path.join(cache, 'verified.sha256');
    const [cached, verified] = await Promise.all([optionalFile(result), optionalFile(validationPath)]);
    if (cached && verified?.trim() === sha256(cached)) return { text: cached, invocationHash, sha256: verified.trim() };

    await writeFile(source, original + '\n', { mode: 0o600 });
    const env = { ...process.env };
    if (zoteroApiKeyEnv) delete env[zoteroApiKeyEnv];
    try {
        await run(settings.executable, ['--config', settings.configPath, '--to', 'zh', '--output', cache, '--resume', source],
            { cwd: cache, timeout: 60 * 60_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, env });
    } catch {
        throw Error('mdtx 翻译未完成。请检查本机命令、配置及密钥环境，修复后重试可续跑。');
    }
    const [translated, reportRaw] = await Promise.all([optionalFile(result), optionalFile(result + '.report.json')]);
    if (!translated || !reportRaw) throw Error('未找到译文或校验报告，请开启 mdtx 的 output.write_report 并保留默认命名');
    if (JSON.parse(reportRaw).validation_passed !== true || !translated.trim() || translated.trim() === original) throw Error('mdtx 译文未通过结构校验');
    if (sha256(await readFile(settings.configPath)) !== sha256(configuration)) throw Error('mdtx 配置在翻译期间变化');
    const translatedHash = sha256(translated);
    await writeFile(validationPath, translatedHash + '\n', { mode: 0o600 });
    return { text: translated, invocationHash, sha256: translatedHash };
}

export async function translateLiterature(call, { documentId, notebook, avID, settings, zoteroApiKeyEnv }) {
    if (![documentId, notebook, avID].every(id => idPattern.test(id))) throw Error('文献正文、笔记本和 AV 标识无效');
    if ((await call('system', { action: 'bootstrap' })).writeSafety?.strictMode !== true) throw Error('译文归档需要启用严格写入');
    const { identity } = await call('document', { action: 'lookup', id: documentId, include: ['identity'] });
    if (identity?.id !== documentId || identity.notebook !== notebook) throw Error('原文不属于配置的笔记本');
    const av = await call('av', { action: 'get', id: avID });
    const records = av.av?.keyValues?.find(column => column.key?.type === 'block')?.values ?? [];
    if (records.filter(cell => cell.block?.id === documentId).length !== 1) throw Error('当前文档不是指定 AV 的唯一全文记录');
    const originalAttrs = await call('block', { action: 'get_attrs', id: documentId });
    if (originalAttrs[originalAttribute]) throw Error('请从规范原文发起翻译');
    const readOriginal = async () => paperMarkdown((await call('block', { action: 'get_kramdown', id: documentId })).kramdown);
    const original = await readOriginal();
    if (!original) throw Error('没有读到论文原文');
    const sourceHash = sha256(original);
    const title = '中文译文（机器翻译） ' + sourceHash.slice(0, 12);
    const marker = '机器译文对应原文 SHA-256：' + sourceHash;
    const lookup = () => call('document', { action: 'lookup', notebook, parentID: documentId, segments: [title] });
    const work = path.join(os.homedir(), '.siyuan-sisyphus', 'literature-translation', documentId, sourceHash);
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
            translated = await translateMarkdown(work, original, settings, zoteroApiKeyEnv);
            if (sha256(await readOriginal()) !== sourceHash) throw Error('翻译期间原文已变化，请重新发起');
            const created = await writeLiteratureRecord(call, 'document', {
                action: 'create', notebook, parentID: documentId, title, icon: '1f4d6',
                markdown: marker + '\n\n' + translated.text,
            }, async () => {
                if ((await lookup()).status !== 'missing') throw Error('译文位置在预检期间变化');
                const intent = { title, invocationHash: translated.invocationHash, sha256: translated.sha256 };
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
        if (pending) {
            const intent = JSON.parse(pending);
            if (intent.title !== title || !/^[a-f0-9]{64}$/.test(intent.invocationHash ?? '')) throw Error('译文待对账记录无效');
            const text = await optionalFile(path.join(work, intent.invocationHash, 'source.zh.md'));
            if (!text || sha256(text) !== intent.sha256) throw Error('无法核对待归档译文的本机缓存');
            translated = { text };
        }
        const linked = await call('block', { action: 'get_attrs', id: translationId });
        if (translated) verifyTranslationBody(translated.text, storedMarkdown.slice(marker.length));
        else if (linked[originalAttribute] !== documentId || linked[sourceHashAttribute] !== sourceHash) {
            throw Error('发现同名译文，但没有已验证配对或待对账记录');
        }
        if (sha256(await readOriginal()) !== sourceHash) throw Error('原文已变化，暂缓配对译文');
        const current = await call('block', { action: 'get_attrs', id: documentId });
        if (current[translationAttribute] !== translationId || linked[originalAttribute] !== documentId || linked[sourceHashAttribute] !== sourceHash) {
            await writeLiteratureRecord(call, 'block', { action: 'set_attrs', items: [
                { id: documentId, attrs: { [translationAttribute]: translationId } },
                { id: translationId, attrs: { [originalAttribute]: documentId, [sourceHashAttribute]: sourceHash } },
            ] }, async () => {
                if (sha256(await readOriginal()) !== sourceHash) throw Error('配对期间原文已变化');
            });
        }
        const pair = await Promise.all([documentId, translationId].map(id => call('block', { action: 'get_attrs', id })));
        if (pair[0][translationAttribute] !== translationId || pair[1][originalAttribute] !== documentId
            || pair[1][sourceHashAttribute] !== sourceHash) throw Error('原文和译文配对未通过回读');
        await unlink(pendingPath).catch(error => { if (error.code !== 'ENOENT') throw error; });
        return { documentId, translationId, sourceHash, reused: existing.status === 'resolved' };
    } finally {
        await lock.close();
        await unlink(lockPath);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    try {
        let input = '';
        for await (const chunk of process.stdin) input += chunk;
        const { mcpSettings, ...paper } = JSON.parse(input);
        console.log(JSON.stringify(await translateLiterature(await mcpConnection(mcpSettings), paper)));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

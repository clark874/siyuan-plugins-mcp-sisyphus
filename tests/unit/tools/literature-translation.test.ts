import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const scripts = new URL('../../../agent-kit/scripts/', import.meta.url).href;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const id = '20261106150000-abcdefg';

describe('文献翻译沿用入库角色', () => {
    it('参考文献不进入模型正文，恢复后保持原样，并解析真实分包进度', async () => {
        const { prepareTranslation } = await import(scripts + 'translation-roles.mjs');
        const { mdtxProgress } = await import(scripts + 'translate-literature.mjs');
        const text = 'Smith, J. (2025). Original title. DOI: 10.1234/example';
        const source = 'Evidence body.\n\n' + text;
        const kramdown = source + '\n{: id="' + id + '"}\n';
        const plan = prepareTranslation({ original: source, kramdown,
            blocks: [{ id, type: 'p', role: 'references', markdown: text, marker: kramdown.indexOf('{:') }] });
        expect(plan.text).not.toContain(text);
        expect(plan.preservedCount).toBe(1);
        expect(plan.restore(plan.text.replace('Evidence body.', '正文证据。'))).toBe(source.replace('Evidence body.', '正文证据。'));
        expect(mdtxProgress('Translating bundles: 25%|██| 1/4 [00:03<00:09]')).toEqual({ stage: '翻译与逐包审校', completed: 1, total: 4 });
    });

    it('角色指纹过期时停止，不把旧角色用于新正文', async () => {
        const { readTranslationSource } = await import(scripts + 'translation-roles.mjs');
        const call = async (_tool: string, args: { action: string }) => args.action === 'get_kramdown'
            ? { kramdown: 'Changed text.\n{: id="' + id + '" custom-literature-role="references" custom-literature-role-sha256="' + sha('Old text.') + '"}' }
            : { data: [{ id, type: 'p', subtype: '', roleContent: 'Changed text.', blockMarkdown: 'Changed text.' }] };
        await expect(readTranslationSource(call, id)).rejects.toThrow('角色指纹已过期');
    });
});

const { literatureSourceMarkdown } = await import(scripts + 'literature-source.mjs');
const { pairAttribute, inheritTranslationRoles, readTranslationSource } = await import(scripts + 'translation-roles.mjs');
const { pairLiteratureTranslation, translateLiterature, inspectLiteratureTranslation } = await import(scripts + 'translate-literature.mjs');

const SRC = '20261101000000-aaaaaaa';
const TR = '20261101000001-bbbbbbb';
const SB = ['20261101000002-ccccccc', '20261101000003-ddddddd', '20261101000004-eeeeeee', '20261101000005-fffffff'];
const TB = ['20261101000006-ggggggg', '20261101000007-hhhhhhh', '20261101000008-iiiiiii', '20261101000009-jjjjjjj'];
const T_MARKER = '20261101000010-kkkkkkk';

function markerLine(blockId: string, attrs: Record<string, string> = {}) {
    const pairs = [`id="${blockId}"`, ...Object.entries(attrs).map(([k, v]) => `${k}="${v}"`)];
    return `{: ${pairs.join(' ')} }`;
}

/** 内存版思源文档库：kramdown 属性标记与 set_attrs 回写保持一致。 */
function makeDocStore() {
    const docs = new Map<string, { kramdown: string; attrs: Record<string, string>; blocks: Map<string, { id: string; type: string; subtype: string; content: string; markdown: string }> }>();
    const owners = new Map<string, string>();
    const writes: Array<Array<{ id: string; attrs: Record<string, string> }>> = [];
    let seq = 0;

    function addDoc(docId: string, kramdown: string, attrs: Record<string, string>, blocks: Array<{ id: string; type: string; subtype: string; content: string; markdown: string }>) {
        docs.set(docId, { kramdown, attrs: { ...attrs }, blocks: new Map(blocks.map(b => [b.id, b])) });
        for (const block of blocks) owners.set(block.id, docId);
    }

    function applyAttrs(targetId: string, attrs: Record<string, string>) {
        const docId = owners.get(targetId) ?? targetId;
        const doc = docs.get(docId);
        if (!doc) throw Error('unknown doc ' + docId);
        Object.assign(doc.attrs, attrs);
        doc.kramdown = doc.kramdown.replace(/\{:[^\n]*\}/g, marker => {
            const idMatch = /\bid="([^"]+)"/.exec(marker);
            if (!idMatch || idMatch[1] !== targetId) return marker;
            const pairs: Record<string, string> = {};
            for (const m of marker.matchAll(/([^\s=]+)="((?:\\.|[^"\\])*)"/g)) pairs[m[1]] = m[2];
            Object.assign(pairs, attrs);
            const { id, ...rest } = pairs;
            return `{: id="${id}" ${Object.entries(rest).map(([k, v]) => `${k}="${v}"`).join(' ')} }`;
        });
    }

    const call = async (tool: string, args: any): Promise<any> => {
        if (tool === 'system' && args.action === 'bootstrap') return { writeSafety: { strictMode: true } };
        if (tool === 'block' && args.action === 'get_kramdown') return { kramdown: docs.get(args.id)?.kramdown ?? '' };
        if (tool === 'block' && args.action === 'get_attrs') return { ...(docs.get(args.id)?.attrs ?? {}) };
        if (tool === 'block' && args.action === 'set_attrs') {
            if (args.validateOnly) return { issuedRequestId: `req-${++seq}` };
            writes.push(args.items);
            for (const item of args.items) applyAttrs(item.id, item.attrs);
            return {};
        }
        if (tool === 'search' && args.action === 'query_sql') {
            const m = /root_id='([^']+)'/.exec(args.stmt);
            const doc = docs.get(m?.[1] ?? '');
            return { data: doc ? [...doc.blocks.values()].map(b => ({ id: b.id, type: b.type, subtype: b.subtype, roleContent: b.content, blockMarkdown: b.markdown })) : [] };
        }
        throw Error(`unexpected call ${tool}.${args.action}`);
    };
    return { docs, call, writes, addDoc };
}

function sourceFixture() {
    const contents = ['原文标题', '正文第一段。', '小节标题', '参考文献条目。'];
    const types: Array<[string, string]> = [['h', 'h1'], ['p', ''], ['h', 'h2'], ['p', '']];
    const roles = ['body', 'body', 'body', 'references'];
    const lines: string[] = [];
    const blocks = SB.map((bid, i) => {
        const [type, subtype] = types[i];
        const roleAttrs = { 'custom-literature-role': roles[i], 'custom-literature-role-sha256': sha(contents[i]) };
        const text = i === 0 ? '# 原文标题' : i === 2 ? '## 小节标题' : contents[i];
        lines.push(`${text}\n${markerLine(bid, roleAttrs)}\n`);
        return { id: bid, type, subtype, content: contents[i], markdown: text };
    });
    return { kramdown: lines.join('\n'), blocks };
}

function translationFixture(sourceHash: string, paired = false) {
    const marker = '机器译文对应原文 SHA-256：' + sourceHash;
    const contents = [marker, '译文标题', '译文第一段。', '小节译文', '参考文献译文。'];
    const types: Array<[string, string]> = [['p', ''], ['h', 'h1'], ['p', ''], ['h', 'h2'], ['p', '']];
    const lines: string[] = [`${marker}\n${markerLine(T_MARKER)}\n`];
    const blocks = TB.map((bid, i) => {
        const [type, subtype] = types[i + 1];
        const text = i === 0 ? '# 译文标题' : i === 2 ? '## 小节译文' : contents[i + 1];
        const attrs = paired ? { [pairAttribute]: SB[i] } : {};
        lines.push(`${text}\n${markerLine(bid, attrs)}\n`);
        return { id: bid, type, subtype, content: contents[i + 1], markdown: text };
    });
    blocks.unshift({ id: T_MARKER, type: 'p', subtype: '', content: marker, markdown: marker });
    return { kramdown: lines.join('\n'), blocks };
}

function setupPairedStore() {
    const store = makeDocStore();
    const src = sourceFixture();
    const sourceHash = sha(literatureSourceMarkdown(src.kramdown));
    const tr = translationFixture(sourceHash);
    store.addDoc(SRC, src.kramdown, { 'custom-literature-translation-id': TR }, src.blocks);
    store.addDoc(TR, tr.kramdown, {
        'custom-literature-original-id': SRC,
        'custom-literature-translation-source': sourceHash,
    }, tr.blocks);
    return { store, sourceHash };
}

describe('译文逐块配对属性', () => {
    it('写入配对属性并回读验证，重复执行幂等', async () => {
        const { store } = setupPairedStore();
        const source = await readTranslationSource(store.call, SRC);
        const marker = '机器译文对应原文 SHA-256：' + sha(source.original);
        const first = await inheritTranslationRoles(store.call, source, TR, marker);
        expect(first.pairedBlockCount).toBe(4);
        expect(first.inheritedRoleCount).toBeGreaterThan(0);
        expect(store.writes.length).toBe(1);
        const written = store.writes[0];
        expect(written).toHaveLength(5); // 4 个正文块 + 1 个标记块角色
        for (let i = 0; i < 4; i++) {
            const item = written.find(entry => entry.id === TB[i]);
            expect(item?.attrs[pairAttribute]).toBe(SB[i]);
        }
        // 回读：译文块 kramdown 标记里已持久化配对属性
        const verified = await readTranslationSource(store.call, TR);
        expect(verified.blocks.filter(b => b.content !== marker).map(b => b.pairedSource)).toEqual(SB);
        // 幂等：再次执行不再写入
        const second = await inheritTranslationRoles(store.call, source, TR, marker);
        expect(second.pairedBlockCount).toBe(4);
        expect(store.writes.length).toBe(1);
    });

    it('块结构不一致时拒绝配对', async () => {
        const { store, sourceHash } = setupPairedStore();
        // 删除译文一个块，破坏与原文的严格对齐
        const tr = store.docs.get(TR)!;
        tr.blocks.delete(TB[3]);
        tr.kramdown = tr.kramdown.replace(new RegExp('[^\\n]*\\n' + markerLine(TB[3]).replace(/[{}["]+/g, '\\$&') + '\\n?'), '');
        const source = await readTranslationSource(store.call, SRC);
        const marker = '机器译文对应原文 SHA-256：' + sha(source.original);
        await expect(inheritTranslationRoles(store.call, source, TR, marker)).rejects.toThrow('块结构不一致');
        expect(sourceHash).toBeTruthy();
    });

    it('新建译文索引收敛期间不误报文档已变化', async () => {
        const { store } = setupPairedStore();
        const source = await readTranslationSource(store.call, SRC);
        const marker = '机器译文对应原文 SHA-256：' + sha(source.original);
        // 思源为新建文档分批落索引：译文 SQL 首次读到未定稿正文，之后稳定。
        const real = store.docs.get(TR)!.blocks.get(TB[0])!.content;
        let drifted = true;
        const call = async (tool: string, args: any): Promise<any> => {
            const result = await store.call(tool, args);
            if (drifted && tool === 'search' && args.action === 'query_sql' && args.stmt.includes(`root_id='${TR}'`)) {
                drifted = false;
                return { ...result, data: result.data.map((row: any) => row.id === TB[0] ? { ...row, roleContent: real + '…' } : row) };
            }
            return result;
        };
        const outcome = await inheritTranslationRoles(call, source, TR, marker);
        expect(outcome.pairedBlockCount).toBe(4);
        expect(outcome.inheritedRoleCount).toBeGreaterThan(0);
    });

    it('写入预检期间译文真实变化仍报文档已变化', async () => {
        const { store } = setupPairedStore();
        const source = await readTranslationSource(store.call, SRC);
        const marker = '机器译文对应原文 SHA-256：' + sha(source.original);
        let flipped = false;
        const call = async (tool: string, args: any): Promise<any> => {
            if (!flipped && tool === 'block' && args.action === 'set_attrs' && args.validateOnly) {
                flipped = true;
                store.docs.get(TR)!.blocks.get(TB[0])!.content = '外部改动的译文标题';
            }
            return store.call(tool, args);
        };
        await expect(inheritTranslationRoles(call, source, TR, marker)).rejects.toThrow('文档已变化');
    });

    it('超过百块时按批次上报块级配对进度', async () => {
        const store = makeDocStore();
        const count = 105;
        const srcIds = Array.from({ length: count }, (_, i) => `20261102000000-${String(i + 1).padStart(7, '0')}`);
        const trIds = Array.from({ length: count }, (_, i) => `20261102010000-${String(i + 1).padStart(7, '0')}`);
        const markerBlockId = '20261102020000-0000001';
        const srcLines: string[] = [];
        const srcBlocks = srcIds.map((bid, i) => {
            const text = `原文段落 ${i + 1}`;
            srcLines.push(`${text}\n${markerLine(bid)}\n`);
            return { id: bid, type: 'p', subtype: '', content: text, markdown: text };
        });
        store.addDoc(SRC, srcLines.join('\n'), {}, srcBlocks);
        const source = await readTranslationSource(store.call, SRC);
        const marker = '机器译文对应原文 SHA-256：' + sha(source.original);
        const trLines: string[] = [`${marker}\n${markerLine(markerBlockId)}\n`];
        const trBlocks = trIds.map((bid, i) => {
            const text = `译文段落 ${i + 1}`;
            trLines.push(`${text}\n${markerLine(bid)}\n`);
            return { id: bid, type: 'p', subtype: '', content: text, markdown: text };
        });
        trBlocks.unshift({ id: markerBlockId, type: 'p', subtype: '', content: marker, markdown: marker });
        store.addDoc(TR, trLines.join('\n'), {}, trBlocks);
        const events: Array<Record<string, any>> = [];
        const outcome = await inheritTranslationRoles(store.call, source, TR, marker, event => events.push(event));
        expect(outcome.pairedBlockCount).toBe(count);
        // 105 个配对块 + 1 个标记块角色 = 106 项，分两批写入
        expect(store.writes.length).toBe(2);
        expect(store.writes[0]).toHaveLength(100);
        expect(store.writes[1]).toHaveLength(6);
        const blockEvents = events.filter(event => event.unit === '块');
        expect(blockEvents.map(event => event.completed)).toEqual([0, 100, count + 1]);
        expect(blockEvents.every(event => event.stage === '写入逐块配对' && event.total === count + 1)).toBe(true);
        expect(events.at(-1)?.stage).toBe('回读核验配对');
    });
});

describe('translate-literature --pair 模式', () => {
    it('原文没有归档译文属性时报错', async () => {
        const store = makeDocStore();
        const src = sourceFixture();
        store.addDoc(SRC, src.kramdown, {}, src.blocks);
        await expect(pairLiteratureTranslation(store.call, { documentId: SRC })).rejects.toThrow('还没有归档译文');
    });

    it('原文在翻译后被修改时报错，不重建配对', async () => {
        const { store } = setupPairedStore();
        store.docs.get(TR)!.attrs['custom-literature-translation-source'] = '0'.repeat(64);
        await expect(pairLiteratureTranslation(store.call, { documentId: SRC })).rejects.toThrow('原文在翻译后已修改');
    });

    it('译文原文指纹不匹配时报错', async () => {
        const { store } = setupPairedStore();
        store.docs.get(TR)!.attrs['custom-literature-original-id'] = '20261101000099-zzzzzzz';
        await expect(pairLiteratureTranslation(store.call, { documentId: SRC })).rejects.toThrow('配对已失效');
    });

    it('成功为已归档译文补写配对并回读', async () => {
        const store = makeDocStore();
        const src = sourceFixture();
        const sourceHash = sha(literatureSourceMarkdown(src.kramdown));
        const tr = translationFixture(sourceHash);
        store.addDoc(SRC, src.kramdown, { 'custom-literature-translation-id': TR }, src.blocks);
        store.addDoc(TR, tr.kramdown, {
            'custom-literature-original-id': SRC,
            'custom-literature-translation-source': sourceHash,
        }, tr.blocks);
        const result = await pairLiteratureTranslation(store.call, { documentId: SRC });
        expect(result.translationId).toBe(TR);
        expect(result.pairedBlockCount).toBe(4);
        const verified = await readTranslationSource(store.call, TR);
        expect(verified.blocks.filter(b => b.content !== '机器译文对应原文 SHA-256：' + sourceHash).map(b => b.pairedSource)).toEqual(SB);
    });
});

const FAKE_MDTX = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const input = opt('--resume');
const output = opt('--output');
const text = fs.readFileSync(input, 'utf8');
const translated = text.split('\\n').map(line => {
    if (!line.trim()) return line;
    if (line.includes('SISYPHUS_KEEP_')) return '译文 ' + line;
    const heading = /^(#+\\s*)(.*)$/.exec(line);
    if (heading) return heading[1] + '译文' + heading[2];
    return '译文' + line;
}).join('\\n');
let outDir = output;
try {
    const rel = path.relative(process.cwd(), fs.realpathSync(input));
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) outDir = path.join(output, path.dirname(rel));
} catch {}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'source.zh.md'), translated);
fs.writeFileSync(path.join(outDir, 'source.zh.md.report.json'), JSON.stringify({
    validation_passed: process.env.MDTX_REPORT_PASS !== 'false',
    input_path: fs.realpathSync(input),
}));
if (process.env.MDTX_INVOCATIONS) fs.appendFileSync(process.env.MDTX_INVOCATIONS, input + '\\n');
`;

async function setupTranslateEnv() {
    const home = await mkdtemp(path.join(os.tmpdir(), 'lit-home-'));
    const dir = await mkdtemp(path.join(os.tmpdir(), 'lit-mdtx-'));
    const fakePath = path.join(dir, 'fake-mdtx');
    await writeFile(fakePath, FAKE_MDTX);
    await chmod(fakePath, 0o755);
    const configPath = path.join(dir, 'config.yaml');
    await writeFile(configPath, 'provider:\n  base_url: http://127.0.0.1:1/v1\n  model: fake-model\n');
    return { home, dir, fakePath, configPath, invocations: path.join(dir, 'invocations.log') };
}

function patchTranslateEnv(env: { home: string; invocations: string }, reportPass: string | null) {
    const saved: Record<string, string | undefined> = {};
    for (const key of ['HOME', 'MDTX_INVOCATIONS', 'MDTX_REPORT_PASS']) saved[key] = process.env[key];
    process.env.HOME = env.home;
    process.env.MDTX_INVOCATIONS = env.invocations;
    if (reportPass === null) delete process.env.MDTX_REPORT_PASS;
    else process.env.MDTX_REPORT_PASS = reportPass;
    return () => {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    };
}

/** 模拟思源把译文 markdown 解析成带 {: id=} 标记的块，供 readTranslationSource 回读。 */
function materializeTranslation(markdown: string) {
    const segments = markdown.split(/\n\n+/u).map(segment => segment.trim()).filter(Boolean);
    const lines: string[] = [];
    const blocks: Array<{ id: string; type: string; subtype: string; content: string; markdown: string }> = [];
    segments.forEach((segment, index) => {
        const bid = `20261103000000-${String(index + 1).padStart(7, '0')}`;
        const heading = /^(#{1,6})\s+(.+)$/u.exec(segment);
        const type = heading ? 'h' : 'p';
        const subtype = heading ? `h${heading[1].length}` : '';
        const content = heading ? heading[2].trim() : segment;
        lines.push(`${segment}\n${markerLine(bid)}\n`);
        blocks.push({ id: bid, type, subtype, content, markdown: segment });
    });
    return { kramdown: lines.join('\n'), blocks };
}

function documentAwareCall(store: ReturnType<typeof makeDocStore>, translationId: string,
    options: { failCreateValidate?: () => boolean } = {}) {
    const NB = '20261105140902-d0jcxt7';
    let seq = 0;
    return async (tool: string, args: any): Promise<any> => {
        if (tool === 'document' && args.action === 'get_child_docs') return { value: [] };
        if (tool === 'document' && args.action === 'lookup') {
            if (args.include?.includes('identity')) return { identity: { id: args.id, notebook: NB } };
            return { status: 'missing' };
        }
        if (tool === 'document' && args.action === 'create') {
            if (args.validateOnly) {
                if (options.failCreateValidate?.()) throw Error('模拟译文创建预检失败');
                return { issuedRequestId: `req-doc-${++seq}` };
            }
            const materialized = materializeTranslation(String(args.markdown ?? ''));
            store.addDoc(translationId, materialized.kramdown, {}, materialized.blocks);
            return { id: translationId };
        }
        return store.call(tool, args);
    };
}

async function findFiles(root: string, name: string): Promise<string[]> {
    const found: string[] = [];
    for (const entry of await readdir(root, { withFileTypes: true })) {
        const entryPath = path.join(root, entry.name);
        if (entry.isDirectory()) found.push(...await findFiles(entryPath, name));
        else if (entry.name === name) found.push(entryPath);
    }
    return found;
}

const TRID = '20261101000020-mmmmmmm';

describe('translate-literature mdtx 输出定位与产物复用', () => {
    it('预检识别有效既有译文，不写入或调用模型', async () => {
        const { store } = setupPairedStore();
        const source = await readTranslationSource(store.call, SRC);
        await inheritTranslationRoles(store.call, source, TR, '机器译文对应原文 SHA-256：' + sha(source.original));
        const priorWrites = store.writes.length;
        const inspected = await inspectLiteratureTranslation(documentAwareCall(store, TR), { documentId: SRC });
        expect(inspected).toMatchObject({ status: 'ready', willInvokeModel: false, translationId: TR, sourceDigest: source.digest });
        expect(store.writes).toHaveLength(priorWrites);
    });

    it('模型运行中取消后终止子进程、保留检查点并清理锁，预检可续跑', async () => {
        const env = await setupTranslateEnv();
        const restore = patchTranslateEnv(env, null);
        const home = vi.spyOn(os, 'homedir').mockReturnValue(env.home);
        try {
            await writeFile(env.fakePath, `#!/usr/bin/env node
const fs = require('fs'), path = require('path');
const output = process.argv[process.argv.indexOf('--output') + 1];
fs.mkdirSync(path.join(output, '.mdtx-state'), { recursive: true });
fs.writeFileSync(path.join(output, '.mdtx-state', 'saved.json'), JSON.stringify({ fingerprint: 'saved', bundles: {} }));
console.log('Pipeline started');
setInterval(() => {}, 1000);
`);
            const store = makeDocStore(), source = sourceFixture();
            store.addDoc(SRC, source.kramdown, {}, source.blocks);
            const call = documentAwareCall(store, TRID);
            const settings = { executable: env.fakePath, configPath: env.configPath };
            const current = await readTranslationSource(call, SRC);
            const controller = new AbortController();
            const result = await translateLiterature(call, { documentId: SRC, settings,
                expectedSourceDigest: current.digest, allowModel: true }, event => {
                if (event.stage === '解析原文与安排分包') controller.abort();
            }, { signal: controller.signal });
            expect(result).toEqual({ cancelled: true, documentId: SRC });
            expect(store.docs.has(TRID)).toBe(false);
            expect(await findFiles(env.home, 'translation.lock')).toHaveLength(0);
            expect(await findFiles(env.home, 'saved.json')).toHaveLength(1);
            expect(await inspectLiteratureTranslation(call, { documentId: SRC, settings }))
                .toMatchObject({ status: 'resumable', willInvokeModel: true });
            expect(store.docs.get(SRC)?.kramdown).toBe(source.kramdown);
        } finally {
            home.mockRestore();
            restore();
            await rm(env.home, { recursive: true, force: true });
            await rm(env.dir, { recursive: true, force: true });
        }
    });

    it('归档时合并全角缩进 HTML 表格中的空行，保留表值、正文分隔和代码示例', async () => {
        const { normalizeTranslationArchiveMarkdown } = await import(scripts + 'translate-literature.mjs');
        const table = '　　<table><tr><td>24.83\n\n[22.47, 27.18]</td><td><0.001</td></tr></table>';
        const code = '```html\n' + table + '\n```';
        const preamble = '<table><tr><td>未闭合表格\n\n### 下一节\n\n表题\n\n';
        const markdown = preamble + table + '\n\n' + code + '\n\n表注';
        expect(normalizeTranslationArchiveMarkdown(markdown)).toBe(
            preamble + table.replace('\n\n', ' ') + '\n\n' + code + '\n\n表注',
        );
    });

    it('mdtx 输出落在 cwd 相对嵌套路径时仍能找到并归档译文', async () => {
        const env = await setupTranslateEnv();
        const restore = patchTranslateEnv(env, null);
        try {
            const store = makeDocStore();
            const src = sourceFixture();
            store.addDoc(SRC, src.kramdown, {}, src.blocks);
            const call = documentAwareCall(store, TRID);
            const settings = { executable: env.fakePath, configPath: env.configPath };
            const result = await translateLiterature(call, { documentId: SRC, settings });
            expect(result.translationId).toBe(TRID);
            expect(result.pairedBlockCount).toBe(4);
            expect(result.reused).toBe(false);
            expect(store.docs.has(TRID)).toBe(true);
            const invocations = (await readFile(env.invocations, 'utf8')).split('\n').filter(Boolean);
            expect(invocations).toHaveLength(1);
        } finally {
            restore();
            await rm(env.home, { recursive: true, force: true });
            await rm(env.dir, { recursive: true, force: true });
        }
    });

    it('同一调用缓存里已完成的 mdtx 产物直接复用，不重复调用', async () => {
        const env = await setupTranslateEnv();
        const restore = patchTranslateEnv(env, null);
        try {
            const store = makeDocStore();
            const src = sourceFixture();
            store.addDoc(SRC, src.kramdown, {}, src.blocks);
            let createAttempts = 0;
            const call = documentAwareCall(store, TRID, { failCreateValidate: () => ++createAttempts === 1 });
            const settings = { executable: env.fakePath, configPath: env.configPath };
            // 第一次：mdtx 完成但译文创建预检失败，缓存保留嵌套产物与已归档结果
            await expect(translateLiterature(call, { documentId: SRC, settings })).rejects.toThrow('模拟译文创建预检失败');
            // 删掉已归档结果与校验指纹，迫使下次进入 mdtx 产物复用分支而非快速路径
            for (const verified of await findFiles(env.home, 'verified.sha256')) {
                await rm(verified);
                await rm(path.join(path.dirname(verified), 'source.zh.md'));
            }
            const result = await translateLiterature(call, { documentId: SRC, settings });
            expect(result.translationId).toBe(TRID);
            expect(result.reused).toBe(false);
            const invocations = (await readFile(env.invocations, 'utf8')).split('\n').filter(Boolean);
            expect(invocations).toHaveLength(1);
        } finally {
            restore();
            await rm(env.home, { recursive: true, force: true });
            await rm(env.dir, { recursive: true, force: true });
        }
    });

    it('缓存中的校验未通过报告不复用，重新调用 mdtx', async () => {
        const env = await setupTranslateEnv();
        const restore = patchTranslateEnv(env, 'false');
        try {
            const store = makeDocStore();
            const src = sourceFixture();
            store.addDoc(SRC, src.kramdown, {}, src.blocks);
            const call = documentAwareCall(store, TRID);
            const settings = { executable: env.fakePath, configPath: env.configPath };
            await expect(translateLiterature(call, { documentId: SRC, settings })).rejects.toThrow('未通过结构校验');
            delete process.env.MDTX_REPORT_PASS;
            const result = await translateLiterature(call, { documentId: SRC, settings });
            expect(result.translationId).toBe(TRID);
            const invocations = (await readFile(env.invocations, 'utf8')).split('\n').filter(Boolean);
            expect(invocations).toHaveLength(2);
        } finally {
            restore();
            await rm(env.home, { recursive: true, force: true });
            await rm(env.dir, { recursive: true, force: true });
        }
    });
});

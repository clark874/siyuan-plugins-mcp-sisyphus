import { describe, expect, it, vi } from 'vitest';
import type { SiYuanClient } from '../../../src/api/client';
import type { PermissionManager } from '../../../src/core/permissions';
import { handleKnowledgeFsWrite, readKnowledgeFsWriteState } from '../../../src/tools/fs/knowledge-write';

const DOC = '20261121123000-aaac123';
const NOTEBOOK = '20261121123000-aaac124';
const PATH = '/研究/目录';
const READ = '/api/block/getChildBlocks';
const APPEND = '/api/block/appendBlock';

function fixture(writable = true) {
    const children = new Map<string, { id: string; type: string; markdown: string }>();
    const attributes = new Map<string, Record<string, string>>();
    const read = vi.fn(async (endpoint: string, value: Record<string, any> = {}) => {
        switch (endpoint) {
            case '/api/notebook/lsNotebooks': return { notebooks: [{ id: NOTEBOOK, name: '研究' }] };
            case '/api/filetree/getIDsByHPath': return [DOC];
            case '/api/filetree/getPathByID': return { notebook: NOTEBOOK, path: '/' + DOC + '.sy' };
            case '/api/filetree/getHPathByID': return '/目录';
            case '/api/query/sql': return [];
            case '/api/attr/batchGetBlockAttrs':
                return Object.fromEntries(value.ids.map((id: string) => [id, attributes.get(id)]));
            case '/api/lute/md2html':
                return { html: value.markdown.split('\n\n').map((item: string) => {
                    const [text, ial = ''] = item.split('\n');
                    const tag = text.startsWith('# ') ? 'h1' : 'p';
                    return `<${tag} ${ial.slice(3, -2)}>${text}</${tag}>`;
                }).join('\n') };
            case READ: return [...children.values()];
            default: throw new Error('未预期的读取路径 ' + endpoint);
        }
    });
    const write = vi.fn(async (endpoint: string, value: Record<string, any>) => {
        expect(endpoint).toBe(APPEND);
        expect(value.parentID).toBe(DOC);
        for (const input of value.data.split('\n\n')) {
            const [markdown, ial] = input.split('\n');
            const attrs = Object.fromEntries([...ial.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => match.slice(1)));
            children.set(attrs.id, { id: attrs.id, type: 'p', markdown });
            attributes.set(attrs.id, attrs);
        }
    });
    const client = { requestRead: read, requestWrite: write } as unknown as SiYuanClient;
    const permMgr = {
        reload: vi.fn(), getAll: () => ({}), canRead: () => true, canWrite: () => writable,
    } as unknown as PermissionManager;
    return { client, permMgr, read, write, children, attributes };
}

const atom = (name: string, markdown = '证据对应原始资料。') => ({ markdown, attrs: { name, 'custom-atom-type': 'evidence' } });
const payload = (result: Awaited<ReturnType<typeof handleKnowledgeFsWrite>>) => JSON.parse((result.content[0] as { text: string }).text);

describe('知识原子批量追加', () => {
    it('单次提交正文和属性，按稳定块 ID 对账并续写缺少的一项', async () => {
        const env = fixture();
        const rawArgs = { action: 'write_atoms', path: PATH, batchId: '首轮',
            atoms: [{ ...atom('first'), itemKey: 'a' }, { ...atom('second'), itemKey: 'b' }] };
        const before = await readKnowledgeFsWriteState(env.client, env.permMgr, rawArgs);
        expect(before.summary.plannedIds).toHaveLength(2);
        expect(env.write).not.toHaveBeenCalled();
        const first = payload(await handleKnowledgeFsWrite({ ...env, rawArgs }));
        expect(first.ids).toEqual(before.summary.plannedIds);
        expect(first.rolledBack).toBe(false);
        expect(env.write).toHaveBeenCalledTimes(1);
        expect(env.attributes.get(first.ids[0])?.['custom-verification-status']).toBe('draft');
        env.children.delete(first.ids[1]);
        env.attributes.delete(first.ids[1]);
        const reordered = { ...rawArgs, atoms: [...rawArgs.atoms].reverse() };
        const resume = await readKnowledgeFsWriteState(env.client, env.permMgr, reordered);
        expect(resume.summary.plannedIds).toEqual([first.ids[1]]);
        expect(resume.summary.identityBasis).toBe('itemKey');
        expect(payload(await handleKnowledgeFsWrite({ ...env, rawArgs: reordered })).ids).toEqual([...first.ids].reverse());
        expect(env.write.mock.calls[1][1].data).not.toContain(first.ids[0]);
        expect(payload(await handleKnowledgeFsWrite({ ...env, rawArgs })).changed).toBe(false);
        expect(env.write).toHaveBeenCalledTimes(2);
        const mutated = { ...rawArgs, mode: 'bestEffort', atoms: [
            { ...rawArgs.atoms[0], markdown: '改动已提交原子。' }, { ...atom('third'), itemKey: 'c' },
        ] };
        expect((await readKnowledgeFsWriteState(env.client, env.permMgr, mutated)).summary).toMatchObject({
            ready: false, failed: [{ index: 0, id: first.ids[0], itemKey: 'a' }],
        });
        expect((await handleKnowledgeFsWrite({ ...env, rawArgs: mutated })).isError).toBe(true);
        expect(env.write).toHaveBeenCalledTimes(2);
    });

    it('拒绝读取不可写目标的子块，atomic 遇到非段落不写入，bestEffort 明确报告跳过项', async () => {
        const rawArgs = { action: 'write_atoms', path: PATH, batchId: '语法', atoms: [atom('valid'), atom('invalid', '# 标题')] };
        const denied = fixture(false);
        await expect(readKnowledgeFsWriteState(denied.client, denied.permMgr, rawArgs)).rejects.toMatchObject({ code: 'permission_denied' });
        expect(denied.read.mock.calls.some(([ep]) => ep === READ)).toBe(false);
        const env = fixture();
        const rejected = await readKnowledgeFsWriteState(env.client, env.permMgr, rawArgs);
        expect(rejected.summary).toMatchObject({ ready: false, failed: [{ index: 1 }] });
        const atomic = await handleKnowledgeFsWrite({ ...env, rawArgs });
        expect(atomic.isError).toBe(true);
        expect(env.write).not.toHaveBeenCalled();
        const partial = payload(await handleKnowledgeFsWrite({ ...env, rawArgs: { ...rawArgs, mode: 'bestEffort' } }));
        expect(partial).toMatchObject({ success: true, partial: true, ids: rejected.summary.plannedIds, failed: [{ index: 1 }] });
        expect(env.write).toHaveBeenCalledTimes(1);
    });
});

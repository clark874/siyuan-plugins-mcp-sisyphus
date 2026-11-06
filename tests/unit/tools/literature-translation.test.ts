import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

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

import { describe, expect, it, vi } from 'vitest';

import { getControlledSetting, setControlledSetting } from '@/api/settings';
import { getSnippets, setSnippets } from '@/api/snippets';
import { readDir } from '@/api/workspace-files';

describe('control-plane API wrappers', () => {
    it('normalizes snippets and writes the complete collection', async () => {
        const request = vi.fn()
            .mockResolvedValueOnce({ snippets: [{ id: 's1', name: 'Demo', type: 'css', enabled: true, content: 'body{}' }, { bad: true }] })
            .mockResolvedValueOnce(null);
        const client = { request } as never;
        const snippets = await getSnippets(client);

        expect(snippets).toEqual([{ id: 's1', name: 'Demo', type: 'css', enabled: true, disabledInPublish: false, content: 'body{}' }]);
        await setSnippets(client, snippets);
        expect(request).toHaveBeenNthCalledWith(2, '/api/snippet/setSnippet', { snippets });
    });

    it('normalizes workspace directory entries and retains symlink metadata', async () => {
        const client = { request: vi.fn().mockResolvedValue([{ name: 'config.json', isDir: false, isSymlink: true, updated: 7 }, null]) } as never;

        await expect(readDir(client, '/data/storage/petal/demo')).resolves.toEqual([
            { name: 'config.json', isDir: false, isSymlink: true, updated: 7 },
        ]);
    });

    it('reads only the selected controlled setting and wraps keymap writes', async () => {
        const request = vi.fn()
            .mockResolvedValueOnce({ conf: { keymap: { general: { open: '⌘O' } }, account: { token: 'hidden' } } })
            .mockResolvedValueOnce(null);
        const client = { request } as never;
        const keymap = await getControlledSetting(client, 'keymap');

        expect(keymap).toEqual({ general: { open: '⌘O' } });
        await setControlledSetting(client, 'keymap', keymap);
        expect(request).toHaveBeenNthCalledWith(2, '/api/setting/setKeymap', { data: keymap });
    });
});

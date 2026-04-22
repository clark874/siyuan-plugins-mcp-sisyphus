import { describe, expect, it, vi } from 'vitest';

import { renderTemplate, renderSprig } from '@/api/template';

describe('template api wrappers', () => {
    it('requests template render by id and path', async () => {
        const request = vi.fn().mockResolvedValueOnce('rendered html');
        const client = { request } as never;

        await expect(renderTemplate(client, 'tpl-id', '/templates/note.md')).resolves.toBe('rendered html');
        expect(request).toHaveBeenCalledWith('/api/template/render', {
            id: 'tpl-id',
            path: '/templates/note.md',
        });
    });

    it('requests sprig template render', async () => {
        const request = vi.fn().mockResolvedValueOnce('sprig output');
        const client = { request } as never;

        await expect(renderSprig(client, 'Hello {{ .Name }}')).resolves.toBe('sprig output');
        expect(request).toHaveBeenCalledWith('/api/template/renderSprig', {
            template: 'Hello {{ .Name }}',
        });
    });
});

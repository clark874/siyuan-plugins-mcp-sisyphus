import { describe, expect, it, vi } from 'vitest';

import { buildDefaultToolConfig } from '@/core/config';
import { callFsTool } from '@/tools/fs';
import { createMockClient } from '../../helpers/mock-client';
import { parseResult } from '../../helpers/parse-result';

type PermissionLevel = 'rwd' | 'rw' | 'r' | 'none';

function createPermMgr(level: PermissionLevel | Record<string, PermissionLevel> = 'rwd') {
    const getLevel = (notebookId: string): PermissionLevel => {
        if (typeof level === 'string') return level;
        return level[notebookId] ?? 'r';
    };
    return {
        reload: vi.fn(async () => undefined),
        canRead: vi.fn((notebookId: string) => getLevel(notebookId) !== 'none'),
        canWrite: vi.fn((notebookId: string) => ['rw', 'rwd'].includes(getLevel(notebookId))),
        canDelete: vi.fn((notebookId: string) => getLevel(notebookId) === 'rwd'),
        get: vi.fn((notebookId: string) => getLevel(notebookId)),
    } as any;
}

function fsConfig() {
    return buildDefaultToolConfig().fs;
}

function createFsClient(options: { ambiguous?: boolean; missingPaths?: string[] } = {}) {
    const missing = new Set(options.missingPaths ?? []);
    return createMockClient({
        request: vi.fn(async (endpoint: string, body?: Record<string, unknown>) => {
            if (endpoint.startsWith('/api/ui/')) return null;
            if (endpoint === '/api/notebook/lsNotebooks') {
                return {
                    notebooks: options.ambiguous
                        ? [
                            { id: 'nb-1', name: 'Notebook', closed: false },
                            { id: 'nb-2', name: 'Archive', closed: false },
                        ]
                        : [{ id: 'nb-1', name: 'Notebook', closed: false }],
                };
            }
            if (endpoint === '/api/filetree/getIDsByHPath') {
                if (missing.has(String(body?.path))) return [];
                return [body?.notebook === 'nb-2' ? 'doc-2' : 'doc-1'];
            }
            if (endpoint === '/api/filetree/getPathByID') {
                return { notebook: body?.id === 'doc-2' ? 'nb-2' : 'nb-1', path: body?.id === 'doc-2' ? '/doc-2.sy' : '/doc-1.sy' };
            }
            if (endpoint === '/api/filetree/getHPathByID') {
                if (body?.id === 'child-1') return '/Doc 1/Child';
                if (body?.id === 'grand-1') return '/Doc 1/Child/Grand';
                return '/Doc 1';
            }
            if (endpoint === '/api/filetree/listDocsByPath') {
                return {
                    box: body?.notebook ?? 'nb-1',
                    files: [
                        { id: body?.notebook === 'nb-2' ? 'child-2' : 'child-1', box: body?.notebook ?? 'nb-1', path: '/child.sy', name: 'Child.sy', icon: '1f4d4', subFileCount: 2 },
                    ],
                };
            }
            if (endpoint === '/api/filetree/listDocTree') {
                return {
                    tree: [
                        { id: 'child-1', path: '/child.sy', name: 'Child.sy', children: [{ id: 'grand-1', path: '/grand.sy', name: 'Grand.sy' }] },
                    ],
                };
            }
            if (endpoint === '/api/export/exportMdContent') {
                return { hPath: '/Doc 1', content: 'alpha\nbudget line\nBeta' };
            }
            if (endpoint === '/api/filetree/createDocWithMd') return 'new-doc';
            if (endpoint === '/api/block/getChildBlocks') return [{ id: 'block-1' }, { id: 'block-2' }];
            if (endpoint === '/api/block/deleteBlock') return {};
            if (endpoint === '/api/block/appendBlock') return [{ doOperations: [{ id: 'block-new' }] }];
            if (endpoint === '/api/filetree/removeDocByID') return null;
            if (endpoint === '/api/filetree/moveDocsByID') return null;
            if (endpoint === '/api/filetree/renameDocByID') return null;
            return null;
        }),
    });
}

describe('fs tool', () => {
    it('lists compact child documents without IDs or storage paths', async () => {
        const client = createFsClient();
        const result = await callFsTool(client, { action: 'ls', path: '/Notebook/Doc 1' }, fsConfig(), createPermMgr());
        const parsed = parseResult(result);

        expect(parsed.items).toEqual([{ name: 'Child', path: '/Notebook/Doc 1/Child', children: 2 }]);
        expect(JSON.stringify(parsed)).not.toContain('child-1');
        expect(JSON.stringify(parsed)).not.toContain('/child.sy');
        expect(JSON.stringify(parsed)).not.toContain('1f4d4');
    });

    it('filters root listing to readable notebooks', async () => {
        const client = createFsClient({ ambiguous: true });
        const result = await callFsTool(client, { action: 'ls', path: '/' }, fsConfig(), createPermMgr({ 'nb-1': 'r', 'nb-2': 'none' }));
        const parsed = parseResult(result);

        expect(parsed.items).toEqual([{ name: 'Notebook', path: '/Notebook', children: 1 }]);
        expect(JSON.stringify(parsed)).not.toContain('/Archive');
    });

    it('accepts list as an alias for ls', async () => {
        const client = createFsClient();
        const result = await callFsTool(client, { action: 'list', path: '/Notebook/Doc 1' }, fsConfig(), createPermMgr());
        const parsed = parseResult(result);

        expect(parsed.items).toEqual([{ name: 'Child', path: '/Notebook/Doc 1/Child', children: 2 }]);
    });

    it('renders tree paths from human-readable hPath values instead of storage names', async () => {
        const client = createFsClient();
        const result = await callFsTool(client, { action: 'tree', path: '/Notebook/Doc 1' }, fsConfig(), createPermMgr());
        const parsed = parseResult(result);

        expect(parsed.tree).toEqual([
            {
                name: 'Child',
                path: '/Notebook/Doc 1/Child',
                children: [
                    {
                        name: 'Grand',
                        path: '/Notebook/Doc 1/Child/Grand',
                        children: [],
                    },
                ],
            },
        ]);
        expect(JSON.stringify(parsed)).not.toContain('child-1');
        expect(JSON.stringify(parsed)).not.toContain('grand-1');
        expect(JSON.stringify(parsed)).not.toContain('/child.sy');
        expect(JSON.stringify(parsed)).not.toContain('/grand.sy');
        expect(JSON.stringify(parsed)).not.toContain('Child.sy');
        expect(JSON.stringify(parsed)).not.toContain('Grand.sy');
    });

    it('filters root tree to readable notebooks', async () => {
        const client = createFsClient({ ambiguous: true });
        const result = await callFsTool(client, { action: 'tree', path: '/' }, fsConfig(), createPermMgr({ 'nb-1': 'r', 'nb-2': 'none' }));
        const parsed = parseResult(result);

        expect(parsed.tree).toHaveLength(1);
        expect(parsed.tree[0].path).toBe('/Notebook');
        expect(JSON.stringify(parsed)).not.toContain('/Archive');
    });

    it('reads markdown with pagination metadata', async () => {
        const client = createFsClient();
        const result = await callFsTool(client, { action: 'read', path: '/Notebook/Doc 1', pageSize: 5 }, fsConfig(), createPermMgr());
        const parsed = parseResult(result);

        expect(parsed.path).toBe('/Notebook/Doc 1');
        expect(parsed.content).toBe('alpha');
        expect(parsed.truncated).toBe(true);
        expect(parsed.hasNextPage).toBe(true);
    });

    it('denies reads when notebook permission is none', async () => {
        const client = createFsClient();
        const result = await callFsTool(client, { action: 'read', path: '/Notebook/Doc 1' }, fsConfig(), createPermMgr('none'));
        const parsed = parseResult(result);

        expect(result.isError).toBe(true);
        expect(parsed.error).toMatchObject({
            type: 'permission_denied',
            current_permission: 'none',
            required_permission: 'read',
        });
        expect(client.request).not.toHaveBeenCalledWith('/api/export/exportMdContent', expect.anything());
    });

    it('creates a missing document with markdown', async () => {
        const client = createFsClient({ missingPaths: ['/New Doc'] });
        const result = await callFsTool(client, { action: 'write', path: '/Notebook/New Doc', markdown: '# New' }, fsConfig(), createPermMgr());
        const parsed = parseResult(result);

        expect(parsed).toMatchObject({ success: true, path: '/Notebook/New Doc', created: true });
        expect(client.request).toHaveBeenCalledWith('/api/filetree/createDocWithMd', {
            notebook: 'nb-1',
            path: '/New Doc',
            markdown: '# New',
        });
        expect(parsed.uiRefresh.operations).toEqual([
            { type: 'reloadProtyle', id: 'new-doc' },
            { type: 'reloadFiletree' },
        ]);
        expect(client.request).toHaveBeenCalledWith('/api/ui/reloadProtyle', { id: 'new-doc' });
        expect(client.request).toHaveBeenCalledWith('/api/ui/reloadFiletree', {});
    });

    it('denies creates when notebook permission is read-only', async () => {
        const client = createFsClient({ missingPaths: ['/New Doc'] });
        const result = await callFsTool(client, { action: 'write', path: '/Notebook/New Doc', markdown: '# New' }, fsConfig(), createPermMgr('r'));
        const parsed = parseResult(result);

        expect(result.isError).toBe(true);
        expect(parsed.error).toMatchObject({
            type: 'permission_denied',
            current_permission: 'r',
            required_permission: 'write',
        });
        expect(client.request).not.toHaveBeenCalledWith('/api/filetree/createDocWithMd', expect.anything());
    });

    it('overwrites an existing document body while preserving the document node', async () => {
        const client = createFsClient();
        const result = await callFsTool(client, { action: 'write', path: '/Notebook/Doc 1', markdown: 'replacement', overwrite: true }, fsConfig(), createPermMgr());
        const parsed = parseResult(result);

        expect(parsed).toMatchObject({ success: true, path: '/Notebook/Doc 1', overwritten: true });
        expect(client.request).toHaveBeenCalledWith('/api/block/getChildBlocks', { id: 'doc-1' });
        expect(client.request).toHaveBeenCalledWith('/api/block/deleteBlock', { id: 'block-1' });
        expect(client.request).toHaveBeenCalledWith('/api/block/appendBlock', { dataType: 'markdown', data: 'replacement', parentID: 'doc-1' });
        expect(parsed.uiRefresh.operations).toEqual([
            { type: 'reloadProtyle', id: 'doc-1' },
            { type: 'reloadFiletree' },
        ]);
        expect(client.request).toHaveBeenCalledWith('/api/ui/reloadProtyle', { id: 'doc-1' });
        expect(client.request).toHaveBeenCalledWith('/api/ui/reloadFiletree', {});
    });

    it('denies overwrites when notebook permission is read-only', async () => {
        const client = createFsClient();
        const result = await callFsTool(client, { action: 'write', path: '/Notebook/Doc 1', markdown: 'replacement', overwrite: true }, fsConfig(), createPermMgr('r'));
        const parsed = parseResult(result);

        expect(result.isError).toBe(true);
        expect(parsed.error).toMatchObject({
            type: 'permission_denied',
            current_permission: 'r',
            required_permission: 'write',
        });
        expect(client.request).not.toHaveBeenCalledWith('/api/block/deleteBlock', expect.anything());
        expect(client.request).not.toHaveBeenCalledWith('/api/block/appendBlock', expect.anything());
    });

    it('replaces the first exact match within a document', async () => {
        const client = createFsClient();
        const result = await callFsTool(client, {
            action: 'replace',
            path: '/Notebook/Doc 1',
            edit: { old: 'budget', new: 'forecast' },
        }, fsConfig(), createPermMgr());
        const parsed = parseResult(result);

        expect(parsed).toMatchObject({ success: true, path: '/Notebook/Doc 1', changed: true, editsApplied: 1 });
        expect(client.request).toHaveBeenCalledWith('/api/block/appendBlock', {
            dataType: 'markdown',
            data: 'alpha\nforecast line\nBeta',
            parentID: 'doc-1',
        });
        expect(parsed.uiRefresh.operations).toEqual([
            { type: 'reloadProtyle', id: 'doc-1' },
            { type: 'reloadFiletree' },
        ]);
        expect(client.request).toHaveBeenCalledWith('/api/ui/reloadProtyle', { id: 'doc-1' });
        expect(client.request).toHaveBeenCalledWith('/api/ui/reloadFiletree', {});
    });

    it('denies replacements when notebook permission is read-only', async () => {
        const client = createFsClient();
        const result = await callFsTool(client, {
            action: 'replace',
            path: '/Notebook/Doc 1',
            edit: { old: 'budget', new: 'forecast' },
        }, fsConfig(), createPermMgr('r'));
        const parsed = parseResult(result);

        expect(result.isError).toBe(true);
        expect(parsed.error).toMatchObject({
            type: 'permission_denied',
            current_permission: 'r',
            required_permission: 'write',
        });
        expect(client.request).not.toHaveBeenCalledWith('/api/export/exportMdContent', expect.anything());
        expect(client.request).not.toHaveBeenCalledWith('/api/block/appendBlock', expect.anything());
    });

    it('supports sequential multi-edit replacements with replace_all', async () => {
        const baseClient = createFsClient();
        const client = createMockClient({
            request: vi.fn(async (endpoint: string, body?: Record<string, unknown>) => {
                if (endpoint === '/api/export/exportMdContent') {
                    return { hPath: '/Doc 1', content: 'foo\nbaz\nbaz' };
                }
                return await baseClient.request(endpoint, body);
            }),
        });
        const result = await callFsTool(client, {
            action: 'replace',
            path: '/Notebook/Doc 1',
            edit: [
                { old: 'foo', new: 'bar' },
                { old: 'baz', new: 'qux', replace_all: true },
            ],
        }, fsConfig(), createPermMgr());
        const parsed = parseResult(result);

        expect(parsed.replacements).toEqual([
            { index: 1, replaced: 1, replace_all: false },
            { index: 2, replaced: 2, replace_all: true },
        ]);
        expect(client.request).toHaveBeenCalledWith('/api/block/appendBlock', {
            dataType: 'markdown',
            data: 'bar\nqux\nqux',
            parentID: 'doc-1',
        });
    });

    it('fails when a replace edit does not match any text', async () => {
        const client = createFsClient();
        const result = await callFsTool(client, {
            action: 'replace',
            path: '/Notebook/Doc 1',
            edit: { old: 'missing', new: 'new text' },
        }, fsConfig(), createPermMgr());

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('did not match any text');
    });

    it('skips ui refresh when replacement output is unchanged', async () => {
        const client = createFsClient();
        const result = await callFsTool(client, {
            action: 'replace',
            path: '/Notebook/Doc 1',
            edit: { old: 'budget', new: 'budget' },
        }, fsConfig(), createPermMgr());
        const parsed = parseResult(result);

        expect(parsed.changed).toBe(false);
        expect(parsed.uiRefresh).toBeUndefined();
        expect(client.request).not.toHaveBeenCalledWith('/api/ui/reloadProtyle', expect.anything());
        expect(client.request).not.toHaveBeenCalledWith('/api/ui/reloadFiletree', expect.anything());
    });

    it('strips exported front matter and matching title wrapper before replacing and writing back', async () => {
        const baseClient = createFsClient();
        const client = createMockClient({
            request: vi.fn(async (endpoint: string, body?: Record<string, unknown>) => {
                if (endpoint === '/api/export/exportMdContent') {
                    return {
                        hPath: '/fs-replace-测试',
                        content: [
                            '---',
                            'title: fs-replace-测试',
                            'date: 2026-05-06T17:25:24+08:00',
                            'lastmod: 2026-05-06T17:26:18+08:00',
                            '---',
                            '',
                            '# fs-replace-测试',
                            '',
                            '这是原始内容。',
                            '',
                            '结尾部分。',
                        ].join('\n'),
                    };
                }
                return await baseClient.request(endpoint, body);
            }),
        });

        const result = await callFsTool(client, {
            action: 'replace',
            path: '/Notebook/fs-replace-测试',
            edit: { old: '这是原始内容。', new: '这段文本已经被 fs replace 修改过了。' },
        }, fsConfig(), createPermMgr());
        const parsed = parseResult(result);

        expect(parsed).toMatchObject({ success: true, changed: true });
        expect(client.request).toHaveBeenCalledWith('/api/block/appendBlock', {
            dataType: 'markdown',
            data: '这段文本已经被 fs replace 修改过了。\n\n结尾部分。',
            parentID: 'doc-1',
        });
    });

    it('returns a compact ambiguity error for non-canonical paths', async () => {
        const client = createFsClient({ ambiguous: true });
        const result = await callFsTool(client, { action: 'read', path: '/Doc 1' }, fsConfig(), createPermMgr());

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Ambiguous fs path');
        expect(result.content[0].text).toContain('/Notebook/Doc 1');
        expect(result.content[0].text).toContain('/Archive/Doc 1');
    });

    it('searches markdown lines with regex support', async () => {
        const client = createFsClient();
        const result = await callFsTool(client, { action: 'search', path: '/Notebook/Doc 1', query: '^budget', regex: true }, fsConfig(), createPermMgr());
        const parsed = parseResult(result);

        expect(parsed.data).toEqual([{ path: '/Notebook/Doc 1', line: 2, text: 'budget line' }]);
        expect(parsed.total).toBe(1);
    });

    it('denies scoped search when notebook permission is none', async () => {
        const client = createFsClient();
        const result = await callFsTool(client, { action: 'search', path: '/Notebook/Doc 1', query: 'budget' }, fsConfig(), createPermMgr('none'));
        const parsed = parseResult(result);

        expect(result.isError).toBe(true);
        expect(parsed.error).toMatchObject({
            type: 'permission_denied',
            current_permission: 'none',
            required_permission: 'read',
        });
        expect(client.request).not.toHaveBeenCalledWith('/api/export/exportMdContent', expect.anything());
    });

    it('filters root search to readable notebooks', async () => {
        const client = createFsClient({ ambiguous: true });
        const result = await callFsTool(client, { action: 'search', path: '/', query: 'budget' }, fsConfig(), createPermMgr({ 'nb-1': 'r', 'nb-2': 'none' }));
        const parsed = parseResult(result);

        expect(parsed.data).toEqual([{ path: '/Notebook/Doc 1', line: 2, text: 'budget line' }]);
        expect(JSON.stringify(parsed)).not.toContain('/Archive');
    });

    it('denies removes when notebook permission lacks delete access', async () => {
        const client = createFsClient();
        const result = await callFsTool(client, { action: 'rm', path: '/Notebook/Doc 1' }, fsConfig(), createPermMgr('rw'));
        const parsed = parseResult(result);

        expect(result.isError).toBe(true);
        expect(parsed.error).toMatchObject({
            type: 'permission_denied',
            current_permission: 'rw',
            required_permission: 'delete',
        });
        expect(client.request).not.toHaveBeenCalledWith('/api/filetree/removeDocByID', expect.anything());
    });

    it('accepts remove as an alias for rm', async () => {
        const client = createFsClient();
        const result = await callFsTool(client, { action: 'remove', path: '/Notebook/Doc 1' }, fsConfig(), createPermMgr());
        const parsed = parseResult(result);

        expect(parsed).toMatchObject({ success: true, path: '/Notebook/Doc 1' });
        expect(client.request).toHaveBeenCalledWith('/api/filetree/removeDocByID', { id: 'doc-1' });
        expect(parsed.uiRefresh.operations).toEqual([
            { type: 'reloadProtyle', id: 'doc-1' },
            { type: 'reloadFiletree' },
        ]);
        expect(client.request).toHaveBeenCalledWith('/api/ui/reloadProtyle', { id: 'doc-1' });
        expect(client.request).toHaveBeenCalledWith('/api/ui/reloadFiletree', {});
    });

    it('allows move or rename with write permission but no delete permission', async () => {
        const client = createFsClient({ missingPaths: ['/Renamed'] });
        const result = await callFsTool(client, { action: 'mv', from: '/Notebook/Doc 1', to: '/Notebook/Renamed' }, fsConfig(), createPermMgr('rw'));
        const parsed = parseResult(result);

        expect(parsed).toMatchObject({ success: true, path: '/Notebook/Doc 1', movedTo: '/Notebook/Renamed' });
        expect(client.request).toHaveBeenCalledWith('/api/filetree/moveDocsByID', { fromIDs: ['doc-1'], toID: 'nb-1' });
        expect(client.request).toHaveBeenCalledWith('/api/filetree/renameDocByID', { id: 'doc-1', title: 'Renamed' });
        expect(parsed.uiRefresh.operations).toEqual([
            { type: 'reloadProtyle', id: 'doc-1' },
            { type: 'reloadFiletree' },
        ]);
        expect(client.request).toHaveBeenCalledWith('/api/ui/reloadProtyle', { id: 'doc-1' });
        expect(client.request).toHaveBeenCalledWith('/api/ui/reloadFiletree', {});
    });

    it('accepts move as an alias for mv', async () => {
        const client = createFsClient({ missingPaths: ['/Renamed'] });
        const result = await callFsTool(client, { action: 'move', from: '/Notebook/Doc 1', to: '/Notebook/Renamed' }, fsConfig(), createPermMgr('rw'));
        const parsed = parseResult(result);

        expect(parsed).toMatchObject({ success: true, path: '/Notebook/Doc 1', movedTo: '/Notebook/Renamed' });
        expect(client.request).toHaveBeenCalledWith('/api/filetree/moveDocsByID', { fromIDs: ['doc-1'], toID: 'nb-1' });
    });

    it('denies move when the destination notebook is not writable', async () => {
        const client = createFsClient({ ambiguous: true, missingPaths: ['/New Name'] });
        const result = await callFsTool(client, { action: 'mv', from: '/Notebook/Doc 1', to: '/Archive/New Name' }, fsConfig(), createPermMgr({ 'nb-1': 'rw', 'nb-2': 'r' }));
        const parsed = parseResult(result);

        expect(result.isError).toBe(true);
        expect(parsed.error).toMatchObject({
            type: 'permission_denied',
            current_permission: 'r',
            required_permission: 'write',
        });
        expect(client.request).not.toHaveBeenCalledWith('/api/filetree/moveDocsByID', expect.anything());
    });
});

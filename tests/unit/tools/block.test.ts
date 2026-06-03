import { describe, expect, it, vi } from 'vitest';

import { buildDefaultToolConfig } from '@/core/config';
import { callBlockTool, listBlockTools } from '@/tools/block';
import { isMissingBlockError } from '@/tools/internal/errorTranslation';
import { createMockClient } from '../../helpers/mock-client';
import { parseResult } from '../../helpers/parse-result';

describe('block tool', () => {
    const permMgr = {
        reload: async () => undefined,
        canWrite: () => true,
        canRead: () => true,
        canDelete: () => true,
        get: () => 'rwd',
    };

    function createBlockReplaceClient(kramdown = 'alpha\nbudget line\nbudget tail') {
        return createMockClient({
            request: vi.fn(async (endpoint: string, body?: Record<string, unknown>) => {
                if (endpoint === '/api/query/sql') {
                    return [{
                        id: body?.id ?? 'block-1',
                        root_id: 'doc-1',
                        box: 'nb-1',
                        path: '/doc-1.sy',
                        hpath: '/Doc 1',
                        content: 'Doc 1',
                        type: 'p',
                    }];
                }
                if (endpoint === '/api/block/getBlockKramdown') {
                    return { id: body?.id, kramdown };
                }
                if (endpoint === '/api/block/updateBlock') {
                    return { updated: true };
                }
                if (endpoint.startsWith('/api/ui/')) {
                    return null;
                }
                throw new Error(`Unexpected endpoint: ${endpoint}`);
            }),
        });
    }

    it('treats missing block API errors as non-existent blocks', () => {
        expect(isMissingBlockError(new Error('SiYuan API error: -1 - 未找到 ID 为 [invalid-block-id-12345] 的内容块'))).toBe(true);
        expect(isMissingBlockError(new Error('some other error'))).toBe(false);
    });

    it('exposes merged batch and daily-note actions in the grouped schema', () => {
        const config = buildDefaultToolConfig();
        const [tool] = listBlockTools(config.block);
        const actionDescription = tool.inputSchema.properties.action.description;
        expect(actionDescription).toContain('insert');
        expect(actionDescription).toContain('update');
        expect(actionDescription).toContain('replace');
        expect(actionDescription).toContain('add_to_daily_note');
        expect(actionDescription).toContain('docs_info');
    });

    it('publishes JSON types for object and array parameters', () => {
        const config = buildDefaultToolConfig();
        const [tool] = listBlockTools(config.block);

        expect(tool.inputSchema.properties.attrs.type).toBe('object');
        expect(tool.inputSchema.properties.attrs.additionalProperties).toEqual({ type: 'string' });
        expect(tool.inputSchema.properties.ids.type).toBe('array');
        expect(tool.inputSchema.properties.ids.items).toEqual({ type: 'string' });
    });

    it('documents insert anchors inside each block item', () => {
        const config = buildDefaultToolConfig();
        const [tool] = listBlockTools(config.block);
        const insertSchema = (tool.inputSchema['x-sisyphus-actionSchemas'] as Array<{ properties?: Record<string, any> }>)
            .find((schema) => schema.properties?.action?.const === 'insert');
        const properties = insertSchema?.properties as Record<string, unknown>;
        const batchInsertBlocks = properties.blocks as Record<string, unknown>;

        expect(batchInsertBlocks.description).toContain('top-level');
    });

    it('calls append daily note block endpoint', async () => {
        const client = createMockClient({
            request: async (endpoint: string, body: unknown) => {
                expect(endpoint).toBe('/api/block/appendDailyNoteBlock');
                expect(body).toMatchObject({ notebook: 'nb', dataType: 'markdown', data: 'hello' });
                return [{ doOperations: [] }];
            },
        });

        const result = await callBlockTool(client, {
            action: 'add_to_daily_note',
            notebook: 'nb',
            dataType: 'markdown',
            data: 'hello',
            position: 'append',
        }, buildDefaultToolConfig().block, permMgr as never);

        expect(parseResult(result).success).toBe(true);
    });

    it('replaces the first exact match inside one block', async () => {
        const client = createBlockReplaceClient();

        const result = await callBlockTool(client, {
            action: 'replace',
            id: 'block-1',
            edit: { old: 'budget', new: 'forecast' },
        }, buildDefaultToolConfig().block, permMgr as never);
        const parsed = parseResult(result);

        expect(parsed).toMatchObject({
            success: true,
            action: 'replace',
            id: 'block-1',
            changed: true,
            editsApplied: 1,
            replacements: [{ index: 1, replaced: 1, replace_all: false }],
        });
        expect(client.request).toHaveBeenCalledWith('/api/block/updateBlock', {
            id: 'block-1',
            dataType: 'markdown',
            data: 'alpha\nforecast line\nbudget tail',
        });
    });

    it('supports sequential block replacements with replace_all', async () => {
        const client = createBlockReplaceClient('foo\nbaz\nbaz');

        const result = await callBlockTool(client, {
            action: 'replace',
            id: 'block-1',
            edit: [
                { old: 'foo', new: 'bar' },
                { old: 'baz', new: 'qux', replace_all: true },
            ],
        }, buildDefaultToolConfig().block, permMgr as never);
        const parsed = parseResult(result);

        expect(parsed.replacements).toEqual([
            { index: 1, replaced: 1, replace_all: false },
            { index: 2, replaced: 2, replace_all: true },
        ]);
        expect(client.request).toHaveBeenCalledWith('/api/block/updateBlock', {
            id: 'block-1',
            dataType: 'markdown',
            data: 'bar\nqux\nqux',
        });
    });

    it('fails block replace when an edit does not match any text', async () => {
        const client = createBlockReplaceClient();

        const result = await callBlockTool(client, {
            action: 'replace',
            id: 'block-1',
            edit: { old: 'missing', new: 'new text' },
        }, buildDefaultToolConfig().block, permMgr as never);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('block.replace edit #1 did not match any text');
        expect(result.content[0].text).toContain('only searches the kramdown of the single block');
        expect(result.content[0].text).toContain('fs(action=\\"replace\\")');
        expect(client.request).not.toHaveBeenCalledWith('/api/block/updateBlock', expect.anything());
    });

    it('denies block replacements when notebook permission is read-only', async () => {
        const client = createBlockReplaceClient();
        const readonlyPermMgr = {
            ...permMgr,
            canWrite: () => false,
            get: () => 'r',
        };

        const result = await callBlockTool(client, {
            action: 'replace',
            id: 'block-1',
            edit: { old: 'budget', new: 'forecast' },
        }, buildDefaultToolConfig().block, readonlyPermMgr as never);
        const parsed = parseResult(result);

        expect(result.isError).toBe(true);
        expect(parsed.error).toMatchObject({
            type: 'permission_denied',
            current_permission: 'r',
            required_permission: 'write',
        });
        expect(client.request).not.toHaveBeenCalledWith('/api/block/getBlockKramdown', expect.anything());
        expect(client.request).not.toHaveBeenCalledWith('/api/block/updateBlock', expect.anything());
    });

    it('skips block update and refresh when replacement output is unchanged', async () => {
        const client = createBlockReplaceClient('same text');

        const result = await callBlockTool(client, {
            action: 'replace',
            id: 'block-1',
            edit: { old: 'same', new: 'same' },
        }, buildDefaultToolConfig().block, permMgr as never);
        const parsed = parseResult(result);

        expect(parsed).toMatchObject({ success: true, changed: false, editsApplied: 1 });
        expect(client.request).not.toHaveBeenCalledWith('/api/block/updateBlock', expect.anything());
        expect(client.request).not.toHaveBeenCalledWith('/api/ui/reloadProtyle', expect.anything());
    });

    it('reloads the owning document after block replace changes content', async () => {
        const client = createBlockReplaceClient();

        const result = await callBlockTool(client, {
            action: 'replace',
            id: 'block-1',
            edit: { old: 'budget', new: 'forecast' },
        }, buildDefaultToolConfig().block, permMgr as never);
        const parsed = parseResult(result);

        expect(parsed.uiRefresh.operations).toEqual([{ type: 'reloadProtyle', id: 'doc-1' }]);
        expect(client.request).toHaveBeenCalledWith('/api/ui/reloadProtyle', { id: 'doc-1' });
    });

    it('rejects batched insert when any block is missing parentID, previousID, and nextID', async () => {
        const client = createMockClient();

        const result = await callBlockTool(client, {
            action: 'insert',
            blocks: [
                { dataType: 'markdown', data: 'valid', parentID: 'doc-1' },
                { dataType: 'markdown', data: 'invalid' },
            ],
        }, buildDefaultToolConfig().block, permMgr as never);

        expect(parseResult(result)).toEqual({
            error: {
                type: 'validation_error',
                message: 'Invalid arguments for block(action="insert").',
                tool: 'block',
                action: 'insert',
                hint: 'nextID inserts BEFORE that block; previousID inserts AFTER that block. Provide at least one of nextID, previousID, or parentID. Returns a slim success object with the created block ID. Use #tag# syntax in markdown when you want SiYuan to register a real tag.',
                fields: [{
                    path: 'blocks[1].previousID',
                    message: 'Provide nextID, previousID, or parentID for each block, or set a top-level parentID/previousID/nextID.',
                }],
            },
        });
        expect(client.request).not.toHaveBeenCalled();
    });

    it('inherits a top-level parentID for every batched insert item', async () => {
        const client = createMockClient({
            request: vi.fn(async (endpoint: string, body: unknown) => {
                if (endpoint === '/api/query/sql') {
                    return [{
                        id: 'doc-1',
                        root_id: 'doc-1',
                        box: 'nb-1',
                        path: '/doc-1.sy',
                        hpath: '/Doc 1',
                        content: 'Doc 1',
                        type: 'd',
                    }];
                }
                if (endpoint === '/api/block/batchInsertBlock') {
                    expect(body).toEqual({
                        blocks: [
                            { dataType: 'markdown', data: 'Block A', parentID: 'doc-1' },
                            { dataType: 'markdown', data: 'Block B', parentID: 'doc-1' },
                        ],
                    });
                    return [{
                        doOperations: [
                            { action: 'insert', id: 'block-a', parentID: 'doc-1' },
                            { action: 'insert', id: 'block-b', parentID: 'doc-1' },
                        ],
                        undoOperations: [],
                    }];
                }
                if (endpoint === '/api/ui/reloadProtyle') {
                    expect(body).toEqual({ id: 'doc-1' });
                    return null;
                }
                throw new Error(`Unexpected endpoint: ${endpoint}`);
            }),
        });

        const result = await callBlockTool(client, {
            action: 'insert',
            parentID: 'doc-1',
            blocks: [
                { dataType: 'markdown', data: 'Block A' },
                { dataType: 'markdown', data: 'Block B' },
            ],
        }, buildDefaultToolConfig().block, permMgr as never);

        expect(parseResult(result)).toEqual({
            success: true,
            action: 'insert',
            count: 2,
            createdBlockIDs: ['block-a', 'block-b'],
            transactions: [{
                doOperations: [
                    { action: 'insert', id: 'block-a', parentID: 'doc-1' },
                    { action: 'insert', id: 'block-b', parentID: 'doc-1' },
                ],
                undoOperations: [],
            }],
            uiRefresh: {
                applied: true,
                operations: [{ type: 'reloadProtyle', id: 'doc-1' }],
            },
        });
    });

    it('fails batched insert when SiYuan returns a no-op transaction payload', async () => {
        const client = createMockClient({
            request: vi.fn(async (endpoint: string) => {
                if (endpoint === '/api/query/sql') {
                    return [{
                        id: 'doc-1',
                        root_id: 'doc-1',
                        box: 'nb-1',
                        path: '/doc-1.sy',
                        hpath: '/Doc 1',
                        content: 'Doc 1',
                        type: 'd',
                    }];
                }
                if (endpoint === '/api/block/batchInsertBlock') {
                    return [{
                        doOperations: [
                            { action: 'insert', id: '', parentID: '', rootID: '' },
                        ],
                        undoOperations: [],
                    }];
                }
                if (endpoint === '/api/ui/reloadProtyle') {
                    throw new Error('reloadProtyle should not be called for a failed insert');
                }
                throw new Error(`Unexpected endpoint: ${endpoint}`);
            }),
        });

        const result = await callBlockTool(client, {
            action: 'insert',
            blocks: [
                { dataType: 'markdown', data: 'Block A', parentID: 'doc-1' },
            ],
        }, buildDefaultToolConfig().block, permMgr as never);

        expect(parseResult(result)).toEqual({
            error: {
                type: 'api_error',
                tool: 'block',
                action: 'insert',
                reason: 'empty_transaction_result',
                message: 'SiYuan accepted insert for 1 block(s), but returned no created block IDs.',
                hint: 'Check that each item includes nextID, previousID, or parentID, or provide one batch-level parentID/previousID/nextID, then retry. MCP now rejects no-op insert responses instead of reporting success.',
                transactions: [{
                    doOperations: [
                        { action: 'insert', id: '', parentID: '', rootID: '' },
                    ],
                    undoOperations: [],
                }],
            },
        });
    });
});

import { describe, expect, it, vi } from 'vitest';

import { buildDefaultToolConfig } from '@/core/config';
import { callBlockTool, listBlockTools } from '@/tools/block';
import { isMissingBlockError } from '@/tools/errorTranslation';
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

    it('treats missing block API errors as non-existent blocks', () => {
        expect(isMissingBlockError(new Error('SiYuan API error: -1 - 未找到 ID 为 [invalid-block-id-12345] 的内容块'))).toBe(true);
        expect(isMissingBlockError(new Error('some other error'))).toBe(false);
    });

    it('exposes new batch and daily-note actions in the grouped schema', () => {
        const config = buildDefaultToolConfig();
        const [tool] = listBlockTools(config.block);
        expect(tool.inputSchema.properties.action.enum).toContain('batch_insert');
        expect(tool.inputSchema.properties.action.enum).toContain('batch_update');
        expect(tool.inputSchema.properties.action.enum).toContain('append_daily_note');
        expect(tool.inputSchema.properties.action.enum).toContain('docs_info');
    });

    it('documents batch_insert anchors inside each block item', () => {
        const config = buildDefaultToolConfig();
        const [tool] = listBlockTools(config.block);
        const properties = tool.inputSchema.properties as Record<string, unknown>;
        const batchInsertBlocks = properties.blocks as Record<string, unknown>;

        expect(batchInsertBlocks.description).toContain('top level');
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
            action: 'append_daily_note',
            notebook: 'nb',
            dataType: 'markdown',
            data: 'hello',
        }, buildDefaultToolConfig().block, permMgr as never);

        expect(parseResult(result).success).toBe(true);
    });

    it('rejects batch_insert when any block is missing parentID, previousID, and nextID', async () => {
        const client = createMockClient();

        const result = await callBlockTool(client, {
            action: 'batch_insert',
            blocks: [
                { dataType: 'markdown', data: 'valid', parentID: 'doc-1' },
                { dataType: 'markdown', data: 'invalid' },
            ],
        }, buildDefaultToolConfig().block, permMgr as never);

        expect(parseResult(result)).toEqual({
            error: {
                type: 'validation_error',
                message: 'Invalid arguments for block(action="batch_insert").',
                tool: 'block',
                action: 'batch_insert',
                hint: 'Use blocks[]. Common case: pass one top-level parentID, previousID, or nextID as the batch default, and each block item only needs dataType + data. When blocks need different anchors, put parentID/previousID/nextID inside each block item instead. On success, MCP returns createdBlockIDs and rejects no-op kernel responses instead of reporting fake success.',
                fields: [{
                    path: 'blocks[1].previousID',
                    message: 'Provide nextID, previousID, or parentID for each block, or set a batch-level parentID/previousID/nextID.',
                }],
            },
        });
        expect(client.request).not.toHaveBeenCalled();
    });

    it('inherits a top-level parentID for every batch_insert item', async () => {
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
            action: 'batch_insert',
            parentID: 'doc-1',
            blocks: [
                { dataType: 'markdown', data: 'Block A' },
                { dataType: 'markdown', data: 'Block B' },
            ],
        }, buildDefaultToolConfig().block, permMgr as never);

        expect(parseResult(result)).toEqual({
            success: true,
            action: 'batch_insert',
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

    it('fails batch_insert when SiYuan returns a no-op transaction payload', async () => {
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
                    throw new Error('reloadProtyle should not be called for a failed batch_insert');
                }
                throw new Error(`Unexpected endpoint: ${endpoint}`);
            }),
        });

        const result = await callBlockTool(client, {
            action: 'batch_insert',
            blocks: [
                { dataType: 'markdown', data: 'Block A', parentID: 'doc-1' },
            ],
        }, buildDefaultToolConfig().block, permMgr as never);

        expect(parseResult(result)).toEqual({
            error: {
                type: 'api_error',
                tool: 'block',
                action: 'batch_insert',
                reason: 'empty_transaction_result',
                message: 'SiYuan accepted batch_insert for 1 block(s), but returned no created block IDs.',
                hint: 'Check that each item includes nextID, previousID, or parentID, or provide one batch-level parentID/previousID/nextID, then retry. MCP now rejects no-op batch_insert responses instead of reporting success.',
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

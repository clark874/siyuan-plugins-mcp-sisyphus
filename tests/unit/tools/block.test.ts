import { describe, expect, it } from 'vitest';

import { buildDefaultToolConfig } from '@/core/config';
import { callBlockTool, listBlockTools } from '@/tools/block';
import { isMissingBlockError } from '@/tools/errorTranslation';
import { createMockClient } from '../../helpers/mock-client';
import { parseResult } from '../../helpers/parse-result';

describe('block tool', () => {
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

    it('calls append daily note block endpoint', async () => {
        const client = createMockClient({
            request: async (endpoint: string, body: unknown) => {
                expect(endpoint).toBe('/api/block/appendDailyNoteBlock');
                expect(body).toMatchObject({ notebook: 'nb', dataType: 'markdown', data: 'hello' });
                return [{ doOperations: [] }];
            },
        });
        const permMgr = {
            reload: async () => undefined,
            canWrite: () => true,
            canRead: () => true,
            canDelete: () => true,
            get: () => 'rwd',
        };

        const result = await callBlockTool(client, {
            action: 'append_daily_note',
            notebook: 'nb',
            dataType: 'markdown',
            data: 'hello',
        }, buildDefaultToolConfig().block, permMgr as never);

        expect(parseResult(result).success).toBe(true);
    });
});

import { describe, expect, it } from 'vitest';

import { FILE_ACTIONS, buildDefaultToolConfig } from '@/core/config';
import { callFileTool, listFileTools } from '@/tools/file';
import { createMockClient } from '../../helpers/mock-client';
import { parseResult } from '../../helpers/parse-result';

describe('file 项目来源工具', () => {
    const config = buildDefaultToolConfig().file;

    it('只暴露六个项目来源动作', () => {
        const [tool] = listFileTools(config);
        expect(tool.inputSchema.properties.action.enum).toEqual([...FILE_ACTIONS, 'help']);
        expect(tool.inputSchema.properties.action.enum).not.toEqual(expect.arrayContaining([
            'upload_asset', 'get_image_ocr_text', 'list_templates', 'export_resources', 'import',
        ]));
    });

    it('对未知项目返回最接近的登记项目', async () => {
        const client = createMockClient({
            readFile: async () => JSON.stringify({
                schemaVersion: 1,
                updatedAt: '2026-08-23T00:00:00.000Z',
                projects: [{
                    projectId: 'water-commodification-dual-transition',
                    sourceKind: 'directory', revision: 'directory:test', coverage: 'complete',
                    coreFiles: [], includePaths: [], exclusions: [], bindings: {},
                    updatedAt: '2026-08-23T00:00:00.000Z',
                }],
            }),
        });
        const result = await callFileTool(client, {
            action: 'read_project_source',
            projectId: 'water-commodity-dual-transition',
            relativePath: 'README.md',
        }, config, {} as never);

        expect(result.isError).toBe(true);
        expect(parseResult(result)).toMatchObject({
            error: { code: 'project_source_not_registered', suggestions: ['water-commodification-dual-transition'] },
        });
    });

    it('拒绝越界相对路径', async () => {
        const result = await callFileTool(createMockClient(), {
            action: 'read_project_source',
            projectId: 'project-1',
            relativePath: '../secret.txt',
        }, config, {} as never);
        expect(parseResult(result)).toMatchObject({ error: { type: 'invalid_path', code: 'invalid_project_relative_path' } });
    });
});

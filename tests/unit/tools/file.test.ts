import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildDefaultToolConfig } from '@/core/config';
import { callFileTool, listFileTools } from '@/tools/file';
import { createMockClient } from '../../helpers/mock-client';
import { parseResult } from '../../helpers/parse-result';

vi.mock('@/api/file', () => ({
    getUnusedAssets: vi.fn(),
    getDocAssets: vi.fn(),
    getDocImageAssets: vi.fn(),
    getImageOCRText: vi.fn(),
}));

vi.mock('@/tools/context', () => ({
    ensurePermissionForDocumentId: vi.fn(async () => ({
        context: { documentId: 'doc-1', notebook: 'nb-1', path: '/doc-1.sy' },
        denied: null,
    })),
}));

describe('file tool asset actions', () => {
    const config = buildDefaultToolConfig();
    const client = createMockClient();

    beforeEach(async () => {
        const fileApi = await import('@/api/file');
        vi.mocked(fileApi.getUnusedAssets).mockReset();
        vi.mocked(fileApi.getDocAssets).mockReset();
        vi.mocked(fileApi.getDocImageAssets).mockReset();
        vi.mocked(fileApi.getImageOCRText).mockReset();

        vi.mocked(fileApi.getUnusedAssets).mockResolvedValue(['assets/orphan.png']);
        vi.mocked(fileApi.getDocAssets).mockResolvedValue(['assets/manual.pdf', 'assets/cover.png']);
        vi.mocked(fileApi.getDocImageAssets).mockResolvedValue(['assets/cover.png']);
        vi.mocked(fileApi.getImageOCRText).mockResolvedValue({ text: 'recognized text' });
    });

    it('exposes asset management actions in the grouped schema', () => {
        const [tool] = listFileTools(config.file);
        expect(tool.inputSchema.properties.action.enum).toContain('list_unused_assets');
        expect(tool.inputSchema.properties.action.enum).toContain('get_doc_assets');
        expect(tool.inputSchema.properties.action.enum).toContain('get_image_ocr_text');
        expect(tool.inputSchema.properties.action.enum).toContain('remove_unused_assets');
        expect(tool.inputSchema.properties.action.enum).toContain('rename_asset');
        expect(tool.inputSchema.properties.action.enum).toContain('delete_asset');
        expect(tool.inputSchema.properties.action.enum).toContain('set_image_alpha');
    });

    it('calls unused assets endpoint', async () => {
        const result = await callFileTool(client, {
            action: 'list_unused_assets',
        }, config.file, {} as never);

        expect(parseResult(result)).toEqual({
            assets: ['assets/orphan.png'],
            count: 1,
        });
    });

    it('returns document assets after permission check', async () => {
        const result = await callFileTool(client, {
            action: 'get_doc_assets',
            id: 'doc-1',
        }, config.file, {} as never);

        expect(parseResult(result)).toEqual({
            id: 'doc-1',
            assetType: 'all',
            assets: ['assets/manual.pdf', 'assets/cover.png'],
            count: 2,
        });
    });

    it('returns document image assets after permission check', async () => {
        const result = await callFileTool(client, {
            action: 'get_doc_assets',
            id: 'doc-1',
            assetType: 'image',
        }, config.file, {} as never);

        expect(parseResult(result)).toEqual({
            id: 'doc-1',
            assetType: 'image',
            assets: ['assets/cover.png'],
            count: 1,
        });
    });

    it('returns OCR text for an image asset', async () => {
        const result = await callFileTool(client, {
            action: 'get_image_ocr_text',
            path: 'assets/cover.png',
        }, config.file, {} as never);

        expect(parseResult(result)).toEqual({
            path: 'assets/cover.png',
            text: 'recognized text',
        });
    });
});

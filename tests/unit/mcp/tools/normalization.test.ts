import { beforeEach, describe, expect, it, vi } from 'vitest';

import { callBlockTool } from '@/mcp/tools/block';
import { callDocumentTool } from '@/mcp/tools/document';
import { callFileTool } from '@/mcp/tools/file';
import { callSearchTool } from '@/mcp/tools/search';

vi.mock('@/mcp/tools/context', () => ({
    ensurePermissionForDocumentId: vi.fn(async () => ({
        context: { documentId: 'doc-1', notebook: 'nb-1', path: '/doc-1.sy' },
        denied: null,
    })),
    ensurePermissionForNotebook: vi.fn(async () => null),
    listChildDocumentsByPath: vi.fn(),
    resolveMoveTargetNotebook: vi.fn(),
    resolveNotebookForPath: vi.fn(),
}));

vi.mock('@/api/file', () => ({
    uploadAsset: vi.fn(),
    exportMdContent: vi.fn(),
    renderTemplate: vi.fn(),
}));

vi.mock('@/api/document', () => ({
    getDoc: vi.fn(),
    getHPathByID: vi.fn(),
}));

vi.mock('@/api/attribute', () => ({
    setBlockAttrs: vi.fn(),
}));

vi.mock('@/api/block', () => ({
    updateBlock: vi.fn(),
    getBlockKramdown: vi.fn(),
    getChildBlocks: vi.fn(),
}));

vi.mock('@/api/search', () => ({
    fullTextSearchBlock: vi.fn(),
    getBacklinkDoc: vi.fn(),
    getBackmentionDoc: vi.fn(),
    querySQL: vi.fn(),
    searchTag: vi.fn(),
}));

describe('tool result normalization', () => {
    const enabledActions = <T extends string>(...actions: T[]) => ({
        enabled: true,
        actions: Object.fromEntries(actions.map((action) => [action, true])) as Record<T, boolean>,
    });

    const permMgr = {} as any;
    const client = {} as any;

    beforeEach(async () => {
        const fileApi = await import('@/api/file');
        const documentApi = await import('@/api/document');
        const attributeApi = await import('@/api/attribute');
        const blockApi = await import('@/api/block');
        const searchApi = await import('@/api/search');

        vi.mocked(fileApi.uploadAsset).mockReset();
        vi.mocked(fileApi.exportMdContent).mockReset();
        vi.mocked(fileApi.renderTemplate).mockReset();
        vi.mocked(documentApi.getDoc).mockReset();
        vi.mocked(documentApi.getHPathByID).mockReset();
        vi.mocked(attributeApi.setBlockAttrs).mockReset();
        vi.mocked(blockApi.updateBlock).mockReset();
        vi.mocked(blockApi.getBlockKramdown).mockReset();
        vi.mocked(blockApi.getChildBlocks).mockReset();
        vi.mocked(searchApi.fullTextSearchBlock).mockReset();
    });

    it('returns clean markdown for document.get_doc markdown mode', async () => {
        const fileApi = await import('@/api/file');
        vi.mocked(fileApi.exportMdContent).mockResolvedValue({
            hPath: '/Doc',
            content: 'hello\u200B #tag#\u200B',
        });

        const result = await callDocumentTool(client, {
            action: 'get_doc',
            id: 'doc-1',
            mode: 'markdown',
        }, enabledActions('get_doc'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            id: 'doc-1',
            mode: 'markdown',
            hPath: '/Doc',
            content: 'hello #tag#',
        });
    });

    it('uploads an asset from localFilePath', async () => {
        const fileApi = await import('@/api/file');
        const fs = await import('fs');
        vi.spyOn(fs.default, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs.default, 'statSync').mockReturnValue({
            isFile: () => true,
        } as any);
        vi.spyOn(fs.default, 'readFileSync').mockReturnValue(new Uint8Array([65, 66, 67]) as any);
        vi.mocked(fileApi.uploadAsset).mockResolvedValue({
            errFiles: [],
            succMap: { 'demo.txt': '/assets/demo.txt' },
        });

        const result = await callFileTool(client, {
            action: 'upload_asset',
            assetsDirPath: '/assets/',
            localFilePath: 'tmp/demo.txt',
        }, enabledActions('upload_asset'), permMgr);

        expect(vi.mocked(fileApi.uploadAsset)).toHaveBeenCalledWith(
            client,
            '/assets/',
            new Uint8Array([65, 66, 67]),
            'demo.txt',
        );
        expect(JSON.parse(result.content[0].text)).toEqual({
            errFiles: [],
            succMap: { 'demo.txt': '/assets/demo.txt' },
            localFilePath: expect.stringMatching(/tmp[\\/]+demo\.txt$/),
            uploadedFileName: 'demo.txt',
        });
    });

    it('rejects the removed base64 upload_asset shape', async () => {
        const result = await callFileTool(client, {
            action: 'upload_asset',
            assetsDirPath: '/assets/',
            fileName: 'demo.txt',
            file: 'QUJD',
        }, enabledActions('upload_asset'), permMgr);

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.error.type).toBe('validation_error');
    });

    it('stops oversized uploads until the user explicitly confirms', async () => {
        const fileApi = await import('@/api/file');
        const fs = await import('fs');
        vi.spyOn(fs.default, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs.default, 'statSync').mockReturnValue({
            isFile: () => true,
            size: 10 * 1024 * 1024 + 1,
        } as any);

        const result = await callFileTool(client, {
            action: 'upload_asset',
            assetsDirPath: '/assets/',
            localFilePath: 'tmp/huge.bin',
        }, enabledActions('upload_asset'), permMgr);

        expect(vi.mocked(fileApi.uploadAsset)).not.toHaveBeenCalled();
        expect(JSON.parse(result.content[0].text)).toEqual({
            success: false,
            requiresConfirmation: true,
            reason: 'file_too_large',
            localFilePath: expect.stringMatching(/tmp[\\/]+huge\.bin$/),
            fileSizeBytes: 10 * 1024 * 1024 + 1,
            thresholdBytes: 10 * 1024 * 1024,
            thresholdMB: 10,
            message: 'File exceeds the large-upload safety threshold (10 MB). Stop the current operation and ask the user for explicit confirmation before retrying with confirmLargeFile=true.',
        });
    });

    it('allows oversized uploads after explicit confirmation', async () => {
        const fileApi = await import('@/api/file');
        const fs = await import('fs');
        vi.spyOn(fs.default, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs.default, 'statSync').mockReturnValue({
            isFile: () => true,
            size: 10 * 1024 * 1024 + 1,
        } as any);
        vi.spyOn(fs.default, 'readFileSync').mockReturnValue(new Uint8Array([70]) as any);
        vi.mocked(fileApi.uploadAsset).mockResolvedValue({
            errFiles: [],
            succMap: { 'huge.bin': '/assets/huge.bin' },
        });

        const result = await callFileTool(client, {
            action: 'upload_asset',
            assetsDirPath: '/assets/',
            localFilePath: 'tmp/huge.bin',
            confirmLargeFile: true,
        }, enabledActions('upload_asset'), permMgr);

        expect(vi.mocked(fileApi.uploadAsset)).toHaveBeenCalled();
        expect(JSON.parse(result.content[0].text)).toEqual({
            errFiles: [],
            succMap: { 'huge.bin': '/assets/huge.bin' },
            localFilePath: expect.stringMatching(/tmp[\\/]+huge\.bin$/),
            uploadedFileName: 'huge.bin',
            largeFileConfirmed: true,
        });
    });

    it('uses the configured large upload threshold from file tool config', async () => {
        const fileApi = await import('@/api/file');
        const fs = await import('fs');
        vi.spyOn(fs.default, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs.default, 'statSync').mockReturnValue({
            isFile: () => true,
            size: 2 * 1024 * 1024,
        } as any);

        const result = await callFileTool(client, {
            action: 'upload_asset',
            assetsDirPath: '/assets/',
            localFilePath: 'tmp/custom-threshold.bin',
        }, {
            ...enabledActions('upload_asset'),
            uploadLargeFileThresholdMB: 1,
        }, permMgr);

        expect(vi.mocked(fileApi.uploadAsset)).not.toHaveBeenCalled();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.reason).toBe('file_too_large');
        expect(parsed.thresholdMB).toBe(1);
        expect(parsed.thresholdBytes).toBe(1024 * 1024);
    });

    it('adds a warning when block.update receives multi-line markdown', async () => {
        const blockApi = await import('@/api/block');
        vi.mocked(blockApi.updateBlock).mockResolvedValue({ updated: 1 });

        const result = await callBlockTool(client, {
            action: 'update',
            id: 'block-1',
            dataType: 'markdown',
            data: '# Title\n\n| A | B |\n| - | - |',
        }, enabledActions('update'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            success: true,
            id: 'block-1',
            dataType: 'markdown',
            markdown: '# Title\n\n| A | B |\n| - | - |',
            updated: 1,
            warning: 'block(update) is best for single-block replacement. Multi-line markdown may be truncated to the first line by SiYuan; use block(append), block(prepend), or block(insert) when you need multiple blocks or tables.',
        });
    });

    it('keeps block.update clean for single-line markdown', async () => {
        const blockApi = await import('@/api/block');
        vi.mocked(blockApi.updateBlock).mockResolvedValue({ updated: 1 });

        const result = await callBlockTool(client, {
            action: 'update',
            id: 'block-1',
            dataType: 'markdown',
            data: 'hello',
        }, enabledActions('update'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            success: true,
            id: 'block-1',
            dataType: 'markdown',
            markdown: 'hello',
            updated: 1,
        });
    });

    it('returns a workspace-specific error for render_template paths outside the workspace', async () => {
        const fileApi = await import('@/api/file');
        vi.mocked(fileApi.renderTemplate).mockRejectedValue(new Error('Path [/tmp/siyuan.tpl] is not in workspace'));

        const result = await callFileTool(client, {
            action: 'render_template',
            id: 'doc-1',
            path: '/tmp/siyuan.tpl',
        }, enabledActions('render_template'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            error: {
                type: 'api_error',
                tool: 'file',
                action: 'render_template',
                message: 'Path [/tmp/siyuan.tpl] is not in workspace',
                reason: 'path_not_in_workspace',
                workspacePathRequired: true,
                hint: 'The template path must point to a file inside the SiYuan workspace, not an arbitrary local path such as /tmp/... or your repo checkout.',
            },
        });
    });

    it('keeps html mode routed through document.getDoc', async () => {
        const documentApi = await import('@/api/document');
        vi.mocked(documentApi.getDoc).mockResolvedValue({
            content: '<div>doc</div>',
            extra: 'value',
        });

        const result = await callDocumentTool(client, {
            action: 'get_doc',
            id: 'doc-1',
            mode: 'html',
        }, enabledActions('get_doc'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            id: 'doc-1',
            mode: 'html',
            content: '<div>doc</div>',
            extra: 'value',
        });
    });

    it('paginates markdown content for document.get_doc', async () => {
        const fileApi = await import('@/api/file');
        vi.mocked(fileApi.exportMdContent).mockResolvedValue({
            hPath: '/Doc',
            content: 'abcdefghij',
        });

        const result = await callDocumentTool(client, {
            action: 'get_doc',
            id: 'doc-1',
            mode: 'markdown',
            page: 2,
            pageSize: 4,
        }, enabledActions('get_doc'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            id: 'doc-1',
            mode: 'markdown',
            hPath: '/Doc',
            content: 'efgh',
            truncated: true,
            contentLength: 10,
            showing: 4,
            page: 2,
            pageSize: 4,
            pageCount: 3,
            hasNextPage: true,
            hint: 'Use page/pageSize to read the next markdown chunk. For structured reads, use document(action="get_child_blocks") or block(action="get_kramdown").',
        });
    });

    it('returns slim payload for block.update', async () => {
        const blockApi = await import('@/api/block');
        vi.mocked(blockApi.updateBlock).mockResolvedValue({
            doOperations: [{ id: 'block-1' }],
            undoOperations: null,
        } as any);

        const result = await callBlockTool(client, {
            action: 'update',
            id: 'block-1',
            dataType: 'markdown',
            data: 'updated\u200B text',
        }, enabledActions('update'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            success: true,
            id: 'block-1',
            dataType: 'markdown',
            markdown: 'updated text',
        });
    });

    it('cleans zero-width chars for file.export_md and block.get_kramdown', async () => {
        const fileApi = await import('@/api/file');
        const blockApi = await import('@/api/block');
        vi.mocked(fileApi.exportMdContent).mockResolvedValue({
            hPath: '/Doc',
            content: '\u200B#tag#\u200B',
        });
        vi.mocked(blockApi.getBlockKramdown).mockResolvedValue({
            id: 'block-1',
            kramdown: '\u200B#tag#\u200B',
        } as any);

        const exportResult = await callFileTool(client, {
            action: 'export_md',
            id: 'doc-1',
        }, enabledActions('export_md'), permMgr);
        const kramdownResult = await callBlockTool(client, {
            action: 'get_kramdown',
            id: 'block-1',
        }, enabledActions('get_kramdown'), permMgr);

        expect(JSON.parse(exportResult.content[0].text).content).toBe('#tag#');
        expect(JSON.parse(kramdownResult.content[0].text).kramdown).toBe('#tag#');
    });

    it('normalizes document cover sources into title-img attributes', async () => {
        const attributeApi = await import('@/api/attribute');

        const result = await callDocumentTool(client, {
            action: 'set_cover',
            id: 'doc-1',
            source: ' /assets/covers/demo "cover".png ',
        }, enabledActions('set_cover'), permMgr);

        expect(vi.mocked(attributeApi.setBlockAttrs)).toHaveBeenCalledWith(client, 'doc-1', {
            'title-img': 'background-image:url("/assets/covers/demo \\"cover\\".png");',
        });
        expect(JSON.parse(result.content[0].text)).toEqual({
            success: true,
            id: 'doc-1',
            source: '/assets/covers/demo "cover".png',
            titleImg: 'background-image:url("/assets/covers/demo \\"cover\\".png");',
        });
    });

    it('clears document cover attributes', async () => {
        const attributeApi = await import('@/api/attribute');

        const result = await callDocumentTool(client, {
            action: 'clear_cover',
            id: 'doc-1',
        }, enabledActions('clear_cover'), permMgr);

        expect(vi.mocked(attributeApi.setBlockAttrs)).toHaveBeenCalledWith(client, 'doc-1', {
            'title-img': '',
        });
        expect(JSON.parse(result.content[0].text)).toEqual({
            success: true,
            id: 'doc-1',
            cleared: true,
        });
    });

    it('adds plainContent when search.fulltext stripHtml is enabled', async () => {
        const searchApi = await import('@/api/search');
        vi.mocked(searchApi.fullTextSearchBlock).mockResolvedValue({
            blocks: [{ id: 'b1', content: 'before <mark>hit</mark> after' }],
            matchedBlockCount: 1,
            matchedRootCount: 1,
            pageCount: 1,
        });

        const result = await callSearchTool(client, {
            action: 'fulltext',
            query: 'hit',
            stripHtml: true,
        }, enabledActions('fulltext'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            blocks: [{ id: 'b1', content: 'before <mark>hit</mark> after', plainContent: 'before hit after' }],
            matchedBlockCount: 1,
            matchedRootCount: 1,
            pageCount: 1,
        });
    });

    it('paginates block.get_children results', async () => {
        const blockApi = await import('@/api/block');
        vi.mocked(blockApi.getChildBlocks).mockResolvedValue([
            { id: 'child-1' },
            { id: 'child-2' },
            { id: 'child-3' },
            { id: 'child-4' },
            { id: 'child-5' },
        ] as any);

        const result = await callBlockTool(client, {
            action: 'get_children',
            id: 'doc-1',
            page: 2,
            pageSize: 2,
        }, enabledActions('get_children'), permMgr);

        expect(JSON.parse(result.content[0].text)).toEqual({
            children: [
                { id: 'child-3' },
                { id: 'child-4' },
            ],
            totalChildren: 5,
            page: 2,
            pageSize: 2,
            pageCount: 3,
            showing: 2,
            truncated: true,
            hasNextPage: true,
            hint: 'Use page/pageSize to paginate. For focused reads, use block(action="get_kramdown") or search(action="query_sql") with a parent_id filter.',
        });
    });
});

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { preflightLocalAssets, renderInsertedAssetMarkdown } from '@/tools/file/asset-ingestion';

describe('asset ingestion', () => {
    it('classifies images, files, and directories while preserving order', async () => {
        const root = mkdtempSync(path.join(os.tmpdir(), 'sisyphus-assets-'));
        const image = path.join(root, 'chart.PNG');
        const file = path.join(root, 'notes.pdf');
        const directory = path.join(root, 'sources');
        writeFileSync(image, 'image');
        writeFileSync(file, 'pdf');
        mkdirSync(directory);

        const result = await preflightLocalAssets([
            { localPath: image, name: '图表', title: '收入结构' },
            { localPath: file },
            { localPath: directory },
        ], 1024);

        expect(result.items.map((item) => item.kind)).toEqual(['image', 'file', 'directory']);
        expect(result.items.map((item) => item.localPath)).toEqual([image, file, directory]);
        expect(result.largeFiles).toEqual([]);
    });

    it('rejects duplicate basenames before upload', async () => {
        const root = mkdtempSync(path.join(os.tmpdir(), 'sisyphus-assets-'));
        const first = path.join(root, 'a', 'same.txt');
        const second = path.join(root, 'b', 'same.txt');
        mkdirSync(path.dirname(first));
        mkdirSync(path.dirname(second));
        writeFileSync(first, 'a');
        writeFileSync(second, 'b');

        await expect(preflightLocalAssets([{ localPath: first }, { localPath: second }], 1024))
            .rejects.toThrow('Duplicate asset basename');
    });

    it('reports large files without scanning directory contents', async () => {
        const root = mkdtempSync(path.join(os.tmpdir(), 'sisyphus-assets-'));
        const file = path.join(root, 'large.bin');
        const directory = path.join(root, 'folder');
        writeFileSync(file, Buffer.alloc(32));
        mkdirSync(directory);
        writeFileSync(path.join(directory, 'nested.bin'), Buffer.alloc(64));

        const result = await preflightLocalAssets([{ localPath: file }, { localPath: directory }], 16);

        expect(result.largeFiles).toEqual([{ localPath: file, sizeBytes: 32 }]);
    });

    it('renders markdown using resolved SiYuan paths', () => {
        expect(renderInsertedAssetMarkdown({
            localPath: '/tmp/chart.png',
            basename: 'chart.png',
            kind: 'image',
            name: '图表',
            title: '收入结构',
        }, 'assets/chart-abc.png')).toBe('![图表](assets/chart-abc.png "收入结构")');
        expect(renderInsertedAssetMarkdown({
            localPath: '/tmp/spec.pdf',
            basename: 'spec.pdf',
            kind: 'file',
            name: 'spec.pdf',
        }, 'assets/spec-abc.pdf')).toBe('[spec.pdf](assets/spec-abc.pdf)');
        expect(renderInsertedAssetMarkdown({
            localPath: '/tmp/source',
            basename: 'source',
            kind: 'directory',
            name: 'source',
        }, 'file:///tmp/source')).toBe('[source](file:///tmp/source)');
    });
});

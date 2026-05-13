import { describe, expect, it } from 'vitest';

import {
    buildChangedFiles,
    diffBlocks,
    diffSnapshotBlocks,
    getDocumentIdFromSnapshotFile,
    getRestoreParentCandidates,
    getSnapshotFileId,
    parseSnapshotBlocks,
} from '@/ui/version-control/block-diff';

describe('snapshot block diff', () => {
    it('parses JSON snapshot blocks recursively', () => {
        const blocks = parseSnapshotBlocks(JSON.stringify({
            id: '20260514120000-aaaaaaa',
            type: 'd',
            title: 'Doc',
            children: [
                { id: '20260514120001-bbbbbbb', rootID: '20260514120000-aaaaaaa', type: 'h', markdown: '# Title' },
                { id: '20260514120002-ccccccc', rootID: '20260514120000-aaaaaaa', parentID: '20260514120001-bbbbbbb', type: 'p', content: 'Body' },
            ],
        }));

        expect(blocks.map((block) => block.id)).toEqual([
            '20260514120000-aaaaaaa',
            '20260514120001-bbbbbbb',
            '20260514120002-ccccccc',
        ]);
        expect(blocks[2].text).toBe('Body');
        expect(blocks[2].rootID).toBe('20260514120000-aaaaaaa');
        expect(blocks[2].parentID).toBe('20260514120001-bbbbbbb');
    });

    it('classifies added, removed, modified, and unchanged blocks', () => {
        const entries = diffBlocks(
            [
                { id: 'a', type: 'p', text: 'same', markdown: 'same', order: 0, depth: 0 },
                { id: 'b', type: 'p', text: 'old', markdown: 'old', order: 1, depth: 0 },
                { id: 'c', type: 'p', text: 'gone', markdown: 'gone', order: 2, depth: 0 },
            ],
            [
                { id: 'a', type: 'p', text: 'same', markdown: 'same', order: 0, depth: 0 },
                { id: 'b', type: 'p', text: 'new', markdown: 'new', order: 1, depth: 0 },
                { id: 'd', type: 'p', text: 'added', markdown: 'added', order: 2, depth: 0 },
            ],
        );

        expect(entries.map((entry) => entry.status)).toEqual(['unchanged', 'modified', 'removed', 'added']);
        expect(entries.filter((entry) => entry.status !== 'unchanged').every((entry) => entry.canAcceptBlock)).toBe(true);
    });

    it('falls back to markdown paragraph parsing', () => {
        const entries = diffSnapshotBlocks('A paragraph\n\nOld paragraph', 'A paragraph\n\nNew paragraph');

        expect(entries.some((entry) => entry.status === 'unchanged')).toBe(true);
        expect(entries.some((entry) => entry.status === 'modified')).toBe(true);
    });

    it('parses SiYuan block DOM into displayable blocks', () => {
        const blocks = parseSnapshotBlocks(`
            <div data-node-id="20260514120003-ddddddd" data-type="NodeParagraph">Old <strong>text</strong></div>
            <div data-node-id="20260514120004-eeeeeee" data-type="NodeHeading" data-subtype="h2" data-root-id="20260514120000-aaaaaaa" data-parent-id="20260514120003-ddddddd">Heading</div>
        `);

        expect(blocks).toMatchObject([
            { id: '20260514120003-ddddddd', type: 'p', text: 'Old text' },
            { id: '20260514120004-eeeeeee', type: 'h', subtype: 'h2', rootID: '20260514120000-aaaaaaa', parentID: '20260514120003-ddddddd', text: 'Heading' },
        ]);
    });

    it('builds restore parent candidates from block metadata before file fallback', () => {
        const candidates = getRestoreParentCandidates({
            key: 'removed',
            status: 'removed',
            canAcceptBlock: true,
            oldBlock: {
                id: '20260514120005-fffffff',
                parentID: '20260514120003-ddddddd',
                rootID: '20260514120000-aaaaaaa',
                type: 'p',
                text: 'Gone',
                markdown: 'Gone',
                order: 0,
                depth: 0,
            },
        }, {
            documentId: '20260514120009-iiiiiii',
            oldFile: { path: '/box/path/20260514120008-hhhhhhh.sy' },
        });

        expect(candidates).toEqual([
            '20260514120003-ddddddd',
            '20260514120000-aaaaaaa',
            '20260514120009-iiiiiii',
            '20260514120008-hhhhhhh',
        ]);
    });

    it('uses fileID from repo diff files before id', () => {
        expect(getSnapshotFileId({ id: 'legacy-id', fileID: 'repo-file-id' })).toBe('repo-file-id');
        expect(getSnapshotFileId({ id: 'legacy-id' })).toBe('legacy-id');
    });

    it('pairs modified files by path/title and preserves fileID values', () => {
        const files = buildChangedFiles({
            updatesLeft: [{ fileID: 'left-file', title: 'Doc', path: '/nb/doc.sy' }],
            updatesRight: [{ fileID: 'right-file', title: 'Doc', path: '/nb/doc.sy' }],
        });

        expect(files).toHaveLength(1);
        expect(files[0]).toMatchObject({
            kind: 'modified',
            title: 'Doc',
            oldFile: { fileID: 'left-file' },
            newFile: { fileID: 'right-file' },
        });
    });

    it('filters repo diff files to SiYuan .sy documents only', () => {
        const files = buildChangedFiles({
            updatesLeft: [
                { fileID: 'doc-left', title: 'Doc', path: '/nb/doc.sy' },
                { fileID: 'conf-left', title: 'Conf', path: '/conf/conf.json' },
            ],
            updatesRight: [
                { fileID: 'doc-right', title: 'Doc', path: '/nb/doc.sy' },
                { fileID: 'conf-right', title: 'Conf', path: '/conf/conf.json' },
            ],
            addsLeft: [{ fileID: 'asset', title: 'Asset', path: '/assets/a.png' }],
            removesRight: [{ fileID: 'settings', title: 'Settings', path: '/storage/settings.json' }],
        });

        expect(files).toHaveLength(1);
        expect(files[0].title).toBe('Doc');
    });

    it('extracts document ids from snapshot file paths', () => {
        expect(getDocumentIdFromSnapshotFile({ path: '/data/20260514120000-aaaaaaa.sy' })).toBe('20260514120000-aaaaaaa');
        expect(getDocumentIdFromSnapshotFile({ docID: '20260514120001-bbbbbbb' })).toBe('20260514120001-bbbbbbb');
    });
});

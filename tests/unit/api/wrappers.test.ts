import { describe, expect, it, vi } from 'vitest';

import * as blockApi from '@/api/block';
import * as documentApi from '@/api/document';
import * as historyApi from '@/api/history';
import * as notebookApi from '@/api/notebook';
import * as repoApi from '@/api/repo';
import * as tagApi from '@/api/tag';
import { performTransactions } from '@/api/transaction';

function createClient() {
    const request = vi.fn(async () => null);
    return {
        request,
        requestRead: request,
        requestWrite: request,
    } as any;
}

describe('api wrapper payloads', () => {
    it('routes notebook wrappers with exact payload shapes', async () => {
        const client = createClient();

        await notebookApi.listNotebooks(client);
        await notebookApi.getNotebookConf(client, 'nb-1');
        await notebookApi.setNotebookConf(client, 'nb-1', { closed: false });

        expect(client.request.mock.calls).toEqual([
            ['/api/notebook/lsNotebooks'],
            ['/api/notebook/getNotebookConf', { notebook: 'nb-1' }],
            ['/api/notebook/setNotebookConf', { notebook: 'nb-1', conf: { closed: false } }],
        ]);
    });

    it('routes repo and history wrappers with exact payload shapes', async () => {
        const client = createClient();

        await repoApi.createSnapshot(client, 'commit memo');
        await repoApi.tagSnapshot(client, 'snap-1', 'release');
        await repoApi.getRepoSnapshots(client, 2);
        await repoApi.getRepoTagSnapshots(client);
        await repoApi.removeRepoTagSnapshot(client, 'release');
        await repoApi.diffRepoSnapshots(client, 'left', 'right');
        await repoApi.openRepoSnapshotFile(client, 'file-1');
        await repoApi.rollbackRepoSnapshotFile(client, 'file-1');

        await historyApi.searchHistory(client, { notebook: 'nb-1', query: 'hello', page: 3 });
        await historyApi.getHistoryItems(client, { created: '20260514', notebook: 'nb-1' });
        await historyApi.getDocHistoryContent(client, '/history/doc.sy', 'hello', true);
        await historyApi.rollbackDocHistory(client, 'nb-1', '/history/doc.sy');

        expect(client.request.mock.calls).toEqual([
            ['/api/repo/createSnapshot', { memo: 'commit memo' }],
            ['/api/repo/tagSnapshot', { id: 'snap-1', name: 'release' }],
            ['/api/repo/getRepoSnapshots', { page: 2 }],
            ['/api/repo/getRepoTagSnapshots', {}],
            ['/api/repo/removeRepoTagSnapshot', { tag: 'release' }],
            ['/api/repo/diffRepoSnapshots', { left: 'left', right: 'right' }],
            ['/api/repo/openRepoSnapshotFile', { id: 'file-1' }],
            ['/api/repo/rollbackRepoSnapshotFile', { id: 'file-1' }],
            ['/api/history/searchHistory', { notebook: 'nb-1', query: 'hello', page: 3 }],
            ['/api/history/getHistoryItems', { created: '20260514', notebook: 'nb-1' }],
            ['/api/history/getDocHistoryContent', { historyPath: '/history/doc.sy', keyword: 'hello', highlight: true }],
            ['/api/history/rollbackDocHistory', { notebook: 'nb-1', historyPath: '/history/doc.sy' }],
        ]);
    });

    it('routes block wrappers including batch and daily-note payloads', async () => {
        const client = createClient();

        await blockApi.insertBlock(client, 'markdown', 'hello', 'next', 'prev', 'parent');
        await blockApi.insertBlock(client, { dataType: 'markdown', data: 'raw', parentID: 'parent' });
        await blockApi.moveBlock(client, 'block-1', 'prev', 'parent');
        await blockApi.transferBlockRef(client, 'from', 'to', ['ref']);
        await blockApi.batchInsertBlock(client, [{ dataType: 'markdown', data: 'a', parentID: 'doc-1' }]);
        await blockApi.batchUpdateBlock(client, [{ id: 'b', dataType: 'markdown', data: 'b' }]);
        await blockApi.getDocsInfo(client, ['doc-1'], true, true);
        await blockApi.setBlockAttrs(client, 'block-1', { memo: 'note' });
        await blockApi.getBlockAttrs(client, 'block-1');

        expect(client.request.mock.calls).toEqual([
            ['/api/block/insertBlock', { dataType: 'markdown', data: 'hello', nextID: 'next', previousID: 'prev', parentID: 'parent' }],
            ['/api/block/insertBlock', { dataType: 'markdown', data: 'raw', parentID: 'parent' }],
            ['/api/block/moveBlock', { id: 'block-1', previousID: 'prev', parentID: 'parent' }],
            ['/api/block/transferBlockRef', { fromID: 'from', toID: 'to', refIDs: ['ref'] }],
            ['/api/block/batchInsertBlock', { blocks: [{ dataType: 'markdown', data: 'a', parentID: 'doc-1' }] }],
            ['/api/block/batchUpdateBlock', { blocks: [{ id: 'b', dataType: 'markdown', data: 'b' }] }],
            ['/api/block/getDocsInfo', { ids: ['doc-1'], refCount: true, av: true }],
            ['/api/attr/setBlockAttrs', { id: 'block-1', attrs: { memo: 'note' } }],
            ['/api/attr/getBlockAttrs', { id: 'block-1' }],
        ]);
    });

    it('routes document wrappers with path, id, and conversion payloads', async () => {
        const client = createClient();

        await documentApi.createDoc(client, 'nb-1', '/Doc', 'md');
        await documentApi.renameDoc(client, 'nb-1', '/Doc.sy', 'Renamed');
        await documentApi.renameDocByID(client, 'doc-1', 'Renamed');
        await documentApi.moveDocs(client, ['/a.sy'], 'nb-2', '/target');
        await documentApi.moveDocsByID(client, ['doc-1'], 'parent');
        await documentApi.searchDocs(client, 'query', ['skip']);
        await documentApi.createEmptyDoc(client, 'nb-1', '/Parent', 'Title', 'md', ['Title']);

        expect(client.request.mock.calls).toEqual([
            ['/api/filetree/createDocWithMd', { notebook: 'nb-1', path: '/Doc', markdown: 'md' }],
            ['/api/filetree/renameDoc', { notebook: 'nb-1', path: '/Doc.sy', title: 'Renamed' }],
            ['/api/filetree/renameDocByID', { id: 'doc-1', title: 'Renamed' }],
            ['/api/filetree/moveDocs', { fromPaths: ['/a.sy'], toNotebook: 'nb-2', toPath: '/target' }],
            ['/api/filetree/moveDocsByID', { fromIDs: ['doc-1'], toID: 'parent' }],
            ['/api/filetree/searchDocs', { k: 'query', excludeIDs: ['skip'] }],
            ['/api/filetree/createDoc', { notebook: 'nb-1', path: '/Parent', title: 'Title', md: 'md', sorts: ['Title'] }],
        ]);
    });

    it('routes tag and transaction wrappers', async () => {
        const client = createClient();
        vi.spyOn(Date, 'now').mockReturnValue(1234);

        await tagApi.listTags(client);
        await tagApi.listTags(client, { sort: 1, ignoreMaxListHint: true, app: 'custom' });
        await tagApi.renameTag(client, 'old', 'new');
        await tagApi.removeTag(client, 'old');

        await performTransactions(client, [{ doOperations: [{ action: 'insert', id: 'b' }], undoOperations: [] }]);

        expect(client.request.mock.calls).toEqual([
            ['/api/tag/getTag', { app: 'siyuan-mcp-sisyphus' }],
            ['/api/tag/getTag', { sort: 1, ignoreMaxListHint: true, app: 'custom' }],
            ['/api/tag/renameTag', { oldLabel: 'old', newLabel: 'new' }],
            ['/api/tag/removeTag', { label: 'old' }],
            ['/api/transactions', {
                transactions: [{ doOperations: [{ action: 'insert', id: 'b' }], undoOperations: [] }],
                reqId: 1234,
                app: '',
                session: '',
            }],
        ]);
    });
});

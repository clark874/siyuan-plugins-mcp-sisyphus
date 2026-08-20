import { describe, expect, it } from 'vitest';

import { SiYuanError } from '@/shared/error';
import {
    NOTEBOOK_ROOT_TREE_MAX_CONCURRENCY,
    listDocumentSubtreeNodes,
    listNotebookRootTreeNodes,
} from '@/tools/internal/helpers/doc-tree';
import { createMockClient } from '../../../helpers/mock-client';

function topLevelFiles(count: number) {
    return Array.from({ length: count }, (_, index) => ({
        id: `doc-${index}`,
        box: 'notebook-1',
        path: `/doc-${index}.sy`,
        name: `Doc ${index}.sy`,
    }));
}

describe('notebook root tree helper', () => {
    it('rechecks direct children after a concurrent leaf transition', async () => {
        let childReads = 0;
        const client = createMockClient({
            request: async (endpoint) => {
                if (endpoint === '/api/filetree/listDocsByPath') {
                    childReads += 1;
                    return childReads === 1
                        ? { box: 'notebook-1', files: [{ id: 'child-1', path: '/doc-1/child-1.sy' }] }
                        : { box: 'notebook-1', files: [] };
                }
                if (endpoint === '/api/filetree/listDocTree') {
                    throw new SiYuanError(-1, 'open /workspace/data/notebook-1/doc-1: no such file or directory');
                }
                return null;
            },
        });

        await expect(listDocumentSubtreeNodes(client, 'notebook-1', '/doc-1.sy')).resolves.toEqual([]);
        expect(childReads).toBe(2);
    });

    it('treats top-level leaf documents as healthy empty subtrees', async () => {
        const files = topLevelFiles(3).map((file) => ({ ...file, subFileCount: 0 }));
        const client = createMockClient({
            request: async (endpoint, body) => {
                if (endpoint === '/api/filetree/listDocsByPath') return { box: 'notebook-1', files };
                if (endpoint === '/api/filetree/listDocTree') {
                    throw new SiYuanError(-1, `open /workspace/data/notebook-1/${String(body?.path).replace(/\.sy$/, '')}: no such file or directory`);
                }
                return null;
            },
        });

        const result = await listNotebookRootTreeNodes(client, 'notebook-1');

        expect(result.nodes).toEqual(files.map((file) => ({ id: file.id, children: [] })));
        expect(result.partial).toBe(false);
        expect(result.failedTopLevelDocumentCount).toBe(0);
        expect(result.errors).toEqual([]);
    });

    it('limits concurrent top-level subtree reads and preserves document order', async () => {
        const files = topLevelFiles(NOTEBOOK_ROOT_TREE_MAX_CONCURRENCY + 4);
        let running = 0;
        let maxRunning = 0;
        const client = createMockClient({
            request: async (endpoint) => {
                if (endpoint === '/api/filetree/listDocsByPath') return { box: 'notebook-1', files };
                if (endpoint === '/api/filetree/listDocTree') {
                    running += 1;
                    maxRunning = Math.max(maxRunning, running);
                    await new Promise<void>((resolve) => setTimeout(resolve, 5));
                    running -= 1;
                    return { tree: [] };
                }
                return null;
            },
        });

        const result = await listNotebookRootTreeNodes(client, 'notebook-1');

        expect(result.nodes.map((node) => (node as { id: string }).id)).toEqual(files.map((file) => file.id));
        expect(maxRunning).toBe(NOTEBOOK_ROOT_TREE_MAX_CONCURRENCY);
        expect(result).toMatchObject({
            partial: false,
            errors: [],
            topLevelDocumentCount: files.length,
            failedTopLevelDocumentCount: 0,
        });
    });

    it('keeps the top-level node but reports a failed subtree explicitly', async () => {
        const files = topLevelFiles(3);
        const client = createMockClient({
            request: async (endpoint, body) => {
                if (endpoint === '/api/filetree/listDocsByPath') return { box: 'notebook-1', files };
                if (endpoint === '/api/filetree/listDocTree') {
                    if (body?.path === '/doc-1.sy') throw new SiYuanError(-1, 'subtree unavailable');
                    return { tree: [] };
                }
                return null;
            },
        });

        const result = await listNotebookRootTreeNodes(client, 'notebook-1');

        expect(result.nodes).toHaveLength(3);
        expect(result.nodes[1]).toMatchObject({ id: 'doc-1', children: [] });
        expect(result.partial).toBe(true);
        expect(result.failedTopLevelDocumentCount).toBe(1);
        expect(result.errors).toEqual([expect.objectContaining({
            type: 'subtree_read_failed',
            documentId: 'doc-1',
            name: 'Doc 1',
            storagePath: '/doc-1.sy',
            message: expect.stringContaining('subtree unavailable'),
        })]);
    });
});

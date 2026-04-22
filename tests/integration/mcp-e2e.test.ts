import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SiYuanClient } from '@/api/client';
import * as notebookApi from '@/api/notebook';
import * as documentApi from '@/api/document';
import * as blockApi from '@/api/block';
import * as fileApi from '@/api/file';
import * as searchApi from '@/api/search';
import { PermissionManager } from '@/core/permissions';

describe('MCP End-to-End Flow', () => {
    let client: SiYuanClient;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockFetch = vi.fn();
        global.fetch = mockFetch;

        client = new SiYuanClient({
            baseUrl: 'http://127.0.0.1:6806',
            timeout: 5000,
        });
    });

    describe('Notebook API Flow', () => {
        it('should list notebooks successfully', async () => {
            const notebooksData = {
                notebooks: [
                    { id: 'nb1', name: 'Notebook 1', icon: '1f4d4', sort: 0, closed: false },
                    { id: 'nb2', name: 'Notebook 2', icon: '', sort: 1, closed: true },
                ],
            };

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ code: 0, msg: 'success', data: notebooksData }),
            } as Response);

            const result = await notebookApi.listNotebooks(client);
            expect(result).toEqual(notebooksData);
            expect(result.notebooks).toHaveLength(2);
        });

        it('should create notebook and return result', async () => {
            const createdData = { notebook: 'nb-new' };

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ code: 0, msg: 'success', data: createdData }),
            } as Response);

            const result = await notebookApi.createNotebook(client, 'New Notebook');
            expect(result).toEqual(createdData);
        });

        it('should handle notebook not found error', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ code: 3, msg: 'Data not found', data: null }),
            } as Response);

            await expect(notebookApi.openNotebook(client, 'non-existent')).rejects.toThrow();
        });
    });

    describe('Document API Flow', () => {
        it('should create document and return path info', async () => {
            const docData = {
                notebook: 'nb1',
                path: '/Test Document.sy',
                hPath: '/Test Document',
            };

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ code: 0, msg: 'success', data: docData }),
            } as Response);

            const result = await documentApi.createDoc(client, 'nb1', '/Test Document', '');
            expect(result).toEqual(docData);
        });

        it('should get document path by ID', async () => {
            const pathData = {
                box: 'nb1',
                hPath: '/Parent/Child',
                path: '/Parent/Child.sy',
            };

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ code: 0, msg: 'success', data: pathData }),
            } as Response);

            const result = await documentApi.getPathByID(client, 'doc123');
            expect(result).toEqual(pathData);
            expect(result.box).toBe('nb1');
        });

        it('should rename document', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ code: 0, msg: 'success', data: null }),
            } as Response);

            await expect(documentApi.renameDoc(client, 'nb1', '/Old Name.sy', 'New Name')).resolves.not.toThrow();
        });
    });

    describe('Block API Flow', () => {
        it('should insert block successfully', async () => {
            const blockData = [{ id: 'block123', content: 'Test content' }];

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ code: 0, msg: 'success', data: blockData }),
            } as Response);

            const result = await blockApi.insertBlock(client, {
                dataType: 'markdown',
                data: 'Test content',
                parentID: 'doc123',
            });
            expect(result).toEqual(blockData);
            expect(result[0].id).toBe('block123');
        });

        it('should get block children', async () => {
            const childrenData = [
                { id: 'child1', type: 'p', content: 'Child 1' },
                { id: 'child2', type: 'p', content: 'Child 2' },
            ];

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ code: 0, msg: 'success', data: childrenData }),
            } as Response);

            const result = await blockApi.getChildBlocks(client, 'parent123');
            expect(result).toHaveLength(2);
        });

        it('should delete block', async () => {
            const deleteData = [{ id: 'block123', content: 'deleted' }];
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ code: 0, msg: 'success', data: deleteData }),
            } as Response);

            const result = await blockApi.deleteBlock(client, 'block123');
            expect(result).toEqual(deleteData);
        });
    });

    describe('Search API Flow', () => {
        it('should perform fulltext search', async () => {
            const searchData = {
                blocks: [
                    { id: 'block1', content: 'Test result 1', hPath: '/Doc 1' },
                    { id: 'block2', content: 'Test result 2', hPath: '/Doc 2' },
                ],
                matchedRootCount: 2,
                matchedBlockCount: 2,
            };

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ code: 0, msg: 'success', data: searchData }),
            } as Response);

            const result = await searchApi.fullTextSearchBlock(client, { query: 'test' });
            expect(result.blocks).toHaveLength(2);
            expect(result.matchedBlockCount).toBe(2);
        });

        it('should search tags', async () => {
            const tagsData = {
                tags: [
                    { label: 'tag1', count: 5 },
                    { label: 'tag2', count: 3 },
                ],
            };

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ code: 0, msg: 'success', data: tagsData }),
            } as Response);

            const result = await searchApi.searchTag(client, 'tag');
            expect(result.tags).toHaveLength(2);
        });
    });

    describe('File API Flow', () => {
        it('should render template', async () => {
            const templateData = { content: 'Rendered content' };

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ code: 0, msg: 'success', data: templateData }),
            } as Response);

            const result = await fileApi.renderTemplate(client, { id: 'tpl123' });
            expect(result).toEqual(templateData);
        });
    });

    describe('Permission Manager Integration', () => {
        it('should check read permission', async () => {
            // readFile returns text, not JSON
            mockFetch.mockResolvedValue({
                ok: true,
                text: async () => JSON.stringify({ nb1: 'r' }),
            } as Response);

            const permMgr = new PermissionManager(client);
            await permMgr.load();

            expect(permMgr.canRead('nb1')).toBe(true);
            expect(permMgr.canWrite('nb1')).toBe(false);
        });

        it('should deny access for none permission', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                text: async () => JSON.stringify({ nb1: 'none' }),
            } as Response);

            const permMgr = new PermissionManager(client);
            await permMgr.load();

            expect(permMgr.canRead('nb1')).toBe(false);
            expect(permMgr.canWrite('nb1')).toBe(false);
        });

        it('should allow full access for write permission', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                text: async () => JSON.stringify({ nb1: 'rwd' }),
            } as Response);

            const permMgr = new PermissionManager(client);
            await permMgr.load();

            expect(permMgr.canRead('nb1')).toBe(true);
            expect(permMgr.canWrite('nb1')).toBe(true);
            expect(permMgr.canDelete('nb1')).toBe(true);
        });

        it('should allow write but deny delete for rw permission', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                text: async () => JSON.stringify({ nb1: 'rw' }),
            } as Response);

            const permMgr = new PermissionManager(client);
            await permMgr.load();

            expect(permMgr.canRead('nb1')).toBe(true);
            expect(permMgr.canWrite('nb1')).toBe(true);
            expect(permMgr.canDelete('nb1')).toBe(false);
        });
    });

    describe('Error Handling Flow', () => {
        it('should handle network errors gracefully', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));

            await expect(notebookApi.listNotebooks(client)).rejects.toThrow('Network error');
        });

        it('should handle timeout errors', async () => {
            mockFetch.mockImplementation(() => new Promise((_, reject) => {
                setTimeout(() => {
                    const error = new Error('AbortError');
                    error.name = 'AbortError';
                    reject(error);
                }, 10);
            }));

            const timeoutClient = new SiYuanClient({ timeout: 5 });
            await expect(notebookApi.listNotebooks(timeoutClient)).rejects.toThrow();
        });

        it('should handle malformed JSON responses', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => { throw new SyntaxError('Unexpected token'); },
            } as Response);

            await expect(notebookApi.listNotebooks(client)).rejects.toThrow();
        });
    });
});

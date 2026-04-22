import { describe, expect, it, vi } from 'vitest';

import { buildDefaultToolConfig } from '@/mcp/config';
import { normalizeFullTextSearchResult } from '@/mcp/normalize';
import { callSearchTool, filterBacklinkResultByPermission, filterFullTextSearchResultByPermission, listSearchTools } from '@/mcp/tools/search';
import { createMockClient } from '../../../helpers/mock-client';
import { parseResult } from '../../../helpers/parse-result';

describe('search tool filtering', () => {
    it('filters fulltext search results by notebook permission and preserves plainContent', () => {
        const permMgr = {
            canRead(notebookId: string) {
                return notebookId !== 'blocked';
            },
        };

        const filtered = filterFullTextSearchResultByPermission({
            blocks: [
                { id: '1', box: 'allowed', rootID: 'doc-1', content: '<mark>MCP</mark> note' },
                { id: '2', box: 'blocked', rootID: 'doc-2', content: '<mark>Secret</mark> note' },
            ],
            matchedBlockCount: 2,
            matchedRootCount: 2,
            pageCount: 1,
        }, permMgr as never);

        const normalized = normalizeFullTextSearchResult(filtered, true) as {
            blocks: Array<Record<string, unknown>>;
            matchedBlockCount: number;
            matchedRootCount: number;
            filteredOutBlockCount?: number;
        };

        expect(normalized.blocks).toHaveLength(1);
        expect(normalized.blocks[0].plainContent).toBe('MCP note');
        expect(normalized.matchedBlockCount).toBe(1);
        expect(normalized.matchedRootCount).toBe(1);
        expect(normalized.filteredOutBlockCount).toBe(1);
    });

    it('filters backlink-style result sets by notebook permission', () => {
        const permMgr = {
            canRead(notebookId: string) {
                return notebookId !== 'blocked';
            },
        };

        const filtered = filterBacklinkResultByPermission({
            backlinks: [
                { id: '1', box: 'allowed' },
                { id: '2', box: 'blocked' },
            ],
            backmentions: [
                { id: '3', notebook: 'allowed' },
                { id: '4', notebook: 'blocked' },
            ],
        }, permMgr as never) as {
            backlinks: unknown[];
            backmentions: unknown[];
            filteredOutCount?: number;
            partial?: boolean;
            reason?: string;
        };

        expect(filtered.backlinks).toHaveLength(1);
        expect(filtered.backmentions).toHaveLength(1);
        expect(filtered.filteredOutCount).toBe(2);
        expect(filtered.partial).toBe(true);
        expect(filtered.reason).toBe('permission_filtered');
    });

    it('exposes high-priority search actions in the grouped schema', () => {
        const config = buildDefaultToolConfig();
        const [tool] = listSearchTools(config.search);
        expect(tool.inputSchema.properties.action.enum).toContain('search_refs');
        expect(tool.inputSchema.properties.action.enum).toContain('find_replace');
        expect(tool.inputSchema.properties.action.enum).toContain('search_assets');
        expect(tool.inputSchema.properties.action.enum).toContain('list_invalid_refs');
    });

    it('calls search asset endpoint', async () => {
        const client = createMockClient({
            request: async (endpoint: string, body: unknown) => {
                expect(endpoint).toBe('/api/search/searchAsset');
                expect(body).toMatchObject({ k: 'diagram', exts: ['png'] });
                return [{ path: 'assets/diagram.png' }];
            },
        });
        const permMgr = {
            reload: async () => undefined,
            canWrite: () => true,
            canRead: () => true,
            canDelete: () => true,
            get: () => 'rwd',
        };

        const result = await callSearchTool(client, {
            action: 'search_assets',
            k: 'diagram',
            exts: ['png'],
        }, buildDefaultToolConfig().search, permMgr as never);

        expect(parseResult(result)).toEqual([{ path: 'assets/diagram.png' }]);
    });

    it('accepts semantic aliases for fulltext and returns AI-friendly metadata', async () => {
        const client = createMockClient({
            request: async (endpoint: string, body: unknown) => {
                if (endpoint === '/api/query/sql') {
                    expect(body).toMatchObject({
                        stmt: "SELECT id, root_id, box, path, hpath, content, type FROM blocks WHERE id = 'doc-1' LIMIT 1",
                    });
                    return [{
                        id: 'doc-1',
                        root_id: 'doc-1',
                        box: 'allowed',
                        path: '/doc-1.sy',
                        hpath: '/Doc 1',
                        content: 'Doc 1',
                        type: 'd',
                    }];
                }
                expect(endpoint).toBe('/api/search/fullTextSearchBlock');
                expect(body).toMatchObject({
                    query: 'child',
                    method: 3,
                    orderBy: 4,
                    page: 1,
                    pageSize: 90,
                });
                return {
                    blocks: [
                        {
                            id: 'keep',
                            box: 'allowed',
                            rootID: 'doc-1',
                            parent_id: 'doc-1',
                            path: '/doc-1.sy',
                            content: 'before <mark>child</mark> after',
                            markdown: 'before child after',
                        },
                        {
                            id: 'drop',
                            box: 'allowed',
                            rootID: 'doc-2',
                            parent_id: 'doc-2',
                            path: '/doc-2.sy',
                            content: '<mark>child</mark> elsewhere',
                            markdown: 'child elsewhere',
                        },
                    ],
                    matchedBlockCount: 25,
                    matchedRootCount: 2,
                    pageCount: 3,
                };
            },
        });
        const permMgr = {
            reload: vi.fn(async () => undefined),
            canWrite: () => true,
            canRead: () => true,
            canDelete: () => true,
            get: () => 'rwd',
        };

        const result = await callSearchTool(client, {
            action: 'fulltext',
            query: 'child',
            methodName: 'regex',
            sortBy: 'date',
            parentId: 'doc-1',
            page: 1,
            pageSize: 30,
        }, buildDefaultToolConfig().search, permMgr as never);

        const parsed = parseResult(result);
        expect(parsed.data).toHaveLength(1);
        expect(parsed.data[0].plainContent).toBe('before child after');
        expect(parsed.data[0].excerpt).toContain('before child after');
        expect(parsed.data[0].path).toBe('/doc-1.sy');
        expect(parsed.total).toBe(1);
        expect(parsed.pageCount).toBe(1);
        expect(parsed.returnedTotal).toBe(1);
        expect(parsed.kernelMatchedBlockCount).toBe(25);
        expect(parsed.kernelPageCount).toBe(3);
        expect(parsed.kernelHasNextPage).toBe(true);
        expect(parsed.paginationMode).toBe('post_filtered_window');
        expect(parsed.resolvedArgs).toEqual({
            query: 'child',
            method: 3,
            methodName: 'regex',
            orderBy: 4,
            sortBy: 'updated_desc',
        });
    });

    it('accepts sql/query aliases and reports truncation metadata', async () => {
        const rows = Array.from({ length: 60 }, (_, index) => ({
            id: `row-${index + 1}`,
            box: 'allowed',
            content: `Row ${index + 1}`,
        }));
        const client = createMockClient({
            request: async (endpoint: string, body: unknown) => {
                expect(endpoint).toBe('/api/query/sql');
                expect(body).toMatchObject({ stmt: 'SELECT * FROM blocks LIMIT 60' });
                return rows;
            },
        });
        const permMgr = {
            reload: vi.fn(async () => undefined),
            canWrite: () => true,
            canRead: () => true,
            canDelete: () => true,
            get: () => 'rwd',
        };

        const result = await callSearchTool(client, {
            action: 'query_sql',
            sql: 'SELECT * FROM blocks LIMIT 60',
        }, buildDefaultToolConfig().search, permMgr as never);

        const parsed = parseResult(result);
        expect(parsed.data).toHaveLength(50);
        expect(parsed.total).toBe(60);
        expect(parsed.totalRows).toBe(60);
        expect(parsed.showing).toBe(50);
        expect(parsed.truncated).toBe(true);
        expect(parsed.hint).toContain('LIMIT and OFFSET');
        expect(parsed.resolvedArgs).toEqual({ stmt: 'SELECT * FROM blocks LIMIT 60' });
    });

    it('adds an indexing hint when tag search returns empty for a non-empty keyword', async () => {
        const client = createMockClient({
            request: async (endpoint: string, body: unknown) => {
                expect(endpoint).toBe('/api/search/searchTag');
                expect(body).toMatchObject({ k: 'mcp-test-tag' });
                return { k: 'mcp-test-tag', tags: [] };
            },
        });
        const permMgr = {
            reload: vi.fn(async () => undefined),
            canWrite: () => true,
            canRead: () => true,
            canDelete: () => true,
            get: () => 'rwd',
        };

        const result = await callSearchTool(client, {
            action: 'search_tag',
            k: 'mcp-test-tag',
        }, buildDefaultToolConfig().search, permMgr as never);

        expect(parseResult(result)).toEqual({
            k: 'mcp-test-tag',
            tags: [],
            warning: 'No matching tags were found. If the tag was just created, SiYuan tag indexing may still be catching up; verify the markdown uses #tag# syntax and retry shortly.',
        });
    });

    it('accepts query as an alias for tag search', async () => {
        const client = createMockClient({
            request: async (endpoint: string, body: unknown) => {
                expect(endpoint).toBe('/api/search/searchTag');
                expect(body).toMatchObject({ k: 'mcp-alias' });
                return { k: 'mcp-alias', tags: [{ label: 'mcp-alias', count: 1 }] };
            },
        });
        const permMgr = {
            reload: vi.fn(async () => undefined),
            canWrite: () => true,
            canRead: () => true,
            canDelete: () => true,
            get: () => 'rwd',
        };

        const result = await callSearchTool(client, {
            action: 'search_tag',
            query: 'mcp-alias',
        }, buildDefaultToolConfig().search, permMgr as never);

        expect(parseResult(result)).toEqual({
            k: 'mcp-alias',
            tags: [{ label: 'mcp-alias', count: 1 }],
            resolvedArgs: {
                query: 'mcp-alias',
            },
        });
    });
});

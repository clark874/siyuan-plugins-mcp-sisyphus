import { describe, expect, it, vi } from 'vitest';

import { buildDefaultToolConfig } from '@/core/config';
import { normalizeFullTextSearchResult } from '@/core/normalize';
import { callSearchTool, filterBacklinkResultByPermission, filterFullTextSearchResultByPermission, listSearchTools } from '@/tools/search';
import { callTagTool } from '@/tools/tag';
import { assertReadOnlySql } from '@/tools/search/sql-builder';
import { createMockClient } from '../../helpers/mock-client';
import { parseResult } from '../../helpers/parse-result';

describe('search SQL read-only guard', () => {
    it('allows SELECT and WITH queries whose main statement is SELECT', () => {
        expect(() => assertReadOnlySql('SELECT * FROM blocks LIMIT 1')).not.toThrow();
        expect(() => assertReadOnlySql(`
            WITH recent AS (
                SELECT id FROM blocks WHERE content LIKE 'DELETE is just text'
            )
            SELECT * FROM recent LIMIT 10;
        `)).not.toThrow();
        expect(() => assertReadOnlySql(`
            -- leading comments are ignored
            WITH RECURSIVE tree(id) AS NOT MATERIALIZED (
                SELECT id FROM blocks WHERE id = 'root'
                UNION ALL
                SELECT b.id FROM blocks b JOIN tree t ON b.parent_id = t.id
            )
            SELECT id FROM tree LIMIT 20
        `)).not.toThrow();
    });

    it('rejects mutation statements hidden behind WITH CTEs or additional statements', () => {
        const forbidden = [
            'WITH doomed AS (SELECT id FROM blocks LIMIT 1) DELETE FROM blocks WHERE id IN doomed',
            'WITH renamed AS (SELECT id FROM blocks LIMIT 1) UPDATE blocks SET content = "x"',
            'WITH copied AS (SELECT id FROM blocks LIMIT 1) INSERT INTO blocks(id) SELECT id FROM copied',
            'SELECT * FROM blocks LIMIT 1; DELETE FROM blocks WHERE id = "x"',
        ];

        for (const stmt of forbidden) {
            expect(() => assertReadOnlySql(stmt)).toThrow(/Only SELECT statements/);
        }
    });

    it('blocks unsafe CTE SQL before calling the SiYuan query endpoint', async () => {
        const request = vi.fn();
        const client = createMockClient({ request });
        const permMgr = {
            reload: vi.fn(async () => undefined),
            canWrite: () => true,
            canRead: () => true,
            canDelete: () => true,
            get: () => 'rwd',
            getAll: () => ({}),
        };

        const result = await callSearchTool(client, {
            action: 'query_sql',
            stmt: 'WITH doomed AS (SELECT id FROM blocks LIMIT 1) DELETE FROM blocks WHERE id IN doomed',
        }, buildDefaultToolConfig().search, permMgr as never);

        const parsed = parseResult(result);
        expect(parsed.error.message).toMatch(/Only SELECT statements/);
        expect(request).not.toHaveBeenCalled();
    });

    it('rejects query_sql maxRows above the hard output ceiling', async () => {
        const request = vi.fn();
        const client = createMockClient({ request });
        const permMgr = {
            reload: vi.fn(async () => undefined),
            canWrite: () => true,
            canRead: () => true,
            canDelete: () => true,
            get: () => 'rwd',
            getAll: () => ({}),
        };

        const result = await callSearchTool(client, {
            action: 'query_sql',
            stmt: 'SELECT * FROM blocks LIMIT 1001',
            maxRows: 1001,
        }, buildDefaultToolConfig().search, permMgr as never);

        expect(result.isError).toBe(true);
        expect(request).not.toHaveBeenCalled();
    });
});

describe('search tool filtering', () => {
    it('routes semantic search through the native embedding endpoint and permission filter', async () => {
        const request = vi.fn(async (endpoint: string, body: unknown) => {
            expect(endpoint).toBe('/api/search/semanticSearchBlock');
            expect(body).toEqual({
                query: 'knowledge graph',
                paths: ['allowed'],
                types: { heading: true, paragraph: true },
                subTypes: { h2: true },
                page: 2,
                pageSize: 16,
            });
            return {
                blocks: [
                    { id: 'keep', box: 'allowed', rootID: 'doc-1', path: '/doc-1.sy', content: 'relevant' },
                    { id: 'drop', box: 'blocked', rootID: 'doc-2', path: '/doc-2.sy', content: 'secret' },
                ],
                matchedBlockCount: 2,
                matchedRootCount: 2,
                pageCount: 3,
            };
        });
        const client = createMockClient({ request });
        const permMgr = {
            reload: vi.fn(async () => undefined),
            canWrite: () => true,
            canRead: (notebook: string) => notebook !== 'blocked',
            canDelete: () => true,
            get: () => 'rwd',
            getAll: () => ({ allowed: 'rwd', blocked: 'none' }),
        };

        const result = await callSearchTool(client, {
            action: 'semantic',
            query: 'knowledge graph',
            paths: ['allowed'],
            typeShortcodes: ['h', 'p'],
            subTypes: { h2: true },
            page: 2,
            pageSize: 16,
        }, buildDefaultToolConfig().search, permMgr as never);

        const parsed = parseResult(result);
        expect(parsed.data).toHaveLength(1);
        expect(parsed.data[0]).toMatchObject({ id: 'keep' });
        expect(parsed.partial).toBe(true);
        expect(parsed.filteredOutCount).toBe(1);
        expect(parsed.kernelMatchedBlockCount).toBe(2);
        expect(parsed.dataEgress).toBe(true);
    });

    it('validates semantic pagination before calling the kernel', async () => {
        const request = vi.fn();
        const result = await callSearchTool(createMockClient({ request }), {
            action: 'semantic',
            query: 'knowledge',
            pageSize: 129,
        }, buildDefaultToolConfig().search, { canRead: () => true } as never);

        expect(parseResult(result).error.message).toContain('Invalid arguments');
        expect(request).not.toHaveBeenCalled();
    });

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
        const actionDescription = tool.inputSchema.properties.action.description;
        expect(actionDescription).toContain('search_refs');
        expect(actionDescription).toContain('find_replace');
        expect(actionDescription).toContain('search_assets');
        expect(actionDescription).toContain('list_invalid_refs');
        expect(actionDescription).toContain('knowledge');
        expect(actionDescription).toContain('check_anchor');
    });

    it('checks normalized name and alias collisions with scoped disambiguation', async () => {
        const request = vi.fn(async (endpoint: string, body: { stmt?: string }) => {
            expect(endpoint).toBe('/api/query/sql');
            if (body.stmt?.includes('FROM blocks')) {
                return [
                    { id: 'name-1', root_id: 'doc-1', box: 'allowed', path: '/doc-1.sy', hpath: '/方法甲', type: 'p', name: 'Textnets-Projection', alias: '', content: '规范方法原子' },
                    { id: 'alias-1', root_id: 'doc-2', box: 'allowed', path: '/doc-2.sy', hpath: '/项目甲', type: 'p', name: 'project-a-network', alias: 'textnets，文本网络', content: '项目上下文原子' },
                    { id: 'hidden', root_id: 'doc-3', box: 'blocked', path: '/doc-3.sy', hpath: '/隐藏', type: 'p', name: '', alias: 'textnets', content: '不可读内容' },
                ];
            }
            if (body.stmt?.includes("name = 'custom-anchor-scope'")) {
                return [
                    { block_id: 'alias-1', value: 'textnets,network-analysis' },
                ];
            }
            throw new Error(`unexpected SQL: ${body.stmt}`);
        });
        const permMgr = {
            reload: vi.fn(async () => undefined),
            canRead: (notebook: string) => notebook !== 'blocked',
            canWrite: () => true,
            canDelete: () => true,
            get: () => 'rwd',
            getAll: () => ({ allowed: 'rwd', blocked: 'none' }),
        };

        const result = await callSearchTool(createMockClient({ request }), {
            action: 'check_anchor',
            candidates: [' TEXTNETS ', 'Textnets-Projection'],
            candidateKind: 'alias',
            activeScopes: ['textnets'],
        }, buildDefaultToolConfig().search, permMgr as never);
        const parsed = parseResult(result);

        expect(parsed.checks).toMatchObject([
            {
                candidate: 'textnets',
                status: 'resolved_by_scope',
                resolvedTargetId: 'alias-1',
                targetCount: 1,
            },
            {
                candidate: 'textnets-projection',
                status: 'collision_requires_adjudication',
                targetCount: 1,
            },
        ]);
        expect(parsed.permissionFilteredCount).toBe(1);
        expect(parsed.partial).toBe(true);
        expect(parsed.checks[0].targets[0].scopes).toEqual(['textnets', 'network-analysis']);
    });

    it('collapses semantic reference hits into named knowledge atoms and attaches related documents', async () => {
        const client = createMockClient({
            request: async (endpoint: string, body: any) => {
                if (endpoint === '/api/search/semanticSearchBlock') {
                    expect(body).toMatchObject({
                        query: 'textnets 投影权重怎么算',
                        page: 1,
                        pageSize: 12,
                    });
                    return {
                        blocks: [
                            { id: '20260814100000-plain01', box: 'allowed', rootID: '20260814100000-plainrt', hPath: '/Plain', type: 'p', content: 'unnamed but highest-ranked result' },
                            { id: '20260814100000-ref0001', box: 'allowed', rootID: '20260814100000-hub0001', hPath: '/Hub', type: 'p', content: '((atom))' },
                            { id: '20260814100000-ref0002', box: 'allowed', rootID: '20260814100000-hub0001', hPath: '/Hub', type: 'i', content: '- ((atom))' },
                            { id: '20260814100000-atom001', box: 'allowed', rootID: '20260814100000-wiki001', hPath: '/Wiki', type: 'p', content: '投影权重正文' },
                            { id: '20260814100000-noise01', box: 'allowed', rootID: '20260814100000-noised1', hPath: '/Noise', type: 'h', content: '相关标题' },
                        ],
                        matchedBlockCount: 5,
                        matchedRootCount: 4,
                        pageCount: 1,
                    };
                }
                if (endpoint === '/api/query/sql') {
                    const stmt = String(body.stmt);
                    if (stmt.includes('SELECT block_id, def_block_id FROM refs WHERE block_id IN')) {
                        return [
                            { id: '20260814100000-plain01', root_id: '20260814100000-plainrt', box: 'allowed', hpath: '/Plain', type: 'p', name: '', alias: '', content: 'unnamed but highest-ranked result', markdown: 'unnamed but highest-ranked result' },
                            { block_id: '20260814100000-ref0001', def_block_id: '20260814100000-atom001' },
                            { block_id: '20260814100000-ref0002', def_block_id: '20260814100000-atom001' },
                        ];
                    }
                    if (stmt.includes('FROM blocks') && stmt.includes('WHERE id IN')) {
                        return [
                            { id: '20260814100000-ref0001', root_id: '20260814100000-hub0001', box: 'allowed', hpath: '/Hub', type: 'p', name: '', alias: '', content: '((atom))', markdown: '((atom))' },
                            { id: '20260814100000-ref0002', root_id: '20260814100000-hub0001', box: 'allowed', hpath: '/Hub', type: 'i', name: '', alias: '', content: '- ((atom))', markdown: '- ((atom))' },
                            { id: '20260814100000-atom001', root_id: '20260814100000-wiki001', box: 'allowed', hpath: '/Wiki', type: 'p', name: 'textnets-projection-weighting', alias: 'textnets投影权重', content: '投影权重正文', markdown: '投影权重正文' },
                            { id: '20260814100000-noise01', root_id: '20260814100000-noised1', box: 'allowed', hpath: '/Noise', type: 'h', name: '', alias: '', content: '相关标题', markdown: '## 相关标题' },
                        ];
                    }
                    if (stmt.includes('source_root_id')) {
                        return [
                            { target_id: '20260814100000-atom001', source_root_id: '20260814100000-proj001', box: 'allowed', source_hpath: '/Projects/Example', source_title: 'Example Project' },
                        ];
                    }
                }
                if (endpoint === '/api/notebook/lsNotebooks') {
                    return { notebooks: [{ id: 'allowed', name: 'Work', icon: '', sort: 0, closed: false }] };
                }
                throw new Error(`Unexpected endpoint: ${endpoint}`);
            },
        });
        const permMgr = {
            reload: vi.fn(async () => undefined),
            canWrite: () => true,
            canRead: () => true,
            canDelete: () => true,
            get: () => 'rwd',
            getAll: () => ({}),
        };

        const result = await callSearchTool(client, {
            action: 'knowledge',
            query: 'textnets 投影权重怎么算',
            pageSize: 10,
            candidateSize: 12,
        }, buildDefaultToolConfig().search, permMgr as never);

        const parsed = parseResult(result);
        expect(parsed.data).toHaveLength(3);
        expect(parsed.data[0]).toMatchObject({
            id: '20260814100000-atom001',
            name: 'textnets-projection-weighting',
            semanticRank: 2,
            deduplicatedRank: 1,
            collapsedReferenceCount: 2,
            sourceResultIds: [
                '20260814100000-ref0001',
                '20260814100000-ref0002',
                '20260814100000-atom001',
            ],
            relatedDocuments: [{
                id: '20260814100000-proj001',
                hpath: '/Projects/Example',
                title: 'Example Project',
            }],
        });
        expect(parsed.data[1]).toMatchObject({
            id: '20260814100000-plain01',
            deduplicatedRank: 2,
        });
        expect(parsed.data[2]).toMatchObject({
            id: '20260814100000-noise01',
            deduplicatedRank: 3,
        });
        expect(parsed.semanticCandidateCount).toBe(5);
        expect(parsed.deduplicatedCount).toBe(3);
        expect(parsed.dataEgress).toBe(true);
        expect(parsed.externalCost).toBe(true);
    });

    it('filters restricted semantic candidates before knowledge expansion', async () => {
        const request = vi.fn(async (endpoint: string) => {
            if (endpoint === '/api/search/semanticSearchBlock') {
                return {
                    blocks: [
                        { id: '20260814100000-keep001', box: 'allowed', rootID: '20260814100000-doc0001', hPath: '/Allowed', type: 'p', content: 'allowed' },
                        { id: '20260814100000-drop001', box: 'blocked', rootID: '20260814100000-doc0002', hPath: '/Blocked', type: 'p', content: 'blocked' },
                    ],
                    matchedBlockCount: 2,
                    matchedRootCount: 2,
                    pageCount: 1,
                };
            }
            if (endpoint === '/api/query/sql') return [];
            if (endpoint === '/api/notebook/lsNotebooks') return { notebooks: [] };
            throw new Error(`Unexpected endpoint: ${endpoint}`);
        });
        const client = createMockClient({ request });
        const permMgr = {
            reload: vi.fn(async () => undefined),
            canWrite: () => true,
            canRead: (id: string) => id !== 'blocked',
            canDelete: () => true,
            get: () => 'rwd',
            getAll: () => ({ allowed: 'rwd', blocked: 'none' }),
        };

        const result = await callSearchTool(client, {
            action: 'knowledge',
            query: 'allowed query',
        }, buildDefaultToolConfig().search, permMgr as never);

        const parsed = parseResult(result);
        expect(parsed.permissionFilteredCount).toBe(1);
        expect(JSON.stringify(parsed)).not.toContain('drop001');
        const sqlCalls = request.mock.calls.filter(([endpoint]) => endpoint === '/api/query/sql');
        expect(JSON.stringify(sqlCalls)).not.toContain('drop001');
    });

    it('does not reveal a restricted target ID reached from a readable semantic reference', async () => {
        const request = vi.fn(async (endpoint: string, body: any) => {
            if (endpoint === '/api/search/semanticSearchBlock') {
                return {
                    blocks: [{
                        id: '20260814100000-refkeep', box: 'allowed', rootID: '20260814100000-doc0001',
                        hPath: '/Allowed', type: 'p', content: '((restricted target))',
                    }],
                    matchedBlockCount: 1,
                    matchedRootCount: 1,
                    pageCount: 1,
                };
            }
            if (endpoint === '/api/query/sql') {
                const stmt = String(body.stmt);
                if (stmt.includes('SELECT block_id, def_block_id FROM refs WHERE block_id IN')) {
                    return [{ block_id: '20260814100000-refkeep', def_block_id: '20260814100000-secret1' }];
                }
                if (stmt.includes('FROM blocks') && stmt.includes('WHERE id IN')) {
                    return [
                        { id: '20260814100000-refkeep', root_id: '20260814100000-doc0001', box: 'allowed', hpath: '/Allowed', type: 'p', name: '', content: '((restricted target))' },
                        { id: '20260814100000-secret1', root_id: '20260814100000-doc0002', box: 'blocked', hpath: '/Blocked', type: 'p', name: 'secret-atom', content: 'secret' },
                    ];
                }
                return [];
            }
            if (endpoint === '/api/notebook/lsNotebooks') return { notebooks: [] };
            throw new Error(`Unexpected endpoint: ${endpoint}`);
        });
        const client = createMockClient({ request });
        const permMgr = {
            reload: vi.fn(async () => undefined),
            canWrite: () => true,
            canRead: (id: string) => id !== 'blocked',
            canDelete: () => true,
            get: () => 'rwd',
            getAll: () => ({ allowed: 'rwd', blocked: 'none' }),
        };

        const result = await callSearchTool(client, {
            action: 'knowledge',
            query: 'readable reference',
        }, buildDefaultToolConfig().search, permMgr as never);

        const parsed = parseResult(result);
        expect(parsed.data).toEqual([]);
        expect(JSON.stringify(parsed)).not.toContain('secret1');
        expect(JSON.stringify(parsed)).not.toContain('secret-atom');
    });

    it('publishes fulltext types as a boolean object map', () => {
        const config = buildDefaultToolConfig();
        const [tool] = listSearchTools(config.search);
        const typesSchema = tool.inputSchema.properties.types;
        const fulltextSchema = tool.inputSchema['x-sisyphus-actionSchemas']
            .find((schema: any) => schema.properties?.action?.const === 'fulltext');

        expect(typesSchema).toMatchObject({
            type: 'object',
            additionalProperties: { type: 'boolean' },
        });
        expect(typesSchema.propertyNames).toBeUndefined();
        expect(fulltextSchema.properties.types).toMatchObject({
            type: 'object',
            additionalProperties: { type: 'boolean' },
        });
        expect(fulltextSchema.properties.types.propertyNames).toBeUndefined();
    });

    it('accepts fulltext types shortcodes as an object and expands them before calling SiYuan', async () => {
        const client = createMockClient({
            request: async (endpoint: string, body: unknown) => {
                expect(endpoint).toBe('/api/search/fullTextSearchBlock');
                expect(body).toMatchObject({
                    query: 'needle',
                    types: {
                        heading: true,
                        paragraph: true,
                    },
                });
                return {
                    blocks: [],
                    matchedBlockCount: 0,
                    matchedRootCount: 0,
                    pageCount: 1,
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
            query: 'needle',
            types: { h: true, p: true },
        }, buildDefaultToolConfig().search, permMgr as never);

        const parsed = parseResult(result);
        expect(parsed.data).toEqual([]);
        expect(parsed.total).toBe(0);
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

    it('maps search_refs keyword alias to k while still requiring id', async () => {
        const client = createMockClient({
            request: async (endpoint: string, body: unknown) => {
                if (endpoint === '/api/query/sql') {
                    return [{
                        id: 'target-block',
                        root_id: 'doc-1',
                        box: 'nb-1',
                        path: '/doc-1.sy',
                        hpath: '/Doc',
                        type: 'p',
                    }];
                }
                expect(endpoint).toBe('/api/search/searchRefBlock');
                expect(body).toMatchObject({ id: 'target-block', k: 'needle' });
                return { blocks: [] };
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
            action: 'search_refs',
            id: 'target-block',
            keyword: 'needle',
        }, buildDefaultToolConfig().search, permMgr as never);

        expect(result.isError).toBeUndefined();
    });

    it('adds notebookName to fulltext search blocks when the notebook can be resolved', async () => {
        const client = createMockClient({
            request: async (endpoint: string) => {
                if (endpoint === '/api/notebook/lsNotebooks') {
                    return { notebooks: [{ id: 'nb-1', name: 'Technical Notes', icon: '', sort: 0, closed: false }] };
                }
                if (endpoint === '/api/search/fullTextSearchBlock') {
                    return {
                        blocks: [{ id: 'block-1', box: 'nb-1', hPath: '/Docker/Install', content: 'Docker install' }],
                        matchedBlockCount: 1,
                        matchedRootCount: 1,
                        pageCount: 1,
                    };
                }
                throw new Error(`Unexpected endpoint: ${endpoint}`);
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
            query: 'Docker',
        }, buildDefaultToolConfig().search, permMgr as never);

        const parsed = parseResult(result);
        expect(parsed.data[0]).toMatchObject({
            id: 'block-1',
            box: 'nb-1',
            notebookName: 'Technical Notes',
        });
    });

    it('accepts semantic aliases for fulltext and returns AI-friendly metadata', async () => {
        const client = createMockClient({
            request: async (endpoint: string, body: unknown) => {
                if (endpoint === '/api/notebook/lsNotebooks') {
                    return { notebooks: [{ id: 'allowed', name: 'Allowed Notebook', icon: '', sort: 0, closed: false }] };
                }
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
            getAll: () => ({}),
        };

        const result = await callSearchTool(client, {
            action: 'query_sql',
            sql: 'SELECT * FROM blocks LIMIT 60',
            maxRows: 50,
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

        const result = await callTagTool(client, {
            action: 'list',
            keyword: 'mcp-test-tag',
        }, buildDefaultToolConfig().tag, permMgr as never);

        expect(parseResult(result)).toEqual({
            k: 'mcp-test-tag',
            tags: [],
            resolvedArgs: { keyword: 'mcp-test-tag' },
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

        const result = await callTagTool(client, {
            action: 'list',
            query: 'mcp-alias',
        }, buildDefaultToolConfig().tag, permMgr as never);

        expect(parseResult(result)).toEqual({
            k: 'mcp-alias',
            tags: [{ label: 'mcp-alias', count: 1 }],
            resolvedArgs: {
                keyword: 'mcp-alias',
            },
        });
    });
});

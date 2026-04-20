import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServerInstructions, createSiYuanServer } from '@/mcp/server';

describe('MCP Server Integration', () => {
    let client: Client;
    let storedFiles: Record<string, string>;

    beforeEach(async () => {
        global.fetch = vi.fn();
        process.env.SIYUAN_TOKEN = 'test-token';
        storedFiles = {
            '/data/storage/petal/siyuan-plugins-mcp-sisyphus/notebookPermissions': '{}',
            '/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpToolsConfig': '',
        };

        // Mock all API responses: permission load + config read
        vi.mocked(global.fetch).mockImplementation(async (url, init) => {
            const urlStr = String(url);

            if (urlStr.includes('/api/file/getFile')) {
                const body = init?.body ? JSON.parse(String(init.body)) as { path?: string } : {};
                return {
                    ok: true,
                    text: async () => storedFiles[body.path ?? ''] ?? '',
                } as Response;
            }

            if (urlStr.includes('/api/file/putFile')) {
                const formData = init?.body as FormData;
                const filePath = String(formData.get('path') ?? '');
                const file = formData.get('file');
                storedFiles[filePath] = file instanceof File ? await file.text() : String(file ?? '');
                return {
                    ok: true,
                    json: async () => ({ code: 0, msg: 'success', data: null }),
                } as Response;
            }

            // Default: successful empty response
            return {
                ok: true,
                json: async () => ({ code: 0, msg: 'success', data: {} }),
            } as Response;
        });

        const server = await createSiYuanServer();

        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);

        client = new Client({ name: 'test-client', version: '1.0.0' });
        await client.connect(clientTransport);
    });

    afterEach(() => {
        delete process.env.SIYUAN_TOKEN;
        delete process.env.SIYUAN_MCP_TOOLS;
    });

    describe('Server creation and tool listing', () => {
        it('loads tool config from SiYuan API in standalone mode', async () => {
            storedFiles['/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpToolsConfig'] = JSON.stringify({
                document: {
                    enabled: false,
                    actions: {},
                },
                userRulesText: 'Use the API-backed config.',
            });

            const server = await createSiYuanServer();
            const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
            await server.connect(serverTransport);

            const standaloneClient = new Client({ name: 'standalone-config-client', version: '1.0.0' });
            await standaloneClient.connect(clientTransport);

            const { tools } = await standaloneClient.listTools();
            expect(tools.map(t => t.name)).not.toContain('document');

            await standaloneClient.close();
        });

        it('falls back to default config when API config is invalid', async () => {
            storedFiles['/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpToolsConfig'] = '{invalid json';

            const server = await createSiYuanServer();
            const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
            await server.connect(serverTransport);

            const fallbackClient = new Client({ name: 'default-config-client', version: '1.0.0' });
            await fallbackClient.connect(clientTransport);

            const { tools } = await fallbackClient.listTools();
            expect(tools.map(t => t.name)).toContain('document');

            await fallbackClient.close();
        });

        it('ignores SIYUAN_MCP_TOOLS when API config is unavailable', async () => {
            storedFiles['/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpToolsConfig'] = '';
            process.env.SIYUAN_MCP_TOOLS = JSON.stringify({
                document: {
                    enabled: false,
                    actions: {},
                },
            });

            const server = await createSiYuanServer();
            const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
            await server.connect(serverTransport);

            const envIgnoredClient = new Client({ name: 'env-ignored-client', version: '1.0.0' });
            await envIgnoredClient.connect(clientTransport);

            const { tools } = await envIgnoredClient.listTools();
            expect(tools.map(t => t.name)).toContain('document');

            await envIgnoredClient.close();
        });

        it('elevates user custom rules in server instructions when configured', () => {
            const userRule = 'After creating a document, proactively set the icon when the user mentions it.';
            const instructions = buildServerInstructions(userRule);

            expect(instructions).toContain('## User custom rules priority');
            expect(instructions).toContain('## User custom rules');
            expect(instructions).toContain('MUST follow these user custom rules');
            expect(instructions).toContain(userRule);
            expect(instructions.indexOf('## User custom rules')).toBeLessThan(instructions.indexOf('## Help and progressive disclosure'));
            expect(instructions).toContain('User custom rules override the general style and workflow suggestions below when they apply.');
        });

        it('formats multiline user custom rules as a bullet list', () => {
            const instructions = buildServerInstructions('Rule one\n\nRule two  \n  Rule three');

            expect(instructions).toContain('- Rule one');
            expect(instructions).toContain('- Rule two');
            expect(instructions).toContain('- Rule three');
        });

        it('omits user custom rule sections when no rules are configured', () => {
            const instructions = buildServerInstructions('');

            expect(instructions).not.toContain('## User custom rules priority');
            expect(instructions).not.toContain('## User custom rules');
            expect(instructions).not.toContain('User custom rules override the general style and workflow suggestions below when they apply.');
        });

        it('includes block update guidance for multi-line content', () => {
            const instructions = buildServerInstructions('');

            expect(instructions).toContain('block(action=”update”) is best for single-block replacement');
            expect(instructions).toContain('Multi-line markdown may be truncated to the first line by SiYuan');
            expect(instructions).toContain('block(action=”append”), prepend, or insert');
        });

        it('should list tools with expected names', async () => {
            const { tools } = await client.listTools();

            expect(tools.length).toBeGreaterThan(0);

            const toolNames = tools.map(t => t.name);
            expect(toolNames).toContain('notebook');
            expect(toolNames).toContain('document');
            expect(toolNames).toContain('block');
            expect(toolNames).toContain('av');
            expect(toolNames).toContain('search');
            expect(toolNames).toContain('file');
            expect(toolNames).toContain('tag');
            expect(toolNames).toContain('system');
            expect(toolNames).toContain('flashcard');
            expect(toolNames).toContain('mascot');
        });

        it('should have action enum in each tool input schema', async () => {
            const { tools } = await client.listTools();

            for (const tool of tools) {
                const schema = tool.inputSchema as Record<string, any>;
                expect(schema.properties?.action?.enum).toBeDefined();
                expect(schema.properties?.action?.enum.length).toBeGreaterThan(0);
            }
        });

        it('should have descriptions for all tools', async () => {
            const { tools } = await client.listTools();

            for (const tool of tools) {
                expect(tool.description).toBeTruthy();
                expect(tool.description!.length).toBeGreaterThan(10);
            }
        });
    });

    describe('Resource listing', () => {
        it('should list available resources', async () => {
            const { resources } = await client.listResources();
            expect(resources.length).toBeGreaterThan(0);
        });
    });

    describe('Error handling', () => {
        it('should return error for unknown tool', async () => {
            const result = await client.callTool({ name: 'nonexistent', arguments: {} });
            expect(result.isError).toBe(true);
        });

        it('should still create the server when SIYUAN_TOKEN is missing', async () => {
            delete process.env.SIYUAN_TOKEN;
            await expect(createSiYuanServer()).resolves.toBeTruthy();
        });
    });

    describe('Puppy wage tracking', () => {
        it('increments total calls once for a successful tool call', async () => {
            await client.callTool({ name: 'system', arguments: { action: 'get_version' } });

            expect(JSON.parse(storedFiles['/data/storage/petal/siyuan-plugins-mcp-sisyphus/puppyStats.json'])).toMatchObject({
                totalCalls: 1,
            });
            expect(JSON.parse(storedFiles['/data/storage/petal/siyuan-plugins-mcp-sisyphus/puppyEvents.json'])).toMatchObject({
                tool: 'system',
                action: 'get_version',
                status: 'success',
                totalCalls: 1,
            });
            await vi.waitFor(() => {
                expect(storedFiles['/data/storage/petal/siyuan-plugins-mcp-sisyphus/analytics.jsonl']).toBeTruthy();
            });
            const analyticsLine = storedFiles['/data/storage/petal/siyuan-plugins-mcp-sisyphus/analytics.jsonl'];
            expect(analyticsLine).toBeTruthy();
            expect(JSON.parse(analyticsLine)).toMatchObject({
                tool: 'system',
                action: 'get_version',
                requestChars: expect.any(Number),
                responseChars: expect.any(Number),
                requestApproxTokens: expect.any(Number),
                responseApproxTokens: expect.any(Number),
                totalApproxTokens: expect.any(Number),
                tokenMode: 'approx_context_v1',
            });
        });

        it('increments total calls once for a failed tool call', async () => {
            const result = await client.callTool({ name: 'system', arguments: { action: 'conf', mode: 'get' } });

            expect(result.isError).toBe(true);
            expect(JSON.parse(storedFiles['/data/storage/petal/siyuan-plugins-mcp-sisyphus/puppyStats.json'])).toMatchObject({
                totalCalls: 1,
            });
            expect(JSON.parse(storedFiles['/data/storage/petal/siyuan-plugins-mcp-sisyphus/puppyEvents.json'])).toMatchObject({
                tool: 'system',
                action: 'conf',
                status: 'error',
                totalCalls: 1,
            });
        });

        it('keeps accumulating across calls without double-counting phases', async () => {
            await client.callTool({ name: 'system', arguments: { action: 'get_current_time' } });
            await client.callTool({ name: 'system', arguments: { action: 'get_version' } });

            expect(JSON.parse(storedFiles['/data/storage/petal/siyuan-plugins-mcp-sisyphus/puppyStats.json'])).toMatchObject({
                totalCalls: 2,
            });
        });
    });
});

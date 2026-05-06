import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { resetToolConfigWarningStateForTests } from '@/core/config';
import { USER_RULES_RESOURCE_URI } from '@/core/help';
import { buildServerInstructions, createSiYuanServer } from '@/core/server';
import { USER_RULES_TOOL_DESCRIPTION_REMINDER } from '@/core/tool-registry';

const jsonResponse = (payload: unknown): Response => ({
    ok: true,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
} as Response);

describe('MCP Server Integration', () => {
    let client: Client;
    let storedFiles: Record<string, string>;

    beforeEach(async () => {
        resetToolConfigWarningStateForTests();
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
                return jsonResponse({ code: 0, msg: 'success', data: null });
            }

            // Default: successful empty response
            return jsonResponse({ code: 0, msg: 'success', data: {} });
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

        it('warns once when API config is still in the legacy format', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            storedFiles['/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpToolsConfig'] = JSON.stringify({
                notebook: ['list', 'rename'],
                remove_document: true,
            });

            await createSiYuanServer();
            await createSiYuanServer();

            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Detected legacy tool config format'));
        });

        it('elevates user custom rules in server instructions when configured', () => {
            const userRule = 'After creating a document, proactively set the icon when the user mentions it.';
            const instructions = buildServerInstructions(userRule);

            expect(instructions.trimStart().startsWith('# Active user custom rules')).toBe(true);
            expect(instructions).toContain('## Rule list');
            expect(instructions).toContain(userRule);
            expect(instructions.indexOf('# Active user custom rules')).toBeLessThan(instructions.indexOf('## Help and progressive disclosure'));
            expect(instructions).toContain('User custom rules do not override safety confirmation requirements, notebook permissions, disabled tools, or disabled actions.');
            expect(instructions).toContain('siyuan://help/user-rules');
        });

        it('formats multiline user custom rules as a bullet list', () => {
            const instructions = buildServerInstructions('Rule one\n\nRule two  \n  Rule three');

            expect(instructions).toContain('- Rule one');
            expect(instructions).toContain('- Rule two');
            expect(instructions).toContain('- Rule three');
        });

        it('omits user custom rule sections when no rules are configured', () => {
            const instructions = buildServerInstructions('');

            expect(instructions).not.toContain('# Active user custom rules');
            expect(instructions).not.toContain('## Rule list');
            expect(instructions).not.toContain('User custom rules override the general style and workflow suggestions below when they apply.');
        });

        it('includes block update guidance for multi-line content', () => {
            const instructions = buildServerInstructions('');

            expect(instructions).toContain('block(action=”update”) is best for single-block replacement');
            expect(instructions).toContain('Multi-line markdown may be truncated to the first line by SiYuan');
            expect(instructions).toContain('block(action=”append”), prepend, or insert');
        });

        it('directs basic path-style operations to the fs tool first', () => {
            const instructions = buildServerInstructions('');

            expect(instructions).toContain('For basic path-style notebook and document operations, use `fs`');
            expect(instructions).toContain('Treat `fs` as the default virtual filesystem interface');
            expect(instructions).toContain('fs(action="read", path="/Notebook/Folder/Doc")');
            expect(instructions).toContain('fs(action="write", path="/Notebook/Folder/Doc", markdown="...", overwrite=true)');
            expect(instructions).toContain('fs(action="mv", from="/Notebook/Old", to="/Notebook/New")');
            expect(instructions).toContain('Prefer `fs` for basic browse/read/write/edit/search/move/delete workflows.');
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

        it('adds a light user custom rules reminder to tool descriptions when configured', async () => {
            storedFiles['/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpToolsConfig'] = JSON.stringify({
                userRulesText: 'Always set document icons.',
            });

            const server = await createSiYuanServer();
            const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
            await server.connect(serverTransport);

            const rulesClient = new Client({ name: 'rules-description-client', version: '1.0.0' });
            await rulesClient.connect(clientTransport);
            const { tools } = await rulesClient.listTools();

            expect(tools.length).toBeGreaterThan(0);
            for (const tool of tools) {
                expect(tool.description).toContain(USER_RULES_TOOL_DESCRIPTION_REMINDER);
            }

            await rulesClient.close();
        });
    });

    describe('Resource listing', () => {
        it('should list available resources', async () => {
            const { resources } = await client.listResources();
            expect(resources.length).toBeGreaterThan(0);
            expect(resources.map((resource) => resource.uri)).toContain(USER_RULES_RESOURCE_URI);
        });

        it('reads current user custom rules from the dynamic resource', async () => {
            storedFiles['/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpToolsConfig'] = JSON.stringify({
                userRulesText: 'Rule one\nRule two',
            });

            const server = await createSiYuanServer();
            const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
            await server.connect(serverTransport);

            const resourceClient = new Client({ name: 'rules-resource-client', version: '1.0.0' });
            await resourceClient.connect(clientTransport);
            const resource = await resourceClient.readResource({ uri: USER_RULES_RESOURCE_URI });
            const firstContent = resource.contents[0];
            const text = firstContent && 'text' in firstContent ? firstContent.text : '';

            expect(text).toContain('# Active User Custom Rules');
            expect(text).toContain('- Rule one');
            expect(text).toContain('- Rule two');
            expect(text).toContain('do not override safety confirmation requirements');

            await resourceClient.close();
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

    describe('Response debug metadata', () => {
        async function createClientWithStoredConfig(config: Record<string, unknown>) {
            storedFiles['/data/storage/petal/siyuan-plugins-mcp-sisyphus/notebookPermissions'] = JSON.stringify({ 'nb-1': 'rwd' });
            storedFiles['/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpToolsConfig'] = JSON.stringify(config);
            const server = await createSiYuanServer();
            const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
            await server.connect(serverTransport);
            const metadataClient = new Client({ name: 'metadata-client', version: '1.0.0' });
            await metadataClient.connect(clientTransport);
            return metadataClient;
        }

        it('omits successful uiRefresh metadata by default', async () => {
            const metadataClient = await createClientWithStoredConfig({});

            const result = await metadataClient.callTool({
                name: 'notebook',
                arguments: { action: 'rename', notebook: 'nb-1', name: 'Renamed' },
            });
            const payload = JSON.parse((result.content[0] as { text: string }).text);

            expect(payload).toMatchObject({ success: true, notebook: 'nb-1', name: 'Renamed' });
            expect(payload.uiRefresh).toBeUndefined();

            await metadataClient.close();
        });

        it('includes successful uiRefresh metadata when the debug switch is enabled', async () => {
            const metadataClient = await createClientWithStoredConfig({
                debug: { includeUiRefreshMetadata: true },
            });

            const result = await metadataClient.callTool({
                name: 'notebook',
                arguments: { action: 'rename', notebook: 'nb-1', name: 'Renamed' },
            });
            const payload = JSON.parse((result.content[0] as { text: string }).text);

            expect(payload.uiRefresh.operations).toEqual([{ type: 'reloadFiletree' }]);

            await metadataClient.close();
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

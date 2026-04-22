import { createServer } from 'node:net';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startHttpMcpServer, type HttpMcpServerHandle } from '@/core/http-transport';

const TOOL_CONFIG_PATH = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpToolsConfig';
const PERMISSIONS_PATH = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/notebookPermissions';

async function getAvailablePort(): Promise<number> {
    return await new Promise((resolve, reject) => {
        const server = createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                server.close(() => reject(new Error('Failed to acquire test port')));
                return;
            }
            const { port } = address;
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(port);
            });
        });
    });
}

function parseToolResultText(result: Awaited<ReturnType<Client['callTool']>>): unknown {
    const text = result.content?.find((item) => item.type === 'text')?.text ?? '';
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

describe('HTTP MCP concurrency', () => {
    let serverHandle: HttpMcpServerHandle | null = null;
    let storedFiles: Record<string, string>;
    let originalFetch: typeof global.fetch;
    const clients: Client[] = [];
    const transports: StreamableHTTPClientTransport[] = [];

    beforeEach(() => {
        process.env.SIYUAN_TOKEN = 'test-token';
        originalFetch = global.fetch;
        storedFiles = {
            [PERMISSIONS_PATH]: '{}',
            [TOOL_CONFIG_PATH]: '',
        };

        global.fetch = vi.fn().mockImplementation(async (url, init) => {
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

            if (urlStr.includes('/api/system/version')) {
                return {
                    ok: true,
                    json: async () => ({ code: 0, msg: 'success', data: '3.1.0' }),
                } as Response;
            }

            if (urlStr.includes('/api/system/currentTime')) {
                return {
                    ok: true,
                    json: async () => ({ code: 0, msg: 'success', data: 1712640000000 }),
                } as Response;
            }

            if (urlStr.startsWith('http://127.0.0.1:6806/')) {
                return {
                    ok: true,
                    json: async () => ({ code: 0, msg: 'success', data: {} }),
                } as Response;
            }

            return originalFetch(url, init);
        });
    });

    afterEach(async () => {
        while (clients.length) {
            const client = clients.pop();
            await client?.close().catch(() => {});
        }

        while (transports.length) {
            const transport = transports.pop();
            await transport?.close().catch(() => {});
        }

        await serverHandle?.close().catch(() => {});
        serverHandle = null;
        global.fetch = originalFetch;
        delete process.env.SIYUAN_TOKEN;
    });

    it('accepts two concurrent HTTP clients with isolated sessions', async () => {
        const port = await getAvailablePort();
        serverHandle = await startHttpMcpServer({
            host: '127.0.0.1',
            port,
            token: 'http-test-token',
            path: '/mcp',
        });

        const serverUrl = new URL(`http://127.0.0.1:${serverHandle.port}${serverHandle.path}`);
        const createClient = async (name: string) => {
            const client = new Client({ name, version: '1.0.0' });
            const transport = new StreamableHTTPClientTransport(serverUrl, {
                requestInit: {
                    headers: {
                        Authorization: 'Bearer http-test-token',
                    },
                },
            });

            clients.push(client);
            transports.push(transport);
            await client.connect(transport);
            return { client, transport };
        };

        const [{ client: clientA, transport: transportA }, { client: clientB, transport: transportB }] = await Promise.all([
            createClient('http-concurrency-a'),
            createClient('http-concurrency-b'),
        ]);

        expect(transportA.sessionId).toBeTruthy();
        expect(transportB.sessionId).toBeTruthy();
        expect(transportA.sessionId).not.toEqual(transportB.sessionId);

        const [
            toolsA,
            toolsB,
            versionAResult,
            versionBResult,
        ] = await Promise.all([
            clientA.listTools(),
            clientB.listTools(),
            clientA.callTool({ name: 'system', arguments: { action: 'get_version' } }),
            clientB.callTool({ name: 'system', arguments: { action: 'get_version' } }),
        ]);

        expect(toolsA.tools.map((tool) => tool.name)).toContain('system');
        expect(toolsB.tools.map((tool) => tool.name)).toContain('system');
        expect(parseToolResultText(versionAResult)).toEqual({ version: '3.1.0' });
        expect(parseToolResultText(versionBResult)).toEqual({ version: '3.1.0' });
        expect(storedFiles['/data/storage/petal/siyuan-plugins-mcp-sisyphus/puppyStats.json']).toBeTruthy();
    });

    it('accepts five concurrent HTTP clients across repeated read-only requests', async () => {
        const port = await getAvailablePort();
        serverHandle = await startHttpMcpServer({
            host: '127.0.0.1',
            port,
            token: 'http-test-token',
            path: '/mcp',
        });

        const serverUrl = new URL(`http://127.0.0.1:${serverHandle.port}${serverHandle.path}`);
        const createClient = async (index: number) => {
            const client = new Client({ name: `http-concurrency-${index}`, version: '1.0.0' });
            const transport = new StreamableHTTPClientTransport(serverUrl, {
                requestInit: {
                    headers: {
                        Authorization: 'Bearer http-test-token',
                    },
                },
            });

            clients.push(client);
            transports.push(transport);
            await client.connect(transport);
            return { client, transport };
        };

        const pairs = await Promise.all([1, 2, 3, 4, 5].map((index) => createClient(index)));
        const sessionIds = pairs.map(({ transport }) => transport.sessionId);

        expect(sessionIds.every(Boolean)).toBe(true);
        expect(new Set(sessionIds).size).toBe(5);

        const rounds = await Promise.all(
            pairs.map(async ({ client }) => {
                const [tools, versionResult, currentTimeResult] = await Promise.all([
                    client.listTools(),
                    client.callTool({ name: 'system', arguments: { action: 'get_version' } }),
                    client.callTool({ name: 'system', arguments: { action: 'get_current_time' } }),
                ]);

                return {
                    tools,
                    version: parseToolResultText(versionResult),
                    currentTime: parseToolResultText(currentTimeResult),
                };
            }),
        );

        for (const round of rounds) {
            expect(round.tools.tools.map((tool) => tool.name)).toContain('system');
            expect(round.version).toEqual({ version: '3.1.0' });
            expect(round.currentTime).toEqual({
                currentTime: 1712640000000,
                iso: new Date(1712640000000).toISOString(),
            });
        }
    });
});

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSiYuanServer } from '@/core/server';

function officialFetch(): typeof fetch {
    const sessionId = 'official-extension-session';
    return async (_input, init) => {
        if (init?.method === 'DELETE') return new Response(null, { status: 200 });
        const body = JSON.parse(String(init?.body ?? '{}'));
        if (body.method === 'initialize') {
            return new Response(JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                    protocolVersion: '2025-06-18',
                    capabilities: { tools: { listChanged: false } },
                    serverInfo: { name: 'SiYuan', version: '3.7.3' },
                },
            }), {
                headers: {
                    'Content-Type': 'application/json',
                    'Mcp-Session-Id': sessionId,
                },
            });
        }
        if (body.method === 'notifications/initialized') {
            return new Response(null, { status: 202 });
        }
        if (body.method === 'tools/list') {
            return new Response(JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                    tools: [{
                        name: 'plugin__example__aggregate',
                        title: 'Example aggregate',
                        description: 'An example plugin tool.',
                        inputSchema: {
                            type: 'object',
                            properties: { action: { type: 'string' } },
                            required: ['action'],
                        },
                        source: 'plugin',
                        readOnlyHint: true,
                        effectScope: 'local',
                    }],
                },
            }), { headers: { 'Content-Type': 'application/json' } });
        }
        if (body.method === 'tools/call') {
            return new Response(JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({ forwarded: body.params.arguments }),
                    }],
                },
            }), { headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(null, { status: 404 });
    };
}

describe('extension server integration', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete process.env.SIYUAN_TOKEN;
    });

    it('exposes official plugin tools as extension actions and forwards nested arguments', async () => {
        process.env.SIYUAN_TOKEN = 'test-token';
        global.fetch = vi.fn(async (input, init) => {
            const url = String(input);
            if (url.includes('/api/file/getFile')) {
                return { ok: true, text: async () => '' } as Response;
            }
            return new Response(JSON.stringify({ code: 0, msg: 'success', data: {} }), {
                headers: { 'Content-Type': 'application/json' },
            });
        });

        const server = await createSiYuanServer({ officialMcpFetch: officialFetch() });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        const client = new Client({ name: 'extension-test-client', version: '1.0.0' });
        await client.connect(clientTransport);

        try {
            const listed = await client.listTools();
            const extension = listed.tools.find((tool) => tool.name === 'extension');
            expect(extension).toBeDefined();
            expect((extension!.inputSchema.properties?.action as any).enum).toContain('plugin__example__aggregate');

            const result = await client.callTool({
                name: 'extension',
                arguments: {
                    action: 'plugin__example__aggregate',
                    arguments: { action: 'inner_action' },
                },
            });
            expect((result.content[0] as { text: string }).text).toContain('"action":"inner_action"');
        } finally {
            await client.close();
        }
    });
});

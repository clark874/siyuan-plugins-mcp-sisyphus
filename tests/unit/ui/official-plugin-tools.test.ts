import { afterEach, describe, expect, it, vi } from 'vitest';

import { discoverOfficialTools } from '@/ui/setting/official-plugin-tools';

describe('settings official MCP discovery', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('uses the official session, returns plugin/native tools, and excludes external MCP and itself', async () => {
        const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
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
                        'Mcp-Session-Id': 'settings-session',
                    },
                });
            }
            return new Response(JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                    tools: [
                        {
                            name: 'plugin__alpha__read',
                            title: 'Alpha read',
                            description: 'Read from alpha.',
                            source: 'plugin',
                            readOnlyHint: true,
                            effectScope: 'local',
                        },
                        { name: 'native__search', source: 'native' },
                        { name: 'document' },
                        { name: 'external__tool', source: 'mcp' },
                        {
                            name: 'plugin__siyuan_plugins_mcp_sisyphus__loop',
                            source: 'plugin',
                        },
                    ],
                },
            }), { headers: { 'Content-Type': 'application/json' } });
        });
        global.fetch = fetchMock as typeof fetch;

        const result = await discoverOfficialTools();

        expect(result.connected).toBe(true);
        expect(result.tools).toEqual([
            {
                name: 'document',
                title: undefined,
                description: undefined,
                source: 'native',
                readOnlyHint: false,
                effectScope: undefined,
                schemaBytes: 2,
            },
            {
                name: 'native__search',
                title: undefined,
                description: undefined,
                source: 'native',
                readOnlyHint: false,
                effectScope: undefined,
                schemaBytes: 2,
            },
            {
                name: 'plugin__alpha__read',
                title: 'Alpha read',
                description: 'Read from alpha.',
                source: 'plugin',
                readOnlyHint: true,
                effectScope: 'local',
                schemaBytes: 2,
            },
        ]);
        const listCall = fetchMock.mock.calls.find(([, init]) => String(init?.body).includes('tools/list'));
        expect(new Headers(listCall?.[1]?.headers).get('Mcp-Session-Id')).toBe('settings-session');
        expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
    });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import { discoverOfficialTools } from '@/ui/setting/official-plugin-tools';

describe('settings official MCP discovery', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('uses the official session, returns plugin/native tools, and excludes external MCP and itself', async () => {
        const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            if (String(_input) === '/api/system/version') {
                return new Response(JSON.stringify({
                    code: 0,
                    msg: '',
                    data: '3.7.3',
                }), { headers: { 'Content-Type': 'application/json' } });
            }
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
        expect(result.supported).toBe(true);
        expect(fetchMock.mock.calls[0][0]).toBe('/api/system/version');
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

    it('does not request /mcp when the SiYuan version is too old', async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            expect(String(input)).toBe('/api/system/version');
            return new Response(JSON.stringify({
                code: 0,
                msg: '',
                data: '3.6.9',
            }), { headers: { 'Content-Type': 'application/json' } });
        });
        global.fetch = fetchMock as typeof fetch;

        const result = await discoverOfficialTools();

        expect(result).toEqual(expect.objectContaining({
            connected: false,
            supported: false,
            siyuanVersion: '3.6.9',
            minSupportedVersion: '3.7.0',
            tools: [],
        }));
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

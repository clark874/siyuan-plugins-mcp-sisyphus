import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdkMocks = vi.hoisted(() => ({
    connect: vi.fn(),
    request: vi.fn(),
    callTool: vi.fn(),
    close: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
    Client: class {
        connect = sdkMocks.connect;
        request = sdkMocks.request;
        callTool = sdkMocks.callTool;
    },
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
    StreamableHTTPClientTransport: class {
        close = sdkMocks.close;
    },
}));

import { SiYuanClient } from '@/api/client';
import {
    OfficialMcpBridge,
    normalizeOfficialInputSchema,
    selectOfficialPluginTools,
} from '@/core/official-mcp-bridge';

describe('official MCP bridge', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sdkMocks.connect.mockResolvedValue(undefined);
        sdkMocks.close.mockResolvedValue(undefined);
    });

    it('preserves SiYuan plugin metadata and excludes other sources and itself', () => {
        const tools = selectOfficialPluginTools([
            {
                name: 'plugin__alpha__read',
                title: 'Read',
                description: 'Read from alpha.',
                inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
                source: 'plugin',
                readOnlyHint: true,
                effectScope: 'local',
            },
            {
                name: 'native__search',
                inputSchema: { type: 'object' },
                source: 'native',
            },
            {
                name: 'server__external',
                inputSchema: { type: 'object' },
                source: 'mcp',
            },
            {
                name: 'plugin__siyuan_plugins_mcp_sisyphus__loop',
                inputSchema: { type: 'object' },
                source: 'plugin',
            },
        ]);

        expect(tools).toEqual([expect.objectContaining({
            name: 'plugin__alpha__read',
            title: 'Read',
            readOnlyHint: true,
            effectScope: 'local',
            schemaDegraded: false,
        })]);
    });

    it('degrades invalid non-object input schemas', () => {
        expect(normalizeOfficialInputSchema({ type: 'string' })).toEqual({
            schema: { type: 'object', additionalProperties: true },
            degraded: true,
        });
        expect(normalizeOfficialInputSchema({ properties: { action: { type: 'string' } } })).toEqual({
            schema: {
                type: 'object',
                properties: { action: { type: 'string' } },
            },
            degraded: false,
        });
        expect(selectOfficialPluginTools([{
            name: 'plugin__alpha__malformed',
            description: 'Malformed but still discoverable.',
            inputSchema: 'not-an-object',
            source: 'plugin',
        }])).toEqual([expect.objectContaining({
            name: 'plugin__alpha__malformed',
            inputSchema: { type: 'object', additionalProperties: true },
            schemaDegraded: true,
        })]);
    });

    it('reconnects and retries discovery once while keeping custom metadata', async () => {
        sdkMocks.request
            .mockRejectedValueOnce(new Error('session expired'))
            .mockResolvedValueOnce({
                tools: [{
                    name: 'plugin__alpha__write',
                    description: 'Write through alpha.',
                    inputSchema: { type: 'object', properties: {} },
                    source: 'plugin',
                    readOnlyHint: false,
                    effectScope: 'local',
                }],
            });
        const bridge = new OfficialMcpBridge(new SiYuanClient({ baseUrl: 'http://127.0.0.1:6806' }));

        const snapshot = await bridge.refresh();

        expect(sdkMocks.request).toHaveBeenCalledTimes(2);
        expect(sdkMocks.connect).toHaveBeenCalledTimes(2);
        expect(snapshot.connected).toBe(true);
        expect(snapshot.tools[0]).toEqual(expect.objectContaining({
            name: 'plugin__alpha__write',
            readOnlyHint: false,
            effectScope: 'local',
        }));
    });

    it('never retries a dispatched plugin tool call', async () => {
        sdkMocks.callTool.mockRejectedValueOnce(new Error('socket closed'));
        const bridge = new OfficialMcpBridge(new SiYuanClient({ baseUrl: 'http://127.0.0.1:6806' }));

        const result = await bridge.callTool('plugin__alpha__write', { value: 1 });

        expect(sdkMocks.callTool).toHaveBeenCalledTimes(1);
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Execution status is unknown');
    });
});

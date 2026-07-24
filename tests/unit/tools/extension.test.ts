import { describe, expect, it, vi } from 'vitest';

import { buildDefaultToolConfig } from '@/core/config';
import type { OfficialMcpRuntime, OfficialPluginTool } from '@/core/official-mcp-bridge';
import {
    callExtensionTool,
    listExtensionTools,
    rebaseOfficialSchemaRefs,
} from '@/tools/extension';
import { createMockClient } from '../../helpers/mock-client';
import { createMockPermissionManager } from '../../helpers/mock-permissions';

function pluginTool(overrides: Partial<OfficialPluginTool> = {}): OfficialPluginTool {
    return {
        name: 'plugin__alpha__aggregate',
        title: 'Alpha aggregate',
        description: 'A plugin tool with its own action parameter.',
        inputSchema: {
            type: 'object',
            properties: {
                action: { type: 'string' },
                value: { type: 'number' },
            },
            required: ['action'],
        },
        source: 'plugin',
        readOnlyHint: false,
        effectScope: 'local',
        schemaDegraded: false,
        ...overrides,
    };
}

function fakeRuntime(tools = [pluginTool()]) {
    const callTool = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"ok":true}' }],
    });
    const refresh = vi.fn().mockResolvedValue({
        tools,
        connected: true,
        changed: false,
    });
    const bridge = {
        getTools: () => tools,
        getSnapshot: () => ({ tools, connected: true, changed: false }),
        refresh,
        callTool,
    };
    return {
        runtime: { bridge } as unknown as OfficialMcpRuntime,
        callTool,
        refresh,
    };
}

describe('extension tool', () => {
    it('builds one dynamic action branch and nests the downstream schema under arguments', () => {
        const config = buildDefaultToolConfig().extension;
        const { runtime } = fakeRuntime();

        const descriptor = listExtensionTools(config, runtime)[0];
        const schema = descriptor.inputSchema as any;
        const branch = schema.oneOf.find((item: any) => item.properties?.action?.const === 'plugin__alpha__aggregate');

        expect(schema.properties.action.enum).toContain('plugin__alpha__aggregate');
        expect(branch.required).toEqual(['action', 'arguments']);
        expect(branch.properties.arguments.properties.action).toEqual({ type: 'string' });
        expect(branch.description).toContain('Explicit user confirmation');
        expect(branch.readOnlyHint).toBe(false);
        expect(branch.effectScope).toBe('local');
    });

    it('rebases local downstream schema references after nesting under an action branch', () => {
        expect(rebaseOfficialSchemaRefs({
            type: 'object',
            properties: {
                item: { $ref: '#/$defs/Item' },
                external: { $ref: 'https://example.com/schema.json' },
            },
            $defs: {
                Item: {
                    type: 'object',
                    properties: { child: { $ref: '#/$defs/Item' } },
                },
            },
        }, '#/oneOf/2/properties/arguments')).toEqual({
            type: 'object',
            properties: {
                item: { $ref: '#/oneOf/2/properties/arguments/$defs/Item' },
                external: { $ref: 'https://example.com/schema.json' },
            },
            $defs: {
                Item: {
                    type: 'object',
                    properties: {
                        child: { $ref: '#/oneOf/2/properties/arguments/$defs/Item' },
                    },
                },
            },
        });
    });

    it('removes blocked tools from the exposed action schema', () => {
        const config = buildDefaultToolConfig().extension;
        config.blockedTools = ['plugin__alpha__aggregate'];
        const { runtime } = fakeRuntime();

        const descriptor = listExtensionTools(config, runtime)[0];

        expect((descriptor.inputSchema as any).properties.action.enum).not.toContain('plugin__alpha__aggregate');
    });

    it('forwards nested arguments unchanged exactly once', async () => {
        const config = buildDefaultToolConfig().extension;
        const { runtime, callTool } = fakeRuntime();
        const downstreamArgs = { action: 'inner_action', value: 42 };

        const result = await callExtensionTool(
            createMockClient(),
            {
                action: 'plugin__alpha__aggregate',
                arguments: downstreamArgs,
            },
            config,
            createMockPermissionManager(),
            runtime,
        );

        expect(callTool).toHaveBeenCalledTimes(1);
        expect(callTool).toHaveBeenCalledWith('plugin__alpha__aggregate', downstreamArgs);
        expect(result.isError).not.toBe(true);
    });

    it('refreshes once when a requested action is not cached', async () => {
        const config = buildDefaultToolConfig().extension;
        const tool = pluginTool();
        const callTool = vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'ok' }],
        });
        const bridge = {
            getTools: () => [],
            getSnapshot: () => ({ tools: [], connected: true, changed: false }),
            refresh: vi.fn().mockResolvedValue({
                tools: [tool],
                connected: true,
                changed: true,
            }),
            callTool,
        };
        const notifyToolListChanged = vi.fn();
        const runtime = { bridge, notifyToolListChanged } as unknown as OfficialMcpRuntime;

        await callExtensionTool(
            createMockClient(),
            { action: tool.name, arguments: {} },
            config,
            createMockPermissionManager(),
            runtime,
        );

        expect(bridge.refresh).toHaveBeenCalledTimes(1);
        expect(notifyToolListChanged).toHaveBeenCalledTimes(1);
        expect(callTool).toHaveBeenCalledTimes(1);
    });

    it('notifies after prepare discovers a changed action set without failing on notification errors', async () => {
        const { prepareExtensionTools } = await import('@/tools/extension');
        const config = buildDefaultToolConfig().extension;
        const refresh = vi.fn().mockResolvedValue({
            tools: [pluginTool()],
            connected: true,
            changed: true,
        });
        const notifyToolListChanged = vi.fn().mockRejectedValue(new Error('outer client closed'));
        const runtime = {
            bridge: { refresh },
            notifyToolListChanged,
        } as unknown as OfficialMcpRuntime;

        await expect(prepareExtensionTools(config, runtime)).resolves.toEqual(expect.objectContaining({
            changed: true,
        }));
        expect(notifyToolListChanged).toHaveBeenCalledTimes(1);
    });
});

import { describe, expect, it, vi } from 'vitest';

import { buildDefaultToolConfig } from '@/core/config';
import type { OfficialMcpRuntime, OfficialMcpTool } from '@/core/official-mcp-bridge';
import {
    callExtensionTool,
    listExtensionTools,
    prepareExtensionTools,
    rebaseOfficialSchemaRefs,
} from '@/tools/extension';
import { createMockClient } from '../../helpers/mock-client';
import { createMockPermissionManager } from '../../helpers/mock-permissions';

function pluginTool(overrides: Partial<OfficialMcpTool> = {}): OfficialMcpTool {
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

function nativeTool(overrides: Partial<OfficialMcpTool> = {}): OfficialMcpTool {
    return pluginTool({
        name: 'search',
        title: 'Native search',
        description: 'The native SiYuan search tool.',
        source: 'native',
        readOnlyHint: true,
        ...overrides,
    });
}

function unsafeNativeTool(overrides: Partial<OfficialMcpTool> = {}): OfficialMcpTool {
    return nativeTool({
        name: 'document',
        title: 'Native document',
        description: 'The native SiYuan document tool.',
        readOnlyHint: false,
        ...overrides,
    });
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
    it('does not discover official tools while extension is disabled', async () => {
        const config = buildDefaultToolConfig().extension;
        config.enabled = false;
        const { runtime, refresh } = fakeRuntime();

        await expect(prepareExtensionTools(config, runtime)).resolves.toBeUndefined();
        expect(refresh).not.toHaveBeenCalled();
    });

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

    it('removes blocked plugin and native tools from the exposed action schema', () => {
        const config = buildDefaultToolConfig().extension;
        config.includeNativeTools = true;
        config.blockedTools = ['plugin__alpha__aggregate', 'search'];
        const { runtime } = fakeRuntime([pluginTool(), nativeTool()]);

        const descriptor = listExtensionTools(config, runtime)[0];

        expect((descriptor.inputSchema as any).properties.action.enum).not.toContain('plugin__alpha__aggregate');
        expect((descriptor.inputSchema as any).properties.action.enum).not.toContain('search');
    });

    it('keeps native tools hidden when disabled and exposes only allowlisted names when enabled', () => {
        const config = buildDefaultToolConfig().extension;
        const native = nativeTool();
        const unsafe = unsafeNativeTool();
        const { runtime } = fakeRuntime([pluginTool(), native, unsafe]);

        config.includeNativeTools = false;
        let descriptor = listExtensionTools(config, runtime)[0];
        expect((descriptor.inputSchema as any).properties.action.enum).not.toContain(native.name);

        config.includeNativeTools = true;
        descriptor = listExtensionTools(config, runtime)[0];
        const branch = (descriptor.inputSchema as any).oneOf
            .find((item: any) => item.properties?.action?.const === native.name);
        expect((descriptor.inputSchema as any).properties.action.enum).toContain('search');
        expect((descriptor.inputSchema as any).properties.action.enum).not.toContain('document');
        expect(branch.source).toBe('native');
    });

    it('returns discovery counts without tool details while native tools are disabled', async () => {
        const config = buildDefaultToolConfig().extension;
        config.includeNativeTools = false;
        const tools = [pluginTool(), nativeTool()];
        const { runtime } = fakeRuntime(tools);

        const result = await callExtensionTool(
            createMockClient(),
            { action: 'list' },
            config,
            createMockPermissionManager(),
            runtime,
        );
        const payload = JSON.parse(result.content[0].text);

        expect(payload).toEqual(expect.objectContaining({
            discoveredCount: 2,
            discoveredBySource: { plugin: 1, native: 1 },
            nativeToolsEnabled: false,
            exposedCount: 1,
            detailsIncluded: false,
        }));
        expect(payload).not.toHaveProperty('tools');
        expect(result.content[0].text).not.toContain('The native SiYuan document tool.');
    });

    it('omits the discovered tool-name list from general help while native tools are disabled', async () => {
        const config = buildDefaultToolConfig().extension;
        config.includeNativeTools = false;
        const { runtime } = fakeRuntime([pluginTool(), nativeTool()]);

        const result = await callExtensionTool(
            createMockClient(),
            { action: 'help' },
            config,
            createMockPermissionManager(),
            runtime,
        );
        const payload = JSON.parse(result.content[0].text);

        expect(payload).toEqual(expect.objectContaining({
            discoveredCount: 2,
            discoveredBySource: { plugin: 1, native: 1 },
            detailsIncluded: false,
        }));
        expect(payload).not.toHaveProperty('discoveredTools');
    });

    it('does not expose official tools that conflict with reserved extension actions', async () => {
        const config = buildDefaultToolConfig().extension;
        config.includeNativeTools = true;
        const reserved = nativeTool({ name: 'help' });
        const { runtime } = fakeRuntime([reserved]);

        const descriptor = listExtensionTools(config, runtime)[0];
        expect((descriptor.inputSchema as any).properties.action.enum).toEqual(['help', 'list']);

        const result = await callExtensionTool(
            createMockClient(),
            { action: 'list' },
            config,
            createMockPermissionManager(),
            runtime,
        );
        const payload = JSON.parse(result.content[0].text);
        expect(payload.tools[0]).toEqual(expect.objectContaining({
            name: 'help',
            source: 'native',
            reservedActionConflict: true,
            exposed: false,
        }));
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

    it('rejects cached native tools while disabled and forwards them after the switch is enabled', async () => {
        const config = buildDefaultToolConfig().extension;
        const native = nativeTool();
        const { runtime, callTool } = fakeRuntime([native]);

        config.includeNativeTools = false;
        const disabledResult = await callExtensionTool(
            createMockClient(),
            { action: native.name, arguments: { action: 'semantic', query: 'knowledge' } },
            config,
            createMockPermissionManager(),
            runtime,
        );
        expect(disabledResult.isError).toBe(true);
        expect(disabledResult.content[0].text).toContain('includeNativeTools');
        expect(callTool).not.toHaveBeenCalled();

        config.includeNativeTools = true;
        const enabledResult = await callExtensionTool(
            createMockClient(),
            { action: native.name, arguments: { action: 'semantic', query: 'knowledge' } },
            config,
            createMockPermissionManager(),
            runtime,
        );
        expect(enabledResult.isError).not.toBe(true);
        expect(callTool).toHaveBeenCalledWith(native.name, { action: 'semantic', query: 'knowledge' });
    });

    it('allows only explicitly listed actions on mixed native tools', async () => {
        const config = buildDefaultToolConfig().extension;
        config.includeNativeTools = true;
        config.blockedTools = [];
        const history = nativeTool({ name: 'history', readOnlyHint: false });
        const { runtime, callTool } = fakeRuntime([history]);
        const permMgr = {
            ...createMockPermissionManager(),
            getAll: () => ({ notebook: 'rwd' }),
        } as never;

        const allowed = await callExtensionTool(
            createMockClient(),
            { action: 'history', arguments: { action: 'list', page: 1 } },
            config,
            permMgr,
            runtime,
        );
        expect(allowed.isError).not.toBe(true);
        expect(callTool).toHaveBeenCalledWith('history', { action: 'list', page: 1 });

        const rejected = await callExtensionTool(
            createMockClient(),
            { action: 'history', arguments: { action: 'rollback', id: 'snapshot-1' } },
            config,
            permMgr,
            runtime,
        );
        expect(rejected.isError).toBe(true);
        expect(rejected.content[0].text).toContain('native_action_not_allowed');
        expect(rejected.content[0].text).toContain('list');
        expect(callTool).toHaveBeenCalledTimes(1);
    });

    it('rejects unknown native actions instead of trusting a readOnly tool-level hint', async () => {
        const config = buildDefaultToolConfig().extension;
        config.includeNativeTools = true;
        config.blockedTools = [];
        const search = nativeTool({ name: 'search', readOnlyHint: true });
        const { runtime, callTool } = fakeRuntime([search]);
        const permMgr = {
            ...createMockPermissionManager(),
            getAll: () => ({ notebook: 'rwd' }),
        } as never;

        const result = await callExtensionTool(
            createMockClient(),
            { action: 'search', arguments: { action: 'replace', query: 'x' } },
            config,
            permMgr,
            runtime,
        );

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('native_action_not_allowed');
        expect(callTool).not.toHaveBeenCalled();
    });

    it('始终拒绝原生图片工具，即使用户清空持久化屏蔽列表', async () => {
        const config = buildDefaultToolConfig().extension;
        config.includeNativeTools = true;
        config.blockedTools = [];
        const image = nativeTool({ name: 'image', readOnlyHint: true });
        const { runtime, callTool } = fakeRuntime([image]);

        const descriptor = listExtensionTools(config, runtime)[0];
        const schema = descriptor.inputSchema as any;
        expect(schema.properties.action.enum).not.toContain('image');

        const result = await callExtensionTool(
            createMockClient(),
            { action: 'image', arguments: { action: 'analyze', path: 'assets/cover.png' } },
            config,
            createMockPermissionManager(),
            runtime,
        );
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Unknown official MCP tool "image"');
        expect(callTool).not.toHaveBeenCalled();
    });

    it('fails closed for workspace-reading native actions when any notebook is restricted', async () => {
        const config = buildDefaultToolConfig().extension;
        config.includeNativeTools = true;
        config.blockedTools = [];
        const repo = nativeTool({ name: 'repo', readOnlyHint: false });
        const { runtime, callTool } = fakeRuntime([repo]);
        const permMgr = {
            ...createMockPermissionManager(),
            getAll: () => ({ public: 'rwd', private: 'none' }),
        } as never;

        const result = await callExtensionTool(
            createMockClient(),
            { action: 'repo', arguments: { action: 'list' } },
            config,
            permMgr,
            runtime,
        );

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('native_permission_boundary');
        expect(callTool).not.toHaveBeenCalled();
    });

    it('keeps actionless open-web tools callable but rejects unexpected inner actions', async () => {
        const config = buildDefaultToolConfig().extension;
        config.includeNativeTools = true;
        const webFetch = nativeTool({ name: 'web_fetch', readOnlyHint: true });
        const { runtime, callTool } = fakeRuntime([webFetch]);

        const allowed = await callExtensionTool(
            createMockClient(),
            { action: 'web_fetch', arguments: { url: 'https://example.org/' } },
            config,
            createMockPermissionManager(),
            runtime,
        );
        expect(allowed.isError).not.toBe(true);

        const rejected = await callExtensionTool(
            createMockClient(),
            { action: 'web_fetch', arguments: { action: 'write', url: 'https://example.org/' } },
            config,
            createMockPermissionManager(),
            runtime,
        );
        expect(rejected.isError).toBe(true);
        expect(callTool).toHaveBeenCalledTimes(1);
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
        const config = buildDefaultToolConfig().extension;
        const refresh = vi.fn().mockResolvedValue({
            tools: [pluginTool()],
            connected: true,
            changed: true,
        });
        const notifyToolListChanged = vi.fn().mockRejectedValue(new Error('outer client closed'));
        const runtime = {
            bridge: {
                refresh,
                getTools: () => [pluginTool()],
                getSnapshot: () => ({
                    tools: [],
                    connected: false,
                    minSupportedVersion: '3.7.0',
                    changed: false,
                }),
            },
            notifyToolListChanged,
        } as unknown as OfficialMcpRuntime;

        await expect(prepareExtensionTools(config, runtime)).resolves.toEqual(expect.objectContaining({
            changed: true,
        }));
        expect(notifyToolListChanged).toHaveBeenCalledTimes(1);
    });

    it('notifies when includeNativeTools changes the exposed action set', async () => {
        const config = buildDefaultToolConfig().extension;
        config.includeNativeTools = false;
        const tools = [pluginTool(), nativeTool()];
        const runtime = {
            bridge: {
                refresh: vi.fn().mockResolvedValue({
                    tools,
                    connected: true,
                    changed: false,
                }),
                getTools: () => tools,
                getSnapshot: () => ({
                    tools,
                    connected: true,
                    supported: true,
                    minSupportedVersion: '3.7.0',
                    lastAttemptAt: '2026-07-28T00:00:00.000Z',
                    changed: false,
                }),
            },
            notifyToolListChanged: vi.fn(),
        } as unknown as OfficialMcpRuntime;

        await prepareExtensionTools(config, runtime);
        config.includeNativeTools = true;
        await prepareExtensionTools(config, runtime);

        expect(runtime.notifyToolListChanged).toHaveBeenCalledTimes(2);
    });

    it('uses a completed discovery snapshot without refreshing on every tools/list', async () => {
        const config = buildDefaultToolConfig().extension;
        const tools = [pluginTool()];
        const refresh = vi.fn();
        const runtime = {
            bridge: {
                getSnapshot: () => ({
                    tools,
                    connected: true,
                    supported: true,
                    minSupportedVersion: '3.7.0',
                    lastAttemptAt: '2026-07-28T00:00:00.000Z',
                    lastSuccessfulRefreshAt: '2026-07-28T00:00:00.000Z',
                    changed: false,
                }),
                getTools: () => tools,
                refresh,
            },
        } as unknown as OfficialMcpRuntime;

        await prepareExtensionTools(config, runtime);
        await prepareExtensionTools(config, runtime);

        expect(refresh).not.toHaveBeenCalled();
    });

    it('starts discovery in the background without delaying the outer tools/list', async () => {
        const config = buildDefaultToolConfig().extension;
        const tools = [pluginTool()];
        let resolveRefresh!: (snapshot: any) => void;
        const refresh = vi.fn(() => new Promise((resolve) => {
            resolveRefresh = resolve;
        }));
        const notifyToolListChanged = vi.fn();
        const runtime = {
            bridge: {
                getSnapshot: () => ({
                    tools: [],
                    connected: false,
                    minSupportedVersion: '3.7.0',
                    changed: false,
                }),
                getTools: () => [],
                refresh,
            },
            discoveryMode: 'background',
            notifyToolListChanged,
        } as unknown as OfficialMcpRuntime;

        const snapshot = await prepareExtensionTools(config, runtime);

        expect(snapshot?.tools).toEqual([]);
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(notifyToolListChanged).not.toHaveBeenCalled();

        resolveRefresh({
            tools,
            connected: true,
            supported: true,
            minSupportedVersion: '3.7.0',
            lastAttemptAt: '2026-07-28T00:00:00.000Z',
            changed: true,
        });
        await runtime.discoveryPromise;

        expect(notifyToolListChanged).toHaveBeenCalledTimes(1);
    });
});

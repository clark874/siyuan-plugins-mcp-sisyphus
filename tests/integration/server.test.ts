import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';

import { TOOL_CATEGORIES, resetToolConfigWarningStateForTests } from '@/core/config';
import {
    MCP_APPS_EXTENSION_ID,
    MCP_APP_MIME_TYPE,
    MCP_APP_RESOURCE_URIS,
    TIMELINE_APP_ACTION_TOOL_NAME,
    TIMELINE_APP_TOOL_NAME,
} from '@/core/mcp-apps';
import { createSiYuanServer, getMcpServerHelpText } from '@/core/server';

const jsonResponse = (payload: unknown): Response => ({
    ok: true,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
} as Response);

describe('MCP 服务集成', () => {
    let client: Client;
    let storedFiles: Record<string, string>;

    beforeEach(async () => {
        resetToolConfigWarningStateForTests();
        process.env.SIYUAN_TOKEN = 'test-token';
        storedFiles = {
            '/data/storage/petal/siyuan-plugins-mcp-sisyphus/notebookPermissions': '{}',
            '/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpToolsConfig': '',
        };
        global.fetch = vi.fn(async (url, init) => {
            const urlStr = String(url);
            if (urlStr.includes('/api/file/getFile')) {
                const body = init?.body ? JSON.parse(String(init.body)) as { path?: string } : {};
                return { ok: true, text: async () => storedFiles[body.path ?? ''] ?? '' } as Response;
            }
            if (urlStr.includes('/api/file/putFile')) {
                const formData = init?.body as FormData;
                const filePath = String(formData.get('path') ?? '');
                const file = formData.get('file');
                storedFiles[filePath] = file instanceof File ? await file.text() : String(file ?? '');
                return jsonResponse({ code: 0, msg: 'success', data: null });
            }
            if (urlStr.includes('/api/system/version')) {
                return jsonResponse({ code: 0, msg: 'success', data: '3.8.3' });
            }
            return jsonResponse({ code: 0, msg: 'success', data: {} });
        });

        const server = await createSiYuanServer();
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        client = new Client({ name: 'test-client', version: '1.0.0' });
        await client.connect(clientTransport);
    });

    afterEach(async () => {
        await client.close();
        delete process.env.SIYUAN_TOKEN;
        delete process.env.SIYUAN_MCP_SKILLS_EXTENSION;
    });

    it('帮助文本保留两种传输方式', () => {
        const help = getMcpServerHelpText();
        expect(help).toContain('node mcp-server.cjs');
        expect(help).toContain('--http');
        expect(help).toContain('SIYUAN_MCP_TRANSPORT=http');
    });

    it('只列出十三个聚合工具并可调用保留动作', async () => {
        const { tools } = await client.listTools();
        expect(tools.map((tool) => tool.name)).toEqual(TOOL_CATEGORIES);
        expect(tools.map((tool) => tool.name)).not.toEqual(expect.arrayContaining(['mascot', 'feedback', 'flashcard']));
        for (const tool of tools) {
            expect(tool.inputSchema.properties?.action).toBeDefined();
            expect(tool.description).toEqual(expect.any(String));
        }

        const result = await client.callTool({ name: 'system', arguments: { action: 'get_version' } });
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toEqual(expect.objectContaining({ version: '3.8.3' }));
    });

    it('协商 MCP Apps 后只提供时间线界面', async () => {
        const server = await createSiYuanServer();
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        const appsClient = new Client(
            { name: 'apps-client', version: '1.0.0' },
            { capabilities: { extensions: { [MCP_APPS_EXTENSION_ID]: { mimeTypes: [MCP_APP_MIME_TYPE] } } } },
        );
        await appsClient.connect(clientTransport);

        const { tools } = await appsClient.listTools();
        const launcher = tools.find((tool) => tool.name === TIMELINE_APP_TOOL_NAME) as any;
        const actionTool = tools.find((tool) => tool.name === TIMELINE_APP_ACTION_TOOL_NAME) as any;
        expect(launcher?._meta?.ui?.resourceUri).toBe(MCP_APP_RESOURCE_URIS.timeline);
        expect(actionTool?.inputSchema?.properties?.action?.enum).toEqual([
            'list_nodes', 'create_node', 'compare_node', 'help',
        ]);
        expect(JSON.stringify(tools)).not.toMatch(/flashcard|mascot|shop|feedback/);

        const resource = await appsClient.readResource({ uri: MCP_APP_RESOURCE_URIS.timeline });
        expect(resource.contents[0]).toEqual(expect.objectContaining({
            uri: MCP_APP_RESOURCE_URIS.timeline,
            mimeType: MCP_APP_MIME_TYPE,
            text: expect.stringContaining('SiYuan MCP App'),
        }));
        await appsClient.close();
    });

    it('拒绝已经删除的工具', async () => {
        const result = await client.callTool({ name: 'feedback', arguments: { action: 'submit' } });
        expect(result.isError).toBe(true);
        expect(result.content.find((item) => item.type === 'text')?.text).toContain('Unknown tool');
    });
});

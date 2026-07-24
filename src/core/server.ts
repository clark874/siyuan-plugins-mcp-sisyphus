import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, GetPromptRequestSchema, ListPromptsRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema, McpError, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { startHttpMcpServer, type TlsOptions } from './http-transport';
import { buildServerInstructions } from './server-instructions';

import { SiYuanClient } from '../api/client';
import { buildDefaultToolConfig, loadToolConfigFromApiFileWithStatus, type ToolConfig, type ToolConfigLoadResult } from './config';
import { noopSchemaValidator } from './noops/noop-schema-validator';
import { OfficialMcpBridge, type OfficialMcpRuntime } from './official-mcp-bridge';

import { PermissionManager } from './permissions';
import { listHelpResources, listHelpResourceTemplates, readHelpResource } from './resources';
import { listAllTools, prepareAllTools, resolveCategory, TOOL_REGISTRY } from './tool-registry';
import { runToolCall } from './tool-lifecycle';
import { getMcpPrompt, listMcpPrompts } from './skills';

export { buildServerInstructions } from './server-instructions';

export function getMcpServerHelpText(): string {
    return [
        'SiYuan MCP Sisyphus server',
        '',
        'Usage:',
        '  node mcp-server.cjs                  Start MCP over stdio (default)',
        '  node mcp-server.cjs --http           Start MCP over HTTP/SSE',
        '  SIYUAN_MCP_TRANSPORT=http node mcp-server.cjs',
        '',
        'SiYuan API environment:',
        '  SIYUAN_API_URL=http://127.0.0.1:6806  SiYuan API base URL',
        '  SIYUAN_TOKEN=...                      SiYuan API token',
        '',
        'HTTP MCP environment:',
        '  SIYUAN_MCP_HOST=127.0.0.1             Bind host, default 127.0.0.1',
        '  SIYUAN_MCP_PORT=36806                 Bind port, default 36806',
        '  SIYUAN_MCP_PATH=/mcp                  HTTP MCP path, default /mcp',
        '  SIYUAN_MCP_TOKEN=...                  Bearer token for MCP HTTP clients',
        '',
        'TLS environment:',
        '  SIYUAN_MCP_TLS_CERT=/path/cert.pem',
        '  SIYUAN_MCP_TLS_KEY=/path/key.pem',
        '  SIYUAN_MCP_TLS_CA=/path/ca.pem        Optional client CA',
        '',
        'Examples:',
        '  node mcp-server.cjs',
        '  SIYUAN_TOKEN=xxx node mcp-server.cjs',
        '  SIYUAN_MCP_TOKEN=secret node mcp-server.cjs --http',
        '  SIYUAN_MCP_HOST=127.0.0.1 SIYUAN_MCP_PORT=36806 node mcp-server.cjs --http',
        '',
    ].join('\n');
}

async function tryReadConfigFromAPI(client: SiYuanClient): Promise<ToolConfig | null> {
    const result = await loadToolConfigFromApiFileWithStatus(client);
    return result.ok && result.rawLength !== 0 ? result.config : null;
}

async function initSiYuanClient(): Promise<SiYuanClient> {
    const client = new SiYuanClient();

    const envToken = process.env.SIYUAN_TOKEN;
    if (envToken) {
        client.setToken(envToken);
    }

    return client;
}

function createFastClient(): SiYuanClient {
    const client = new SiYuanClient({ timeout: 3000 });
    const envToken = process.env.SIYUAN_TOKEN;
    if (envToken) {
        client.setToken(envToken);
    }
    return client;
}

function createInstructionClient(): SiYuanClient {
    const client = new SiYuanClient({ timeout: 10000 });
    const envToken = process.env.SIYUAN_TOKEN;
    if (envToken) {
        client.setToken(envToken);
    }
    return client;
}

export interface CreateSiYuanServerOptions {
    officialMcpFetch?: typeof fetch;
}

export async function createSiYuanServer(options: CreateSiYuanServerOptions = {}): Promise<Server> {
    const client = await initSiYuanClient();
    const fastClient = createFastClient();
    const instructionClient = createInstructionClient();

    async function getToolConfig(): Promise<ToolConfig> {
        try {
            const config = await tryReadConfigFromAPI(fastClient);
            if (config) return config;
        } catch {
            // SiYuan unreachable — fall back to defaults below.
        }
        return buildDefaultToolConfig();
    }

    const initialConfigLoad: ToolConfigLoadResult = await loadToolConfigFromApiFileWithStatus(instructionClient);
    const initialConfig = initialConfigLoad.config;
    const officialMcpBridge = new OfficialMcpBridge(client, { fetch: options.officialMcpFetch });
    const server = new Server(
        { name: 'siyuan-mcp', version: '2.0.0' },
        {
            capabilities: { tools: { listChanged: true }, resources: {}, prompts: {} },
            instructions: buildServerInstructions({
                userRulesText: initialConfig.userRulesText,
                agentSiyuanMemoryText: initialConfig.agentSiyuanMemoryText,
                agentSiyuanMemoryUpdatedAt: initialConfig.agentSiyuanMemoryUpdatedAt,
                agentSiyuanMemoryConfigSource: initialConfigLoad.source,
                agentSiyuanMemoryConfigOk: initialConfigLoad.ok,
                agentSiyuanMemoryConfigError: initialConfigLoad.errorMessage,
            }).trim(),
            jsonSchemaValidator: noopSchemaValidator,
        },
    );
    const officialMcpRuntime: OfficialMcpRuntime = {
        bridge: officialMcpBridge,
        notifyToolListChanged: () => server.sendToolListChanged(),
    };
    server.onclose = () => {
        void officialMcpBridge.close();
    };
    const permMgr = new PermissionManager(fastClient);
    try {
        await permMgr.load();
    } catch {
        // SiYuan offline — permissions default to rwd (no restrictions).
    }

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        const config = await getToolConfig();
        await prepareAllTools(config, officialMcpRuntime);
        return { tools: listAllTools(config, officialMcpRuntime) };
    });

    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        return { resources: listHelpResources() };
    });

    server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
        return { resourceTemplates: listHelpResourceTemplates() };
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const config = await getToolConfig();
        const resource = readHelpResource(request.params.uri, config.userRulesText);
        if (!resource) {
            throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${request.params.uri}`);
        }
        return { contents: [resource] };
    });

    server.setRequestHandler(ListPromptsRequestSchema, async () => {
        return { prompts: listMcpPrompts() };
    });

    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        const prompt = getMcpPrompt(request.params.name, request.params.arguments?.task);
        if (!prompt) {
            throw new McpError(ErrorCode.InvalidParams, `Unknown prompt: ${request.params.name}`);
        }
        return prompt;
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        const action = typeof args?.action === 'string' ? args.action : 'unknown';
        const category = resolveCategory(name);
        if (!category) {
            return {
                content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
                isError: true,
            };
        }

        const config = await getToolConfig();
        if (!config[category].enabled) {
            return {
                content: [{ type: 'text' as const, text: `Tool "${name}" is disabled.` }],
                isError: true,
            };
        }

        const module = TOOL_REGISTRY[category];
        const result = await runToolCall(
            {
                client,
                category,
                name,
                action,
                args,
                requestText: category === 'extension'
                    ? JSON.stringify({ name, action })
                    : JSON.stringify({ name, arguments: args ?? {} }),
                slimResponses: config.debug.slimResponses,
            },
            () => module.callTool(client, args, config[category], permMgr, officialMcpRuntime),
        );
        // The MCP SDK CallToolResult uses a wider ContentBlock union; our
        // ToolResult always emits text-only content, which is a valid subset.
        return result as { content: { type: 'text'; text: string }[]; isError?: boolean };
    });

    return server;
}

function parseTransportMode(): 'stdio' | 'http' {
    if (typeof process === 'undefined') return 'stdio';
    if (Array.isArray(process.argv) && process.argv.includes('--http')) return 'http';
    const env = (process.env.SIYUAN_MCP_TRANSPORT ?? '').toLowerCase();
    if (env === 'http') return 'http';
    return 'stdio';
}

export async function startMcpServer() {
    process.on('uncaughtException', (error) => {
        console.error('[MCP] Uncaught exception:', error instanceof Error ? error.message : String(error));
    });

    process.on('unhandledRejection', (reason) => {
        console.error('[MCP] Unhandled rejection:', reason instanceof Error ? reason.message : String(reason));
    });

    const mode = parseTransportMode();

    if (mode === 'http') {
        const portRaw = process.env.SIYUAN_MCP_PORT ?? '36806';
        const port = parseInt(portRaw, 10);
        if (!Number.isFinite(port) || port <= 0 || port > 65535) {
            throw new Error(`[MCP] invalid SIYUAN_MCP_PORT: ${portRaw}`);
        }
        const certFile = process.env.SIYUAN_MCP_TLS_CERT;
        const keyFile = process.env.SIYUAN_MCP_TLS_KEY;
        let tls: TlsOptions | undefined;
        if (certFile && keyFile) {
            tls = {
                certFile,
                keyFile,
                caFile: process.env.SIYUAN_MCP_TLS_CA || undefined,
            };
        } else if (certFile || keyFile) {
            throw new Error('[MCP] HTTPS requires both SIYUAN_MCP_TLS_CERT and SIYUAN_MCP_TLS_KEY to be set.');
        }

        await startHttpMcpServer({
            host: process.env.SIYUAN_MCP_HOST ?? '127.0.0.1',
            port,
            token: process.env.SIYUAN_MCP_TOKEN || undefined,
            path: process.env.SIYUAN_MCP_PATH || '/mcp',
            serverFactory: createSiYuanServer,
            tls,
        });
        return;
    }

    const server = await createSiYuanServer();
    const transport = new StdioServerTransport(
        typeof process !== 'undefined' ? process.stdin : undefined,
        typeof process !== 'undefined' ? process.stdout : undefined,
    );
    await server.connect(transport);
}

if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        process.stdout.write(getMcpServerHelpText());
        process.exit(0);
    }
    startMcpServer().catch((error) => {
        console.error('[MCP] Failed to start server:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}

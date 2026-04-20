import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema, McpError, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { startHttpMcpServer, type TlsOptions } from './http-transport';

import { SiYuanClient } from '../api/client';
import { buildDefaultToolConfig, formatDangerousActionsList, normalizeToolConfig, type ToolConfig } from './config';
import { noopSchemaValidator } from './noop-schema-validator';
import { PermissionManager } from './permissions';
import { listHelpResources, listHelpResourceTemplates, readHelpResource } from './resources';
import { listAllTools, resolveCategory, TOOL_REGISTRY } from './tool-registry';
import { runToolCall } from './tool-lifecycle';

const PLUGIN_CONFIG_PATH = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpToolsConfig';

function formatUserRules(userRulesText = ''): string {
    const normalizedUserRules = typeof userRulesText === 'string' ? userRulesText.trim() : '';
    if (!normalizedUserRules) return '';

    const lines = normalizedUserRules
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

    if (lines.length === 0) return '';

    return lines.map(line => `- ${line}`).join('\n');
}

export function buildServerInstructions(userRulesText = ''): string {
    const dangerousActionsList = formatDangerousActionsList().join('\n');
    const formattedUserRules = formatUserRules(userRulesText);
    const userRulesPrioritySection = formattedUserRules
        ? `
## User custom rules priority

When applicable, you MUST follow these user custom rules as a higher-priority preference layer than the general usage suggestions below.
- If a user custom rule conflicts with a general recommendation in these instructions, follow the user custom rule unless that would violate a safety or confirmation requirement.
- Before calling tools or generating SiYuan content, quickly check whether the action should follow one of these user custom rules.

## User custom rules

${formattedUserRules}
`
        : '';
    const userRulesReminder = formattedUserRules
        ? '\nUser custom rules override the general style and workflow suggestions below when they apply.\n'
        : '';
    return `
${userRulesPrioritySection}

## Help and progressive disclosure

Each tool exposes common actions in its description. For detailed help on any action (including advanced ones):
- Read MCP resources: siyuan://help/action/{tool}/{action}, siyuan://help/tool-overview, siyuan://help/document-path-semantics, siyuan://help/examples, siyuan://help/ai-layout-guide
- If your client cannot read siyuan:// resources, call any tool with action=”help” to get the same guidance (actions, required fields, hints, and examples).

## Path semantics (critical — the most common error source)

There are exactly two path types. Do not mix them.

| Type | Used by | Example |
|------|---------|---------|
| Human-readable | document(action=”create”), document(action=”get_ids”) | /Inbox/Weekly Note |
| Storage path | document(action=”rename”), remove, move, get_hpath (with notebook+path) | /20240318112233-abc123.sy |

Safe workflow: call document(action=”get_path”, id=...) first, then reuse the returned storage path.

WRONG: document(action=”rename”, notebook=”...”, path=”/Inbox/Weekly Note”, title=”New Title”) — this will fail because rename expects a storage path, not a human-readable path.
CORRECT: document(action=”rename”, notebook=”...”, path=”/20240318112233-abc123.sy”, title=”New Title”)

## High-risk operations confirmation

Before calling any of the following actions, you MUST clearly describe the action to the user and wait for explicit confirmation. Do not call them without user confirmation.

**Actions that require confirmation:**
${dangerousActionsList}
- \`file(action=”export_resources”, outputPath=...)\`

Flow: State “I will do X. Proceed?” and only call the tool after the user explicitly agrees.

Additional rules:
- file(action=”upload_asset”) reads a local file path and uploads it into SiYuan assets. Treat this as high-risk.
- If file(action=”upload_asset”) targets a file larger than the configured large-upload threshold (10 MB by default), you MUST stop, tell the user, and only retry after explicit confirmation using confirmLargeFile=true.
- file(action=”export_resources”) without outputPath only generates a ZIP in SiYuan's managed temp area.
- file(action=”export_resources”, outputPath=...) writes to the local filesystem and MUST be treated as high-risk.

## Block insertion semantics

- block(action=”prepend”) with a document ID inserts at the start of the document.
- block(action=”append”) with a document ID inserts at the end of the document.
- With a block ID, prepend/append operate on that block's child list.
- block(action=”update”) is best for single-block replacement. Multi-line markdown may be truncated to the first line by SiYuan; use block(action=”append”), prepend, or insert when you need multiple blocks, tables, or longer multi-line content.

## Tag creation semantics

- There is no direct create action for tags.
- To create a real SiYuan tag in block markdown, use #tag# with both leading and trailing # characters. Hierarchical: #project/phase#.
- Example: block(action=”update”, dataType=”markdown”, data=”#holiday# #home#”)

## Flashcard semantics

- To turn a block into a flashcard, prefer flashcard(action=”create_card”), which writes “custom-riff-decks” and registers the riff card together.
- block(action=”set_attrs”) with “custom-riff-decks” only writes the metadata binding and is not the full “make flashcard” workflow by itself.
- Common pattern: h2 heading as the question, following blocks as the answer.
- Cloze: \`==answer==\` is treated as a cloze answer in flashcard review.
- For scheduled review and deck operations, prefer the dedicated \`flashcard\` tool.

## SiYuan layout model (summary)

When the user asks for polished SiYuan content, consider native layout features instead of plain paragraphs:
1. Start with headings, paragraphs, lists, task lists, blockquotes, callouts, tables, math blocks, and code blocks.
2. When the user asks for a diary entry, journal, daily log, or today’s note in a notebook, prefer \`document(action="create_daily_note")\` instead of manually creating a dated path and then appending content.
3. For side-by-side comparison, cards, or dashboards, use Kramdown super blocks (\`{{{col\` / \`{{{row\`).
4. For metadata, workflow markers, or styling, use block attributes (\`name\`, \`alias\`, \`memo\`, \`bookmark\`, \`custom-*\`, \`style\`).
5. For diagrams, charts, mind maps, use renderer code blocks (\`mindmap\`, \`mermaid\`, \`flowchart\`, \`graphviz\`, \`plantuml\`, \`echarts\`, \`abc\`).
6. For playback, embeds, dynamic queries, or structured records, use \`video\`, \`audio\`, \`iframe\`, \`html\`, \`query_embed\`, or database blocks \`av\`.
7. For real database operations, prefer the dedicated \`av\` tool instead of describing an \`av\` block abstractly.

Critical anti-patterns — do NOT:
- Use \`::: row\`, raw HTML \`<div>\`, or \`===\` separators as super block substitutes.
- Confuse Markdown tables with database blocks, or bookmarks (block attributes) with tags (inline markdown).
- Fake database blocks with Markdown tables when a real \`av\` workflow is required.
- Claim that a real \`av\` block exists after only initializing AV metadata without materializing the NodeAttributeView block into the document tree.

For the full layout guide with formatting inventory, distinctions, and daily heuristics, read siyuan://help/ai-layout-guide or call any tool with action=”help”.

## Usage semantics

- Bookmarks = collecting existing blocks (block attributes). Tags = inline markdown \`#tag#\`. Do not confuse them.
- Flashcards are review semantics, not layout. Layout choice and flashcard marking are separate concerns.
- Through MCP, prefer creating content directly instead of describing UI-only steps like \`/AI 编写\`.
${userRulesReminder}
`;
}


async function tryReadConfigFromAPI(client: SiYuanClient): Promise<ToolConfig | null> {
    try {
        const content = await client.readFile(PLUGIN_CONFIG_PATH);
        if (content) {
            return normalizeToolConfig(JSON.parse(content));
        }
    } catch {
        // Ignore missing or invalid config files.
    }
    return null;
}

const CONFIG_TTL_MS = 30_000;

async function initSiYuanClient(): Promise<SiYuanClient> {
    const client = new SiYuanClient();

    const envToken = process.env.SIYUAN_TOKEN;
    if (envToken) {
        client.setToken(envToken);
    }

    return client;
}

export async function createSiYuanServer(): Promise<Server> {
    const client = await initSiYuanClient();
    let cachedConfig: ToolConfig | null = null;
    let cachedConfigAt = 0;
    let inFlight: Promise<ToolConfig> | null = null;

    async function getToolConfig(): Promise<ToolConfig> {
        const now = Date.now();
        if (cachedConfig && now - cachedConfigAt < CONFIG_TTL_MS) {
            return cachedConfig;
        }

        if (inFlight) {
            return inFlight;
        }

        inFlight = (async () => {
            try {
                const config = await tryReadConfigFromAPI(client);
                cachedConfig = config ?? buildDefaultToolConfig();
                cachedConfigAt = Date.now();
                return cachedConfig;
            } finally {
                inFlight = null;
            }
        })();
        return inFlight;
    }

    const initialConfig = await getToolConfig();
    const server = new Server(
        { name: 'siyuan-mcp', version: '2.0.0' },
        {
            capabilities: { tools: {}, resources: {} },
            instructions: buildServerInstructions(initialConfig.userRulesText).trim(),
            jsonSchemaValidator: noopSchemaValidator,
        },
    );
    const permMgr = new PermissionManager(client);
    await permMgr.load();

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        const config = await getToolConfig();
        return { tools: listAllTools(config) };
    });

    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        return { resources: listHelpResources() };
    });

    server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
        return { resourceTemplates: listHelpResourceTemplates() };
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const resource = readHelpResource(request.params.uri);
        if (!resource) {
            throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${request.params.uri}`);
        }
        return { contents: [resource] };
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
            { client, category, name, action, args },
            () => module.callTool(client, args, config[category], permMgr),
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
    startMcpServer().catch((error) => {
        console.error('[MCP] Failed to start server:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}

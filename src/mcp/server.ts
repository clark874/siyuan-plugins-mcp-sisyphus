import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema, McpError, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';

import { startHttpMcpServer } from './http-transport';

import { SiYuanClient } from '../api/client';
import { buildDefaultToolConfig, formatDangerousActionsList, normalizeToolConfig, TOOL_CATEGORIES, type ToolCategory, type ToolConfig } from './config';
import { PermissionManager } from './permissions';
import { listHelpResources, listHelpResourceTemplates, readHelpResource } from './resources';
import { callBlockTool, listBlockTools } from './tools/block';
import { callAvTool, listAvTools } from './tools/av';
import { callDocumentTool, listDocumentTools } from './tools/document';
import { callFileTool, listFileTools } from './tools/file';
import { callNotebookTool, listNotebookTools } from './tools/notebook';
import { callSearchTool, listSearchTools } from './tools/search';
import { callSystemTool, listSystemTools } from './tools/system';
import { callTagTool, listTagTools } from './tools/tag';
import { callFlashcardTool, listFlashcardTools } from './tools/flashcard';
import { earnPuppyBalance, readPuppyStats, writePuppyEvent } from './puppy-state';
import { callMascotTool, listMascotTools } from './tools/mascot';
import { isPluginMode } from './runtime';

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

- To mark a block as a flashcard, set “custom-riff-decks” with block(action=”set_attrs”).
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
- Claim that MCP created a brand-new real \`av\` block from scratch when the current AV tool version does not support that operation.

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

function tryReadConfigFromFileSystem(): ToolConfig | null {
    const possiblePaths: string[] = [];
    const envDataDir = process.env.SIYUAN_DATA_DIR;
    if (envDataDir) {
        possiblePaths.push(path.join(envDataDir, 'data', 'storage', 'petal', 'siyuan-plugins-mcp-sisyphus', 'mcpToolsConfig'));
        possiblePaths.push(path.join(envDataDir, 'storage', 'petal', 'siyuan-plugins-mcp-sisyphus', 'mcpToolsConfig'));
    }

    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    if (homeDir) {
        possiblePaths.push(path.join(homeDir, 'SiYuan', 'data', 'storage', 'petal', 'siyuan-plugins-mcp-sisyphus', 'mcpToolsConfig'));
        possiblePaths.push(path.join(homeDir, '.siyuan', 'data', 'storage', 'petal', 'siyuan-plugins-mcp-sisyphus', 'mcpToolsConfig'));
        if (process.platform === 'win32') {
            const appData = process.env.APPDATA || '';
            if (appData) {
                possiblePaths.push(path.join(appData, 'SiYuan', 'data', 'storage', 'petal', 'siyuan-plugins-mcp-sisyphus', 'mcpToolsConfig'));
            }
        }
    }

    for (const configPath of possiblePaths) {
        if (!fs.existsSync(configPath)) continue;
        try {
            return normalizeToolConfig(JSON.parse(fs.readFileSync(configPath, 'utf-8')));
        } catch {
            // Ignore parse errors and continue with fallbacks.
        }
    }

    return null;
}

async function getToolConfig(client?: SiYuanClient): Promise<ToolConfig> {
    if (client && isPluginMode()) {
        const apiConfig = await tryReadConfigFromAPI(client);
        if (apiConfig) return apiConfig;
    }

    const fileConfig = tryReadConfigFromFileSystem();
    if (fileConfig) return fileConfig;

    const envConfig = process.env.SIYUAN_MCP_TOOLS;
    if (envConfig) {
        try {
            return normalizeToolConfig(JSON.parse(envConfig));
        } catch {
            // Ignore invalid env config.
        }
    }

    return buildDefaultToolConfig();
}

function getToolsByConfig(config: ToolConfig) {
    return [
        ...listNotebookTools(config.notebook),
        ...listDocumentTools(config.document),
        ...listBlockTools(config.block),
        ...listAvTools(config.av),
        ...listFileTools(config.file),
        ...listSearchTools(config.search),
        ...listTagTools(config.tag),
        ...listSystemTools(config.system),
        ...listFlashcardTools(config.flashcard),
        ...listMascotTools(config.mascot),
    ];
}

function asCategory(name: string): ToolCategory | null {
    return TOOL_CATEGORIES.includes(name as ToolCategory) ? (name as ToolCategory) : null;
}

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
    const initialConfig = await getToolConfig(client);
    const server = new Server(
        { name: 'siyuan-mcp', version: '2.0.0' },
        { capabilities: { tools: {}, resources: {} }, instructions: buildServerInstructions(initialConfig.userRulesText).trim() },
    );
    const permMgr = new PermissionManager(client);
    await permMgr.load();

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        const config = await getToolConfig(client);
        return { tools: getToolsByConfig(config) };
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
        const category = asCategory(name);
        if (!category) {
            return {
                content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
                isError: true,
            };
        }

        const config = await getToolConfig(client);
        if (!config[category].enabled) {
            return {
                content: [{ type: 'text' as const, text: `Tool "${name}" is disabled.` }],
                isError: true,
            };
        }

        const puppyStats = category === 'mascot'
            ? await readPuppyStats(client)
            : await earnPuppyBalance(client, `${name}/${action}`);

        await writePuppyEvent(client, {
            tool: name,
            action,
            status: 'running',
            totalCalls: puppyStats.totalCalls,
            balance: puppyStats.balance,
        });

        let result: { content: { type: 'text'; text: string }[]; isError?: boolean };
        switch (category) {
            case 'notebook': result = await callNotebookTool(client, args, config.notebook, permMgr); break;
            case 'document': result = await callDocumentTool(client, args, config.document, permMgr); break;
            case 'block': result = await callBlockTool(client, args, config.block, permMgr); break;
            case 'av': result = await callAvTool(client, args, config.av, permMgr); break;
            case 'file': result = await callFileTool(client, args, config.file, permMgr); break;
            case 'search': result = await callSearchTool(client, args, config.search, permMgr); break;
            case 'tag': result = await callTagTool(client, args, config.tag, permMgr); break;
            case 'system': result = await callSystemTool(client, args, config.system, permMgr); break;
            case 'flashcard': result = await callFlashcardTool(client, args, config.flashcard, permMgr); break;
            case 'mascot': result = await callMascotTool(client, args, config.mascot, permMgr); break;
        }

        const latestStats = category === 'mascot' ? await readPuppyStats(client) : puppyStats;
        let mascotEventMeta: { itemId?: string; itemLabel?: string; itemType?: string; itemEmoji?: string } = {};
        if (category === 'mascot' && !result.isError) {
            try {
                const payload = JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
                mascotEventMeta = {
                    itemId: typeof payload.item_id === 'string' ? payload.item_id : undefined,
                    itemLabel: typeof payload.item === 'string' ? payload.item : undefined,
                    itemType: typeof payload.type === 'string' ? payload.type : undefined,
                    itemEmoji: typeof payload.emoji === 'string' ? payload.emoji : undefined,
                };
            } catch {
                mascotEventMeta = {};
            }
        }
        await writePuppyEvent(client, {
            tool: name,
            action,
            status: result.isError ? 'error' : 'success',
            totalCalls: latestStats.totalCalls,
            balance: latestStats.balance,
            ...mascotEventMeta,
        });

        return result;
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

async function main() {
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
        await startHttpMcpServer({
            host: process.env.SIYUAN_MCP_HOST ?? '127.0.0.1',
            port,
            token: process.env.SIYUAN_MCP_TOKEN || undefined,
            path: process.env.SIYUAN_MCP_PATH || '/mcp',
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
    main().catch((error) => {
        console.error('[MCP] Failed to start server:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}

import { SiYuanClient } from '../api/client';
import {
    ACTIONS_BY_CATEGORY,
    TOOL_CATEGORIES,
    buildDefaultToolConfig,
    type ToolCategory,
    type ToolConfig,
} from '../mcp/config';
import { PermissionManager } from '../mcp/permissions';
import { TOOL_REGISTRY, resolveCategory } from '../mcp/tool-registry';
import { runToolCall } from '../mcp/tool-lifecycle';
import { ensureRequiredPluginInstalled } from './plugin-check';

import type { ParsedArgs } from './args';
import { PRIMARY_CLI_COMMAND } from './args';
import { applyConfigToEnv, loadFileConfig, resolveConfig } from './config';
import { mapFlagsToArgs } from './flag-mapper';
import { extractPaginationInfo, renderCliError, renderToolResult } from './render';

import type { ToolResult } from '../mcp/tools/shared';

export async function runDispatch(cli: ParsedArgs): Promise<number> {
    const { tool, action, rest } = cli;
    if (!tool || !action) {
        throw new Error('runDispatch requires both tool and action.');
    }

    const category = resolveCategory(tool);
    if (!category) {
        throw formatUnknownToolError(tool);
    }

    const normalizedAction = action.replace(/-/g, '_');
    const knownActions = ACTIONS_BY_CATEGORY[category];
    if (!knownActions.includes(normalizedAction as never) && normalizedAction !== 'help') {
        throw formatUnknownActionError(category, normalizedAction);
    }

    const fileConfig = loadFileConfig(cli.configPath);
    const resolved = resolveConfig(fileConfig, {
        cliUrl: cli.url,
        cliToken: cli.token,
        profile: cli.profile,
    });
    applyConfigToEnv(resolved);

    const client = new SiYuanClient({ baseUrl: resolved.apiUrl });
    if (resolved.token) client.setToken(resolved.token);

    const previousTransport = process.env.SIYUAN_MCP_TRANSPORT;
    process.env.SIYUAN_MCP_TRANSPORT = 'cli';

    try {
        await ensureRequiredPluginInstalled(client);

        const permMgr = new PermissionManager(client);
        await permMgr.load();

        const toolConfig = buildPermissiveToolConfig();
        const module = TOOL_REGISTRY[category];
        const inputSchema = resolveInputSchema(category, toolConfig);

        const { args: mappedArgs, warnings } = mapFlagsToArgs(rest, inputSchema);
        if (warnings.length > 0 && cli.debug) {
            for (const w of warnings) process.stderr.write(`[warn] ${w}\n`);
        }

        const basePayload = { action: normalizedAction, ...mappedArgs } as Record<string, unknown>;
        const requestText = [PRIMARY_CLI_COMMAND, tool, action, ...rest].join(' ').trim();
        const runPage = async (page?: number): Promise<ToolResult> => {
            const payload = page === undefined ? basePayload : { ...basePayload, page };
            return runToolCall(
                { client, category, name: tool, action: normalizedAction, args: payload, requestText },
                () => module.callTool(client, payload, toolConfig[category], permMgr),
            );
        };

        const result = await runPage();
        const code = renderToolResult(result, { json: cli.json, debug: cli.debug });
        if (code !== 0 || cli.json) return code;

        await runInteractivePaging(result, runPage, { json: cli.json, debug: cli.debug });
        return code;
    } catch (error) {
        renderCliError(error, { debug: cli.debug });
        return 1;
    } finally {
        if (previousTransport === undefined) {
            delete process.env.SIYUAN_MCP_TRANSPORT;
        } else {
            process.env.SIYUAN_MCP_TRANSPORT = previousTransport;
        }
    }
}

async function runInteractivePaging(
    initialResult: ToolResult,
    runPage: (page?: number) => Promise<ToolResult>,
    renderOptions: { json: boolean; debug: boolean },
): Promise<void> {
    if (!canUseInteractivePaging()) return;

    let pagination = extractPaginationInfo(initialResult);
    if (!pagination || pagination.pageCount <= 1) return;

    const input = process.stdin;
    const output = process.stdout;
    const wasRaw = Boolean(input.isRaw);

    try {
        input.setRawMode?.(true);
        input.resume();

        while (pagination.pageCount > 1) {
            output.write('\nPaging: Enter/n next, p previous, q quit › ');
            const key = await readKey();
            output.write('\n');

            if (key === '\u0003' || key === '\u001b' || key.toLowerCase() === 'q') {
                return;
            }

            const nextPage = resolveRequestedPage(key, pagination.page, pagination.pageCount);
            if (nextPage === null) {
                continue;
            }

            const result = await runPage(nextPage);
            renderToolResult(result, renderOptions);
            const nextPagination = extractPaginationInfo(result);
            if (!nextPagination) return;
            pagination = nextPagination;
        }
    } finally {
        input.setRawMode?.(wasRaw);
        input.pause();
    }
}

function canUseInteractivePaging(): boolean {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function resolveRequestedPage(key: string, page: number, pageCount: number): number | null {
    const normalized = key.toLowerCase();
    if ((key === '\r' || key === '\n' || normalized === 'n') && page < pageCount) {
        return page + 1;
    }
    if (normalized === 'p' && page > 1) {
        return page - 1;
    }
    return null;
}

function readKey(): Promise<string> {
    return new Promise((resolve) => {
        process.stdin.once('data', (chunk: Buffer | string) => {
            resolve(String(chunk));
        });
    });
}

function resolveInputSchema(category: ToolCategory, config: ToolConfig): Record<string, unknown> {
    const descriptors = TOOL_REGISTRY[category].listTools(config[category]);
    const descriptor = descriptors[0];
    if (!descriptor) {
        throw new Error(`Tool "${category}" has no aggregated descriptor — this is a bug.`);
    }
    return descriptor.inputSchema;
}

/**
 * CLI users explicitly type each command, so all actions are opted-in by
 * default — including the ones that the plugin UI gates off for safety.
 */
function buildPermissiveToolConfig(): ToolConfig {
    const base = buildDefaultToolConfig();
    for (const cat of TOOL_CATEGORIES) {
        const actions = ACTIONS_BY_CATEGORY[cat];
        const record = base[cat].actions as Record<string, boolean>;
        for (const action of actions) record[action] = true;
    }
    return base;
}

function formatUnknownToolError(tool: string): Error {
    const categories = TOOL_CATEGORIES.join(', ');
    return new Error(`Unknown tool "${tool}". Available tools: ${categories}. Try "${PRIMARY_CLI_COMMAND} list".`);
}

function formatUnknownActionError(category: ToolCategory, action: string): Error {
    const actions = ACTIONS_BY_CATEGORY[category].join(', ');
    return new Error(
        `Unknown action "${action}" for tool "${category}". ` +
        `Available actions: ${actions}. Try "${PRIMARY_CLI_COMMAND} help ${category}".`,
    );
}

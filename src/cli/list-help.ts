import { SiYuanClient } from '../api/client';
import {
    ACTIONS_BY_CATEGORY,
    TOOL_CATEGORIES,
    buildDefaultToolConfig,
} from '../mcp/config';
import { PermissionManager } from '../mcp/permissions';
import { TOOL_REGISTRY, resolveCategory } from '../mcp/tool-registry';

import type { ParsedArgs } from './args';
import { applyConfigToEnv, loadFileConfig, resolveConfig } from './config';
import { renderToolResult } from './render';

export function runList(cli: ParsedArgs): number {
    const out = process.stdout;
    const toolFilter = cli.tool ? resolveCategory(cli.tool) : null;

    if (!toolFilter) {
        if (cli.tool) {
            process.stderr.write(`Unknown tool "${cli.tool}". Showing all tools instead.\n`);
        }
        out.write('Tools:\n');
        for (const cat of TOOL_CATEGORIES) {
            const actions = ACTIONS_BY_CATEGORY[cat];
            out.write(`  ${cat.padEnd(10)} ${actions.length} actions\n`);
        }
        out.write('\nUse "siyuan list <tool>" to see actions for a specific tool.\n');
        return 0;
    }

    out.write(`${toolFilter} actions:\n`);
    for (const action of ACTIONS_BY_CATEGORY[toolFilter]) {
        out.write(`  ${action}\n`);
    }
    out.write(`\nUse "siyuan help ${toolFilter} <action>" to see flags for a specific action.\n`);
    return 0;
}

/**
 * Forward `siyuan help <tool> [action]` to the existing `action="help"`
 * mechanism inside each tool — this gives the same help content AI clients see.
 */
export async function runHelp(cli: ParsedArgs): Promise<number> {
    const tool = cli.tool;
    if (!tool) {
        process.stderr.write('Missing tool. Usage: siyuan help <tool> [action]\n');
        return 2;
    }

    const category = resolveCategory(tool);
    if (!category) {
        process.stderr.write(`Unknown tool "${tool}". Available: ${TOOL_CATEGORIES.join(', ')}.\n`);
        return 2;
    }

    const fileConfig = loadFileConfig(cli.configPath);
    const resolved = resolveConfig(fileConfig, cli.url, cli.token);
    applyConfigToEnv(resolved);

    const client = new SiYuanClient({ baseUrl: resolved.apiUrl });
    if (resolved.token) client.setToken(resolved.token);

    const permMgr = new PermissionManager(client);
    // Don't bother loading permissions for a help-only call.

    const toolConfig = buildPermissiveToolConfig();
    const module = TOOL_REGISTRY[category];
    const payload: Record<string, unknown> = { action: 'help' };
    if (cli.action) payload.topic = cli.action;

    try {
        const result = await module.callTool(client, payload, toolConfig[category], permMgr);
        return renderToolResult(result, { json: cli.json, debug: cli.debug });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`\x1b[31m✗ ${message}\x1b[0m\n`);
        return 1;
    }
}

function buildPermissiveToolConfig() {
    const base = buildDefaultToolConfig();
    for (const cat of TOOL_CATEGORIES) {
        const actions = ACTIONS_BY_CATEGORY[cat];
        const record = base[cat].actions as Record<string, boolean>;
        for (const action of actions) record[action] = true;
    }
    return base;
}

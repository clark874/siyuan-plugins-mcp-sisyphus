import { SiYuanClient } from '../api/client';
import {
    ACTIONS_BY_CATEGORY,
    TOOL_CATEGORIES,
    buildDefaultToolConfig,
    getActionTier,
    isDangerousAction,
} from '../mcp/config';
import { PermissionManager } from '../mcp/permissions';
import { TOOL_REGISTRY, resolveCategory } from '../mcp/tool-registry';

import type { ParsedArgs } from './args';
import { PRIMARY_CLI_COMMAND } from './args';
import { applyConfigToEnv, loadFileConfig, resolveConfig } from './config';
import {
    renderCliError,
    renderToolResult,
    writeBulletList,
    writeHeading,
    writeHint,
    writeSection,
} from './render';

export function runList(cli: ParsedArgs): number {
    const out = process.stdout;
    const toolFilter = cli.tool ? resolveCategory(cli.tool) : null;

    if (!toolFilter) {
        if (cli.tool) {
            renderCliError(`Unknown tool "${cli.tool}". Showing all tools instead.`);
        }
        writeHeading('SiYuan tools', out);
        writeBulletList(TOOL_CATEGORIES.map((cat) => {
            const actions = ACTIONS_BY_CATEGORY[cat];
            const basicCount = actions.filter((action) => getActionTier(cat, action) === 'basic').length;
            const advancedCount = actions.length - basicCount;
            return `${cat} — ${actions.length} actions (${basicCount} common, ${advancedCount} advanced)`;
        }), out);
        writeSection('Next Step', out);
        writeHint('Tip', `Run \`${PRIMARY_CLI_COMMAND} list <tool>\` to see a tool’s actions.`, out);
        return 0;
    }

    writeHeading(`${toolFilter} actions`, out);
    writeBulletList(ACTIONS_BY_CATEGORY[toolFilter].map((action) => {
        const tier = getActionTier(toolFilter, action) === 'basic' ? 'common' : 'advanced';
        const safety = isDangerousAction(toolFilter, action) ? ' · confirmation required' : '';
        return `${action} — ${tier}${safety}`;
    }), out);
    writeSection('Next Step', out);
    writeHint('Tip', `Run \`${PRIMARY_CLI_COMMAND} help ${toolFilter} <action>\` for fields and examples.`, out);
    return 0;
}

/**
 * Forward `siyuan-sisyphus help <tool> [action]` to the existing `action="help"`
 * mechanism inside each tool — this gives the same help content AI clients see.
 */
export async function runHelp(cli: ParsedArgs): Promise<number> {
    const tool = cli.tool;
    if (!tool) {
        renderCliError(`Missing tool. Usage: ${PRIMARY_CLI_COMMAND} help <tool> [action]`);
        return 2;
    }

    const category = resolveCategory(tool);
    if (!category) {
        renderCliError(`Unknown tool "${tool}". Available: ${TOOL_CATEGORIES.join(', ')}.`);
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
        renderCliError(error, { debug: cli.debug });
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

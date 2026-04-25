import {
    TOOL_CATEGORIES,
    getEnabledActions,
    getActionTier,
    isDangerousAction,
} from '../core/config';
import { TOOL_REGISTRY, resolveCategory } from '../core/tool-registry';
import { PRIMARY_CLI_COMMAND } from '../shared/constants';


import type { ParsedArgs } from './args';
import {
    renderCliError,
    renderToolResult,
    writeBulletList,
    writeHeading,
    writeHint,
    writeSection,
} from './render';
import { loadCliRuntimeState } from './runtime';

export async function runList(cli: ParsedArgs): Promise<number> {
    const out = process.stdout;
    const toolFilter = cli.tool ? resolveCategory(cli.tool) : null;
    const { toolConfig } = await loadCliRuntimeState(cli, { loadPermissions: false });

    if (!toolFilter) {
        if (cli.tool) {
            renderCliError(`Unknown tool "${cli.tool}". Showing all tools instead.`);
        }
        const enabledTools = TOOL_CATEGORIES.filter((cat) => TOOL_REGISTRY[cat].listTools(toolConfig[cat]).length > 0);
        writeHeading('SiYuan tools', out);
        writeBulletList(enabledTools.map((cat) => {
            const actions = getEnabledActions(toolConfig[cat]);
            const basicCount = actions.filter((action) => getActionTier(cat, action) === 'basic').length;
            const advancedCount = actions.length - basicCount;
            return `${cat} — ${actions.length} actions (${basicCount} common, ${advancedCount} advanced)`;
        }), out);
        writeSection('Next Step', out);
        writeHint('Tip', `Run \`${PRIMARY_CLI_COMMAND} list <tool>\` to see a tool’s actions.`, out);
        return 0;
    }

    if (TOOL_REGISTRY[toolFilter].listTools(toolConfig[toolFilter]).length === 0) {
        renderCliError(`Tool "${toolFilter}" is disabled.`);
        return 1;
    }

    writeHeading(`${toolFilter} actions`, out);
    writeBulletList(getEnabledActions(toolConfig[toolFilter]).map((action) => {
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

    try {
        const { client, toolConfig, permMgr } = await loadCliRuntimeState(cli, { loadPermissions: false });
        if (!toolConfig[category].enabled) {
            return renderToolResult({
                content: [{ type: 'text', text: `Tool "${tool}" is disabled.` }],
                isError: true,
            }, { json: cli.json, debug: cli.debug });
        }

        const module = TOOL_REGISTRY[category];
        const payload: Record<string, unknown> = { action: 'help' };
        if (cli.action) payload.topic = cli.action;

        const result = await module.callTool(client, payload, toolConfig[category], permMgr);
        return renderToolResult(result, { json: cli.json, debug: cli.debug });
    } catch (error) {
        renderCliError(error, { debug: cli.debug });
        return 1;
    }
}

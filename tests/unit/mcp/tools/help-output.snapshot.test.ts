import { describe, expect, it } from 'vitest';

import { ACTIONS_BY_CATEGORY, TOOL_CATEGORIES, type ToolCategory, type ToolConfig } from '@/mcp/config';
import { TOOL_REGISTRY } from '@/mcp/tool-registry';
import { createMockClient } from '../../../helpers/mock-client';
import { createMockPermissionManager } from '../../../helpers/mock-permissions';
import { parseResult } from '../../../helpers/parse-result';

function createAllEnabledConfig(): ToolConfig {
    return {
        notebook: {
            enabled: true,
            actions: Object.fromEntries(ACTIONS_BY_CATEGORY.notebook.map((action) => [action, true])) as ToolConfig['notebook']['actions'],
        },
        document: {
            enabled: true,
            actions: Object.fromEntries(ACTIONS_BY_CATEGORY.document.map((action) => [action, true])) as ToolConfig['document']['actions'],
        },
        block: {
            enabled: true,
            actions: Object.fromEntries(ACTIONS_BY_CATEGORY.block.map((action) => [action, true])) as ToolConfig['block']['actions'],
        },
        av: {
            enabled: true,
            actions: Object.fromEntries(ACTIONS_BY_CATEGORY.av.map((action) => [action, true])) as ToolConfig['av']['actions'],
        },
        file: {
            enabled: true,
            actions: Object.fromEntries(ACTIONS_BY_CATEGORY.file.map((action) => [action, true])) as ToolConfig['file']['actions'],
            uploadLargeFileThresholdMB: 10,
        },
        search: {
            enabled: true,
            actions: Object.fromEntries(ACTIONS_BY_CATEGORY.search.map((action) => [action, true])) as ToolConfig['search']['actions'],
        },
        tag: {
            enabled: true,
            actions: Object.fromEntries(ACTIONS_BY_CATEGORY.tag.map((action) => [action, true])) as ToolConfig['tag']['actions'],
        },
        system: {
            enabled: true,
            actions: Object.fromEntries(ACTIONS_BY_CATEGORY.system.map((action) => [action, true])) as ToolConfig['system']['actions'],
        },
        flashcard: {
            enabled: true,
            actions: Object.fromEntries(ACTIONS_BY_CATEGORY.flashcard.map((action) => [action, true])) as ToolConfig['flashcard']['actions'],
        },
        mascot: {
            enabled: true,
            actions: Object.fromEntries(ACTIONS_BY_CATEGORY.mascot.map((action) => [action, true])) as ToolConfig['mascot']['actions'],
        },
        userRulesText: '',
    };
}

async function collectHelpOutputs() {
    const config = createAllEnabledConfig();
    const client = createMockClient();
    const permMgr = createMockPermissionManager();
    const outputs: Record<string, unknown> = {};

    for (const category of TOOL_CATEGORIES) {
        const module = TOOL_REGISTRY[category];
        const toolDescriptor = module.listTools(config[category])[0];
        const actionOutputs: Record<string, unknown> = {};

        for (const action of ACTIONS_BY_CATEGORY[category]) {
            actionOutputs[action] = parseResult(await module.callTool(client, { action: 'help', topic: action }, config[category], permMgr));
        }

        outputs[category] = {
            description: toolDescriptor.description,
            overview: parseResult(await module.callTool(client, { action: 'help' }, config[category], permMgr)),
            actions: actionOutputs,
        };
    }

    return outputs;
}

describe('tool description and help outputs', () => {
    it('matches the locked snapshot for all aggregated tools', async () => {
        await expect(collectHelpOutputs()).resolves.toMatchSnapshot();
    });
});

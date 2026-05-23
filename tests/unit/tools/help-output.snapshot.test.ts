import { describe, expect, it } from 'vitest';

import { ACTIONS_BY_CATEGORY, TOOL_CATEGORIES, type ToolCategory, type ToolConfig } from '@/core/config';
import { TOOL_REGISTRY } from '@/core/tool-registry';
import { createMockClient } from '../../helpers/mock-client';
import { createMockPermissionManager } from '../../helpers/mock-permissions';
import { parseResult } from '../../helpers/parse-result';

function createAllEnabledConfig(): ToolConfig {
    return {
        fs: {
            enabled: true,
            actions: Object.fromEntries(ACTIONS_BY_CATEGORY.fs.map((action) => [action, true])) as ToolConfig['fs']['actions'],
        },
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
        feedback: {
            enabled: true,
            actions: Object.fromEntries(ACTIONS_BY_CATEGORY.feedback.map((action) => [action, true])) as ToolConfig['feedback']['actions'],
        },
        userRulesText: '',
        debug: {
            includeUiRefreshMetadata: false,
            slimResponses: true,
        },
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

    it('documents child document creation path semantics in document create help', async () => {
        const config = createAllEnabledConfig();
        const client = createMockClient();
        const permMgr = createMockPermissionManager();
        const output = parseResult(await TOOL_REGISTRY.document.callTool(
            client,
            { action: 'help', topic: 'create' },
            config.document,
            permMgr,
        )) as Record<string, unknown>;

        expect(JSON.stringify(output)).toContain('/Folder/Parent/New Child');
        expect(JSON.stringify(output)).toContain('/Folder/Parent');
        expect(JSON.stringify(output)).toContain('/20240318112233-abc123.sy');
        expect(JSON.stringify(output)).toContain('notebook-local hpath');
        expect(JSON.stringify(output)).toContain('not /Notebook/...');
        expect(JSON.stringify(output)).toContain('not .sy');
        expect(JSON.stringify(output)).toContain('duplicate-name error');
    });
});

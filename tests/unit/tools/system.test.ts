import { describe, expect, it } from 'vitest';

import { SYSTEM_ACTIONS, buildDefaultToolConfig } from '@/core/config';
import { callSystemTool, listSystemTools } from '@/tools/system';
import { createMockClient } from '../../helpers/mock-client';
import { parseResult } from '../../helpers/parse-result';

describe('system 工具', () => {
    it('只暴露六个诊断与校验动作', () => {
        const [tool] = listSystemTools(buildDefaultToolConfig().system);
        expect(tool.inputSchema.properties.action.enum).toEqual([...SYSTEM_ACTIONS, 'help']);
        expect(JSON.stringify(tool.inputSchema)).not.toMatch(/notify|sync|workspace_info|bazaar|plan_change|apply_change/);
    });

    it('返回当前版本', async () => {
        const client = createMockClient({ request: async () => '3.8.4' });
        const result = await callSystemTool(client, { action: 'get_version' }, buildDefaultToolConfig().system, {} as never);
        expect(parseResult(result)).toEqual({ version: '3.8.4' });
    });

    it('校验冻结的来源审计交接包', async () => {
        const result = await callSystemTool(createMockClient(), {
            action: 'validate_source_audit',
            inventory: { schemaVersion: 1, items: [{
                id: 'change-1', file: 'src/example.py', symbol: 'run', lineStart: 1, lineEnd: 4,
                beforeBehavior: 'old', afterBehavior: 'new', risk: 'medium', evidenceHash: 'a'.repeat(64),
            }] },
            usageMap: { schemaVersion: 1, projects: [{ id: 'project-1', name: 'Project 1', usages: [{ inventoryId: 'change-1', status: 'used', evidence: ['main.py:10'] }] }] },
            baselinesMarkdown: `commit ${'b'.repeat(40)}\nsha256 ${'c'.repeat(64)}`,
        }, buildDefaultToolConfig().system, {} as never);
        expect(parseResult(result)).toMatchObject({ valid: true, summary: { inventoryItems: 1, projects: 1 } });
    });
});

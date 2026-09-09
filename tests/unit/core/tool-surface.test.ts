import { describe, expect, it } from 'vitest';
import { ACTIONS_BY_CATEGORY, TOOL_CATEGORIES, buildDefaultToolConfig } from '@/core/config';
import { listAllTools } from '@/core/tool-registry';

describe('MCP 精简工具面', () => {
    it('固定为 13 个聚合工具和 94 个动作', () => {
        expect(TOOL_CATEGORIES).toEqual([
            'fs', 'notebook', 'document', 'block', 'av', 'file', 'project',
            'search', 'provenance', 'tag', 'timeline', 'system', 'extension',
        ]);
        expect(Object.values(ACTIONS_BY_CATEGORY).reduce((sum, actions) => sum + actions.length, 0)).toBe(94);
        expect(listAllTools(buildDefaultToolConfig()).map((tool) => tool.name)).toEqual(TOOL_CATEGORIES);
    });

    it('不再暴露旧分类与明确删除的动作', () => {
        const serialized = JSON.stringify({ TOOL_CATEGORIES, ACTIONS_BY_CATEGORY });
        for (const removed of ['mascot', 'feedback', 'flashcard', 'search_assets', 'fulltext_asset_content', 'delete_node', 'rollback_document', 'rollback_block']) {
            expect(serialized).not.toContain(`"${removed}"`);
        }
    });
});

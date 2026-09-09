import { describe, expect, it } from 'vitest';

import { NOTEBOOK_ACTIONS, buildDefaultToolConfig } from '@/core/config';
import { NOTEBOOK_VARIANTS, listNotebookTools } from '@/tools/notebook';

describe('notebook 工具', () => {
    it('只暴露四个只读动作', () => {
        const [tool] = listNotebookTools(buildDefaultToolConfig().notebook);
        expect(tool.inputSchema.properties.action.enum).toEqual([...NOTEBOOK_ACTIONS, 'help']);
        expect(tool.inputSchema.properties.action.enum).not.toEqual(expect.arrayContaining([
            'set_permission', 'set_conf', 'remove', 'create', 'rename',
        ]));
    });

    it('保留子文档分页约束', () => {
        const variant = NOTEBOOK_VARIANTS.find((item) => item.action === 'get_child_docs');
        expect(variant?.schema.properties?.page?.type).toBe('integer');
        expect(variant?.schema.properties?.page?.exclusiveMinimum).toBe(0);
    });
});

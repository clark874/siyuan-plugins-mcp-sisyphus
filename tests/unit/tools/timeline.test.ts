import { describe, expect, it, vi } from 'vitest';

import { TIMELINE_ACTIONS, buildDefaultToolConfig } from '@/core/config';
import { createTimelineNode } from '@/shared/timeline-service';
import { callTimelineTool, listTimelineTools } from '@/tools/timeline';
import { createMockClient } from '../../helpers/mock-client';
import { createMockPermissionManager } from '../../helpers/mock-permissions';
import { parseResult } from '../../helpers/parse-result';

const DOC_ID = '20260805200000-abcdefg';

describe('timeline 工具', () => {
    it('只暴露列出、创建和比较动作', () => {
        const [tool] = listTimelineTools(buildDefaultToolConfig().timeline);
        expect(tool.inputSchema.properties.action.enum).toEqual([...TIMELINE_ACTIONS, 'help']);
        expect(JSON.stringify(tool.inputSchema)).not.toMatch(/rollback|delete_node/);
    });

    it('比较最新且不同的文档历史', async () => {
        const client = createMockClient({ request: vi.fn(async (endpoint: string) => {
            if (endpoint === '/api/query/sql') return [{ id: DOC_ID, root_id: DOC_ID, box: 'nb-1', path: `/${DOC_ID}.sy`, type: 'd' }];
            if (endpoint === '/api/block/getBlockDOM') return { id: DOC_ID, dom: '<div data-node-id="p" data-type="NodeParagraph"><div>当前</div></div>' };
            if (endpoint === '/api/history/searchHistory') return { histories: ['1786434544'], pageCount: 1, totalCount: 1 };
            if (endpoint === '/api/history/getHistoryItems') return { items: [{ title: 'Doc', path: `history/${DOC_ID}.sy`, op: 'update', notebook: 'nb-1' }] };
            if (endpoint === '/api/history/getDocHistoryContent') return { id: DOC_ID, rootID: DOC_ID, content: '<div data-node-id="p" data-type="NodeParagraph"><div>历史</div></div>', isLargeDoc: false };
            return null;
        }) });
        const result = parseResult(await callTimelineTool(client, {
            action: 'compare_recent', documentId: DOC_ID, page: 1, pageSize: 20,
        }, buildDefaultToolConfig().timeline, createMockPermissionManager())) as Record<string, any>;
        expect(result.source).toBe('recent_history');
        expect(result.stats.changedBlocks).toBe(1);
    });

    it('创建全局节点并返回稳定标签', async () => {
        let created = false;
        const client = createMockClient({ request: vi.fn(async (endpoint: string, data?: Record<string, unknown>) => {
            if (endpoint === '/api/repo/getRepoSnapshots') return { snapshots: created ? [{ id: 'current-1', memo: 'release', created: 2 }] : [{ id: 'old', memo: 'old', created: 1 }], pageCount: 1, totalCount: created ? 1 : 1 };
            if (endpoint === '/api/repo/createSnapshot') { created = true; return null; }
            if (endpoint === '/api/repo/getRepoTagSnapshots') return { snapshots: [] };
            if (endpoint === '/api/repo/tagSnapshot') return data;
            return null;
        }) });
        const result = await createTimelineNode(client, { name: 'release', scope: 'global' });
        expect(result.node).toMatchObject({ name: 'release', scope: 'global', snapshotId: 'current-1', tag: 'sisyphustimeline_global_release' });
    });
});

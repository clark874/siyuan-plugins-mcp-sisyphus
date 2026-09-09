import type { TimelineAction } from '../../core/config';
import { TIMELINE_ACTION_HINTS, TIMELINE_GUIDANCE } from '../../core/help';
import {
    TimelineActionSchema,
    TimelineCompareNodeSchema,
    TimelineCompareRecentSchema,
    TimelineCreateNodeSchema,
    TimelineListNodesSchema,
} from '../../core/types';
import {
    compareTimelineNode,
    createTimelineNode,
    listTimelineNodes,
} from '../../shared/timeline-service';
import { compareRecentDocumentHistory } from '../../shared/recent-history-service';
import { ensurePermissionForDocumentId } from '../internal/context';
import { defineTool } from '../internal/define-tool';
import { createJsonResult, createZodActionVariant, type ActionVariant } from '../internal/shared';
import { applyUiRefresh } from '../internal/ui-refresh';

export const TIMELINE_TOOL_NAME = 'timeline';

export const TIMELINE_VARIANTS: ActionVariant<TimelineAction>[] = [
    createZodActionVariant('list_nodes', TimelineListNodesSchema, 'List global or document timeline nodes.'),
    createZodActionVariant('create_node', TimelineCreateNodeSchema, 'Create a named global or document timeline node.'),
    createZodActionVariant('compare_node', TimelineCompareNodeSchema, 'Compare one document with a timeline node.'),
    createZodActionVariant('compare_recent', TimelineCompareRecentSchema, 'Compare one document with its newest different native history checkpoint.'),
];

const timelineTool = defineTool<TimelineAction>({
    name: TIMELINE_TOOL_NAME,
    description: '🕓 Grouped document timeline and snapshot comparison operations.',
    variants: TIMELINE_VARIANTS,
    actionSchema: TimelineActionSchema,
    aggregateOptions: {
        guidance: TIMELINE_GUIDANCE,
        actionHints: TIMELINE_ACTION_HINTS,
    },
    handlers: {
        list_nodes: async ({ client, permMgr, rawArgs }) => {
            const parsed = TimelineListNodesSchema.parse(rawArgs);
            if (parsed.scope !== 'global') {
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.documentId!, 'read');
                if (denied) return denied;
            }
            return createJsonResult(await listTimelineNodes(client, parsed));
        },
        create_node: async ({ client, permMgr, rawArgs }) => {
            const parsed = TimelineCreateNodeSchema.parse(rawArgs);
            if (parsed.scope === 'document') {
                const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, parsed.documentId!, 'write');
                if (denied) return denied;
                return applyUiRefresh(
                    client,
                    createJsonResult(await createTimelineNode(client, parsed)),
                    [{ type: 'reloadProtyle', id: context.documentId }],
                );
            }
            return createJsonResult(await createTimelineNode(client, parsed));
        },
        compare_node: async ({ client, permMgr, rawArgs }) => {
            const parsed = TimelineCompareNodeSchema.parse(rawArgs);
            const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.documentId, 'read');
            if (denied) return denied;
            return createJsonResult(await compareTimelineNode(client, parsed));
        },
        compare_recent: async ({ client, permMgr, rawArgs }) => {
            const parsed = TimelineCompareRecentSchema.parse(rawArgs);
            const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.documentId, 'read');
            if (denied) return denied;
            return createJsonResult(await compareRecentDocumentHistory(client, parsed));
        },
    },
});

export const listTimelineTools = timelineTool.listTools;
export const callTimelineTool = timelineTool.callTool;

import type { SiYuanClient } from '../../api/client';
import type { CategoryToolConfig, SystemAction } from '../../core/config';
import { SYSTEM_ACTION_HINTS, SYSTEM_GUIDANCE } from '../../core/help';
import type { PermissionManager } from '../../core/permissions';
import { SystemActionSchema } from '../../core/types';
import { defineTool } from '../define-tool';
import { createActionSchema, type ActionVariant, type ToolResult } from '../shared';
import { SYSTEM_ACTION_HANDLERS } from './handlers';

export const SYSTEM_TOOL_NAME = 'system';

export const SYSTEM_VARIANTS: ActionVariant<SystemAction>[] = [
    {
        action: 'workspace_info',
        schema: createActionSchema('workspace_info', {}, [], 'Get SiYuan workspace metadata. High-risk: exposes the absolute workspace path.'),
    },
    {
        action: 'network',
        schema: createActionSchema('network', {}, [], 'Get current network proxy information.'),
    },
    {
        action: 'conf',
        schema: createActionSchema('conf', {
            mode: { type: 'string', enum: ['summary', 'get'], description: 'Read mode: "summary" returns a navigable overview, "get" reads a specific key path' },
            keyPath: { type: 'string', description: 'Dot/bracket path to a specific config field, e.g. "conf.appearance.mode" or "conf.langs[0]"' },
            maxDepth: { type: 'number', description: 'Maximum object traversal depth for summary/get responses' },
            maxItems: { type: 'number', description: 'Maximum keys/items to include per level' },
        }, [], 'Get masked system configuration with summary-first progressive reading.'),
    },
    {
        action: 'notify',
        schema: createActionSchema('notify', {
            msg: { type: 'string', description: 'Message content' },
            level: { type: 'string', enum: ['info', 'error'], description: 'Notification level' },
            timeout: { type: 'number', description: 'Display timeout in milliseconds' },
        }, ['msg', 'level'], 'Push a notification message.'),
    },
    {
        action: 'get_version',
        schema: createActionSchema('get_version', {}, [], 'Get the SiYuan system version.'),
    },
    {
        action: 'get_current_time',
        schema: createActionSchema('get_current_time', {}, [], 'Get the current system time.'),
    },
];

const systemTool = defineTool<SystemAction>({
    name: 'system',
    description: '🖥️ Grouped system and notification operations.',
    variants: SYSTEM_VARIANTS,
    actionSchema: SystemActionSchema,
    aggregateOptions: {
        guidance: SYSTEM_GUIDANCE,
        actionHints: SYSTEM_ACTION_HINTS,
    },
    handlers: SYSTEM_ACTION_HANDLERS,
});

export function listSystemTools(config: CategoryToolConfig<SystemAction>) {
    return systemTool.listTools(config);
}

export function callSystemTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<SystemAction>,
    _permMgr: PermissionManager,
): Promise<ToolResult> {
    return systemTool.callTool(client, args, config, _permMgr);
}

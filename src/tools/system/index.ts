import type { SiYuanClient } from '../../api/client';
import type { CategoryToolConfig, SystemAction } from '../../core/config';
import { SYSTEM_ACTION_HINTS, SYSTEM_GUIDANCE } from '../../core/help';
import type { PermissionManager } from '../../core/permissions';
import {
    SystemActionSchema,
    SystemAuditEnvironmentSchema,
    SystemValidateSourceAuditSchema,
    SystemBootstrapSchema,
    SystemChangelogSchema,
    SystemGetCurrentTimeSchema,
    SystemGetVersionSchema,
} from '../../core/types';
import { defineTool } from '../internal/define-tool';
import { createZodActionVariant, type ActionVariant, type ToolResult } from '../internal/shared';
import { SYSTEM_ACTION_HANDLERS } from './handlers';

export const SYSTEM_TOOL_NAME = 'system';

export const SYSTEM_VARIANTS: ActionVariant<SystemAction>[] = [
    createZodActionVariant('changelog', SystemChangelogSchema, 'Read the bundled plugin changelog with structured personalization-impact hints.'),
    createZodActionVariant('get_version', SystemGetVersionSchema, 'Get the SiYuan system version.'),
    createZodActionVariant('get_current_time', SystemGetCurrentTimeSchema, 'Get the current system time.'),
    createZodActionVariant('bootstrap', SystemBootstrapSchema, 'One-call agent onboarding with refreshed permissions, current configured capabilities, path guide, and enabled next calls. This action is read-only; the connection may not be.'),
    createZodActionVariant('audit_environment', SystemAuditEnvironmentSchema, 'Get a compact read-only summary of masked system configuration and installed package counts.'),
    createZodActionVariant('validate_source_audit', SystemValidateSourceAuditSchema, 'Validate a frozen external source-audit handoff without reading or comparing any source tree.'),
];

const systemTool = defineTool<SystemAction>({
    name: 'system',
    description: '🖥️ Grouped read-only system diagnostics and source-audit validation.',
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

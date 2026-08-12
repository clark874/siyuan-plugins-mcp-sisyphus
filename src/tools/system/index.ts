import type { SiYuanClient } from '../../api/client';
import type { CategoryToolConfig, SystemAction } from '../../core/config';
import { SYSTEM_ACTION_HINTS, SYSTEM_GUIDANCE } from '../../core/help';
import type { PermissionManager } from '../../core/permissions';
import {
    SystemActionSchema,
    SystemAuditEnvironmentSchema,
    SystemBootstrapSchema,
    SystemChangelogSchema,
    SystemConfSchema,
    SystemGetCurrentTimeSchema,
    SystemGetVersionSchema,
    SystemNetworkSchema,
    SystemNotifySchema,
    SystemListPackagesSchema,
    SystemSearchBazaarSchema,
    SystemGetBazaarPackageSchema,
    SystemReadBazaarReadmeSchema,
    SystemGetPluginSchema,
    SystemListPluginUpdatesSchema,
    SystemListSnippetsSchema,
    SystemListPluginStorageSchema,
    SystemReadPluginStorageSchema,
    SystemInspectPluginSchema,
    SystemPlanChangeSchema,
    SystemApplyChangeSchema,
    SystemRollbackChangeSchema,
    SystemDiscardChangePlanSchema,
    SystemListControlChangesSchema,
    SystemGetControlChangeSchema,
    SystemPerformSyncSchema,
    SystemWorkspaceInfoSchema,
} from '../../core/types';
import { defineTool } from '../internal/define-tool';
import { createZodActionVariant, type ActionVariant, type ToolResult } from '../internal/shared';
import { SYSTEM_ACTION_HANDLERS } from './handlers';

export const SYSTEM_TOOL_NAME = 'system';

export const SYSTEM_VARIANTS: ActionVariant<SystemAction>[] = [
    createZodActionVariant('workspace_info', SystemWorkspaceInfoSchema, 'Get SiYuan workspace metadata. High-risk: exposes the absolute workspace path.'),
    createZodActionVariant('network', SystemNetworkSchema, 'Get current network proxy information.'),
    createZodActionVariant('conf', SystemConfSchema, 'Get masked system configuration with summary-first progressive reading.'),
    createZodActionVariant('notify', SystemNotifySchema, 'Push a notification message.'),
    createZodActionVariant('changelog', SystemChangelogSchema, 'Read the bundled plugin changelog with structured personalization-impact hints.'),
    createZodActionVariant('perform_sync', SystemPerformSyncSchema, 'Trigger SiYuan sync immediately. High-risk: affects local and remote sync state.'),
    createZodActionVariant('get_version', SystemGetVersionSchema, 'Get the SiYuan system version.'),
    createZodActionVariant('get_current_time', SystemGetCurrentTimeSchema, 'Get the current system time.'),
    createZodActionVariant('bootstrap', SystemBootstrapSchema, 'One-call agent onboarding with refreshed permissions, current configured capabilities, path guide, and enabled next calls. This action is read-only; the connection may not be.'),
    createZodActionVariant('audit_environment', SystemAuditEnvironmentSchema, 'Get a compact read-only summary of masked system configuration and installed package counts.'),
    createZodActionVariant('list_packages', SystemListPackagesSchema, 'List installed plugins, widgets, themes, icons, or templates with compact metadata and pagination.'),
    createZodActionVariant('search_bazaar', SystemSearchBazaarSchema, 'Search downloadable SiYuan bazaar packages with installation and compatibility filters, stable sorting, and pagination.'),
    createZodActionVariant('get_bazaar_package', SystemGetBazaarPackageSchema, 'Get exact online bazaar metadata plus local installation state for one package.'),
    createZodActionVariant('read_bazaar_readme', SystemReadBazaarReadmeSchema, 'Read one exact bazaar README as sanitized, redacted, size-limited plain text.'),
    createZodActionVariant('get_plugin', SystemGetPluginSchema, 'Get compact metadata for one exact installed plugin.'),
    createZodActionVariant('list_plugin_updates', SystemListPluginUpdatesSchema, 'List installed plugins that SiYuan reports as outdated.'),
    createZodActionVariant('list_snippets', SystemListSnippetsSchema, 'List CSS/JavaScript snippets without content by default; exact content reads are redacted and truncated.'),
    createZodActionVariant('list_plugin_storage', SystemListPluginStorageSchema, 'List one installed plugin storage root with path, symlink, recursion, and output limits.'),
    createZodActionVariant('read_plugin_storage', SystemReadPluginStorageSchema, 'Read one safe plugin text configuration with hard byte limits and secret redaction.'),
    createZodActionVariant('inspect_plugin', SystemInspectPluginSchema, 'Interpret safe configuration files using declared adapters and uncertainty-preserving generic classification.'),
    createZodActionVariant('plan_change', SystemPlanChangeSchema, 'Create an expiring, state-hashed, reversible workspace change plan without changing the target.'),
    createZodActionVariant('apply_change', SystemApplyChangeSchema, 'Apply one non-stale plan, verify the result, and automatically recover on verification failure.'),
    createZodActionVariant('rollback_change', SystemRollbackChangeSchema, 'Restore and verify the pre-change state for one applied control-plane change.'),
    createZodActionVariant('discard_change_plan', SystemDiscardChangePlanSchema, 'Discard one unapplied or expired change plan without changing its target.'),
    createZodActionVariant('list_control_changes', SystemListControlChangesSchema, 'List compact, redacted control-plane plans and change audit records.'),
    createZodActionVariant('get_control_change', SystemGetControlChangeSchema, 'Get compact, redacted details for one control-plane plan or change.'),
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

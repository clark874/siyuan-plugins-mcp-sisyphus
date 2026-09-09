import * as notebookApi from '../../api/notebook';
import * as packagesApi from '../../api/packages';
import * as systemApi from '../../api/system';
import { buildChangelogResponse } from '../../core/changelog';
import {
    AGENT_MEMORY_VIRTUAL_PATH,
    AV_ACTIONS,
    FS_ACTIONS,
    SEARCH_ACTIONS,
    TIMELINE_ACTIONS,
    loadToolConfigFromApiFileWithStatus,
    type CategoryToolConfig,
    type SystemAction,
} from '../../core/config';
import { getAgentMemoryStatus } from '../../core/server-instructions';
import {
    SystemAuditEnvironmentSchema,
    SystemBootstrapSchema,
    SystemChangelogSchema,
    SystemGetCurrentTimeSchema,
    SystemGetVersionSchema,
    SystemValidateSourceAuditSchema,
} from '../../core/types';
import { validateSourceAuditBundle } from '../../shared/source-audit-contract';
import type { ToolActionHandler } from '../internal/define-tool';
import { createJsonResult } from '../internal/shared';

function summarizeCapability<Action extends string>(config: CategoryToolConfig<Action>, actions: readonly Action[]) {
    const availability = Object.fromEntries(actions.map((action) => [
        action,
        config.enabled && config.actions[action] === true,
    ]));
    return { enabled: config.enabled && Object.values(availability).some(Boolean), actions: availability };
}

function buildBootstrapCapabilities(config: Awaited<ReturnType<typeof loadToolConfigFromApiFileWithStatus>>['config']) {
    return {
        fs: summarizeCapability(config.fs, FS_ACTIONS),
        search: summarizeCapability(config.search, SEARCH_ACTIONS),
        av: summarizeCapability(config.av, AV_ACTIONS),
        timeline: summarizeCapability(config.timeline, TIMELINE_ACTIONS),
        virtualReference: { mode: 'indirect-only', directRead: false },
    };
}

function buildBootstrapNextCalls(
    capabilities: ReturnType<typeof buildBootstrapCapabilities>,
    notebookName: string | undefined,
    memoryStatus: 'missing' | 'fresh' | 'stale',
) {
    const nextCalls: Array<Record<string, unknown>> = [];
    if (memoryStatus !== 'missing' && capabilities.fs.actions.read) {
        nextCalls.push({
            tool: 'fs',
            action: 'read',
            args: { path: AGENT_MEMORY_VIRTUAL_PATH },
            purpose: memoryStatus === 'stale'
                ? 'Read the workspace memory before planning; it is stale, so verify before relying on it'
                : 'Read the workspace memory before planning or browsing notes',
        });
    }
    if (notebookName && capabilities.fs.actions.tree) {
        nextCalls.push({
            tool: 'fs',
            action: 'tree',
            args: { path: `/${notebookName}`, maxDepth: 2 },
            purpose: 'Browse the primary readable notebook',
        });
    }
    if (capabilities.search.actions.knowledge) {
        nextCalls.push({ tool: 'search', action: 'knowledge', purpose: 'Semantic knowledge discovery with reference collapse' });
    }
    if (capabilities.search.actions.fulltext) {
        nextCalls.push({ tool: 'search', action: 'fulltext', purpose: 'Full-text search' });
    }
    if (capabilities.search.actions.query_sql) {
        nextCalls.push({ tool: 'search', action: 'query_sql', purpose: 'Read-only structured query' });
    }
    if (capabilities.av.actions.render) {
        nextCalls.push({ tool: 'av', action: 'render', purpose: 'Database render' });
    }
    if (capabilities.timeline.actions.list_nodes) {
        nextCalls.push({ tool: 'timeline', action: 'list_nodes', purpose: 'Timeline/snapshot discovery' });
    }
    return nextCalls;
}

function shallowConfiguration(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { type: raw === null ? 'null' : typeof raw, keys: [] as string[] };
    }
    return { type: 'object', keys: Object.keys(raw as Record<string, unknown>).sort().slice(0, 100) };
}

function countPluginStates(plugins: Record<string, unknown>[]) {
    return {
        enabled: plugins.filter((pkg) => pkg.enabled === true).length,
        disabled: plugins.filter((pkg) => pkg.enabled !== true).length,
        incompatible: plugins.filter((pkg) => pkg.installedIncompatible === true).length,
        outdated: plugins.filter((pkg) => pkg.outdated === true).length,
    };
}

const handleChangelog: ToolActionHandler = async ({ rawArgs }) => {
    const parsed = SystemChangelogSchema.parse(rawArgs);
    return createJsonResult(buildChangelogResponse(parsed));
};

const handleGetVersion: ToolActionHandler = async ({ client, rawArgs }) => {
    SystemGetVersionSchema.parse(rawArgs);
    return createJsonResult({ version: await systemApi.getVersion(client) });
};

const handleGetCurrentTime: ToolActionHandler = async ({ client, rawArgs }) => {
    SystemGetCurrentTimeSchema.parse(rawArgs);
    const currentTime = await systemApi.getCurrentTime(client);
    return createJsonResult({ currentTime, iso: new Date(currentTime).toISOString() });
};

const handleAuditEnvironment: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = SystemAuditEnvironmentSchema.parse(rawArgs);
    const frontend = parsed.frontend ?? 'desktop';
    const [version, rawConf, packageLists] = await Promise.all([
        systemApi.getVersion(client),
        systemApi.getConf(client),
        Promise.all(packagesApi.INSTALLED_PACKAGE_KINDS.map((kind) => (
            packagesApi.getInstalledPackages(client, kind, '', frontend)
        ))),
    ]);
    const packagesByKind = Object.fromEntries(packagesApi.INSTALLED_PACKAGE_KINDS.map((kind, index) => [
        kind,
        packageLists[index],
    ])) as Record<packagesApi.InstalledPackageKind, Record<string, unknown>[]>;
    return createJsonResult({
        readonly: true,
        version,
        frontend,
        configuration: shallowConfiguration(rawConf),
        packages: {
            totals: Object.fromEntries(packagesApi.INSTALLED_PACKAGE_KINDS.map((kind) => [kind, packagesByKind[kind].length])),
            plugins: countPluginStates(packagesByKind.plugin),
        },
        hints: ['This audit returns only shallow configuration keys and package counts; it never changes system state.'],
    });
};

const handleValidateSourceAudit: ToolActionHandler = async ({ rawArgs }) => {
    const parsed = SystemValidateSourceAuditSchema.parse(rawArgs);
    return createJsonResult(validateSourceAuditBundle({
        inventory: parsed.inventory,
        usageMap: parsed.usageMap,
        baselinesMarkdown: parsed.baselinesMarkdown,
    }));
};

const handleBootstrap: ToolActionHandler = async ({ client, permMgr, rawArgs }) => {
    SystemBootstrapSchema.parse(rawArgs);
    const [version, notebooksResult, toolConfigResult] = await Promise.all([
        systemApi.getVersion(client),
        notebookApi.listNotebooks(client),
        loadToolConfigFromApiFileWithStatus(client),
        permMgr.reload(),
    ]);
    const allNotebooks = notebooksResult?.notebooks ?? [];
    const notebooks = allNotebooks.flatMap((notebook) => {
        const permission = permMgr.get(notebook.id);
        if (permission === 'none') return [];
        return [{
            id: notebook.id,
            name: notebook.name,
            closed: notebook.closed,
            permission,
            readable: true,
            writable: permission === 'rw' || permission === 'rwd',
            deletable: permission === 'rwd',
        }];
    });
    const capabilities = buildBootstrapCapabilities(toolConfigResult.config);
    const primaryOpenNotebook = notebooks.find((notebook) => !notebook.closed);
    const agentMemory = getAgentMemoryStatus(
        toolConfigResult.config.agentSiyuanMemoryText ?? '',
        toolConfigResult.config.agentSiyuanMemoryUpdatedAt ?? '',
    );
    return createJsonResult({
        schemaVersion: 3,
        bootstrap: true,
        operation: { action: 'system.bootstrap', readOnly: true },
        connection: {
            access: 'permission-controlled',
            readableNotebookCount: notebooks.length,
            writableNotebookCount: notebooks.filter((notebook) => notebook.writable).length,
            deletableNotebookCount: notebooks.filter((notebook) => notebook.deletable).length,
        },
        version,
        notebooks,
        restrictedNotebookCount: allNotebooks.length - notebooks.length,
        toolConfiguration: { current: toolConfigResult.ok, source: toolConfigResult.source },
        writeSafety: {
            strictMode: toolConfigResult.config.writeSafety.strictMode,
            protocol: toolConfigResult.config.writeSafety.strictMode ? 'preflight-lease-v1' : 'legacy-direct-write',
            helpResource: 'siyuan://help/write-safety',
        },
        capabilities,
        pathGuide: {
            workspacePath: '/Notebook/Folder/Doc (human-readable, used by fs)',
            rootPath: '/ lists all readable notebooks',
            note: 'hPath != .sy storage path != block ID',
        },
        nextCalls: buildBootstrapNextCalls(capabilities, primaryOpenNotebook?.name, agentMemory.status),
        memory: {
            path: AGENT_MEMORY_VIRTUAL_PATH,
            status: agentMemory.status,
            updatedAt: agentMemory.updatedAtLabel,
            age: agentMemory.ageLabel,
            freshnessBasis: 'saved timestamp only',
            contentVerified: false,
        },
        skills: [
            'siyuan-mcp-sisyphus',
            'siyuan-mcp-browse-read',
            'siyuan-mcp-create-edit',
            'siyuan-mcp-search-query',
            'siyuan-mcp-knowledge-ingest',
            'siyuan-mcp-project-knowledge-compile',
            'siyuan-mcp-project-coordinator',
            'siyuan-mcp-knowledge-governance',
            'siyuan-mcp-cross-project-relation-closure',
            'siyuan-mcp-database',
            'siyuan-mcp-project-source',
            'siyuan-mcp-timeline',
            'siyuan-mcp-system-safety',
            'siyuan-mcp-markup-guide',
        ],
        hints: [
            'This response contains no token, configuration body, or plugin secrets.',
            'Prefer fs with human-readable paths for ordinary document operations.',
            'Read before write and re-read after write; rm and mv require user confirmation.',
        ],
    });
};

export const SYSTEM_ACTION_HANDLERS: Record<SystemAction, ToolActionHandler> = {
    changelog: handleChangelog,
    get_version: handleGetVersion,
    get_current_time: handleGetCurrentTime,
    bootstrap: handleBootstrap,
    audit_environment: handleAuditEnvironment,
    validate_source_audit: handleValidateSourceAudit,
};

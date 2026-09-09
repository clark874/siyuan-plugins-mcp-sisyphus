import type { SiYuanClient } from '../api/client';

export const TOOL_CATEGORIES = ['fs', 'notebook', 'document', 'block', 'av', 'file', 'project', 'search', 'provenance', 'tag', 'timeline', 'system', 'extension'] as const;

export type ToolCategory = typeof TOOL_CATEGORIES[number];

export const FS_ACTIONS = ['ls', 'tree', 'read', 'write', 'replace', 'rm', 'mv', 'reorder', 'search'] as const;
export const NOTEBOOK_ACTIONS = ['list', 'get_conf', 'get_permissions', 'get_child_docs'] as const;
export const DOCUMENT_ACTIONS = ['create', 'lookup', 'rename', 'move', 'reorder', 'get_child_blocks', 'get_child_docs', 'set_attr', 'list_tree', 'search_docs', 'get_doc', 'get_outline'] as const;
export const BLOCK_ACTIONS = ['insert', 'prepend', 'append', 'update', 'replace', 'move', 'get_kramdown', 'batch_kramdown', 'get_children', 'transfer_references', 'set_attrs', 'get_attrs', 'info', 'breadcrumb', 'dom', 'docs_info'] as const;
export const AV_ACTIONS = ['get', 'render', 'get_attribute_view_keys', 'get_attribute_view_filter_sort', 'search', 'rename', 'add_rows', 'remove_rows', 'add_column', 'remove_column', 'set_cells', 'duplicate', 'get_primary_key_values'] as const;
export const FILE_ACTIONS = ['register_project_source', 'identify_project', 'scan_project_manifest', 'resolve_project_source', 'read_project_source', 'list_project_sources'] as const;
export const PROJECT_ACTIONS = ['snapshot'] as const;
export const SEARCH_ACTIONS = ['fulltext', 'semantic', 'knowledge', 'check_anchor', 'query_sql', 'get_backlinks', 'search_refs', 'find_replace', 'list_invalid_refs', 'criteria_list', 'criteria_save', 'criteria_remove'] as const;
export const TAG_ACTIONS = ['list', 'rename', 'remove'] as const;
export const TIMELINE_ACTIONS = ['list_nodes', 'create_node', 'compare_node', 'compare_recent'] as const;
export const TIMELINE_APP_ACTIONS = ['list_nodes', 'create_node', 'compare_node'] as const;
export const SYSTEM_ACTIONS = ['changelog', 'get_version', 'get_current_time', 'bootstrap', 'audit_environment', 'validate_source_audit'] as const;
export const EXTENSION_ACTIONS = ['list'] as const;
export const PROVENANCE_ACTIONS = ['register_session', 'record_event', 'discover_session', 'list_project_sessions', 'list_atom_events', 'resolve_session_link', 'validate_session'] as const;

export const NATIVE_EXTENSION_ACTION_ALLOWLIST = {
    search: ['semantic'],
    ref: ['backlinks', 'forwardlinks'],
    outline: ['get'],
    web_fetch: null,
    web_search: null,
} as const;
export const SAFE_NATIVE_EXTENSION_TOOLS = Object.keys(NATIVE_EXTENSION_ACTION_ALLOWLIST) as Array<keyof typeof NATIVE_EXTENSION_ACTION_ALLOWLIST>;
export const DEFAULT_BLOCKED_NATIVE_EXTENSION_TOOLS = [
    'asset', 'attr', 'block', 'bookmark', 'dailynote', 'database', 'document',
    'export', 'file', 'history', 'http_request', 'image', 'import', 'inbox', 'notebook', 'question', 'repo', 'skill', 'sql', 'sync', 'system', 'tag',
    'template', 'todo_write', 'unzip', 'workspace',
] as const;
export function getNativeExtensionActionPolicy(
    toolName: string,
): readonly string[] | null | undefined {
    return (NATIVE_EXTENSION_ACTION_ALLOWLIST as Record<string, readonly string[] | null>)[toolName];
}

/**
 * 判断一次原生 MCP 转发是否落在 Sisyphus 的只读白名单内。
 *
 * 聚合工具的顶层 readOnlyHint 可能因同时包含读写子动作而保守地为 false，
 * 因此必须以实际转发的子动作作为安全分类依据。无子动作工具仅在调用方
 * 没有伪造 action 选择器时通过；运行时仍会核验官方 registry 的只读声明。
 */
export function isAllowlistedNativeExtensionRead(
    toolName: string,
    forwardedArgs: Record<string, unknown> = {},
): boolean {
    const policy = getNativeExtensionActionPolicy(toolName);
    if (policy === undefined) return false;
    const downstreamAction = typeof forwardedArgs.action === 'string'
        ? forwardedArgs.action
        : undefined;
    if (policy === null) return downstreamAction === undefined;
    return downstreamAction !== undefined && policy.includes(downstreamAction);
}

export type FsAction = typeof FS_ACTIONS[number];
export type NotebookAction = typeof NOTEBOOK_ACTIONS[number];
export type DocumentAction = typeof DOCUMENT_ACTIONS[number];
export type BlockAction = typeof BLOCK_ACTIONS[number];
export type AvAction = typeof AV_ACTIONS[number];
export type FileAction = typeof FILE_ACTIONS[number];
export type ProjectAction = typeof PROJECT_ACTIONS[number];
export type SearchAction = typeof SEARCH_ACTIONS[number];
export type TagAction = typeof TAG_ACTIONS[number];
export type TimelineAction = typeof TIMELINE_ACTIONS[number];
export type TimelineAppAction = typeof TIMELINE_APP_ACTIONS[number];
export type SystemAction = typeof SYSTEM_ACTIONS[number];
export type ExtensionAction = typeof EXTENSION_ACTIONS[number];
export type ProvenanceAction = typeof PROVENANCE_ACTIONS[number];

export type ToolActionMap = {
    fs: FsAction;
    notebook: NotebookAction;
    document: DocumentAction;
    block: BlockAction;
    av: AvAction;
    file: FileAction;
    project: ProjectAction;
    search: SearchAction;
    tag: TagAction;
    timeline: TimelineAction;
    system: SystemAction;
    extension: ExtensionAction;
    provenance: ProvenanceAction;
};

export interface CategoryToolConfig<Action extends string = string> {
    enabled: boolean;
    actions: Partial<Record<Action, boolean>>;
}

export interface ExtensionCategoryToolConfig extends CategoryToolConfig<ExtensionAction> {
    includeNativeTools: boolean;
    blockedTools: string[];
    nativeActionPolicyVersion: number;
}

export type TimelineCategoryToolConfig = CategoryToolConfig<TimelineAction>;

export interface McpAppConfig<Action extends string> {
    enabled: boolean;
    actions: Record<Action, boolean>;
}

export interface McpAppsConfig {
    timeline: McpAppConfig<TimelineAppAction>;
}

export interface DebugToolConfig {
    includeUiRefreshMetadata: boolean;
    slimResponses: boolean;
}

export interface WriteSafetyConfig {
    strictMode: boolean;
}

/**
 * Some MCP clients react to `isError: true` by re-sending the full tools/list
 * payload as a self-correction hint. With 13 aggregated tools that payload is
 * around 118 KB, so a single mistyped argument can burn tens of thousands of
 * tokens of client context. Opting in downgrades only agent-correctable
 * failures to a non-error result; the structured `error` payload is preserved
 * and genuine failures such as permission_denied still report `isError: true`.
 */
export interface ErrorReportingConfig {
    softRecoverableErrors: boolean;
}

export type ToolConfig = {
    fs: CategoryToolConfig<FsAction>;
    notebook: CategoryToolConfig<NotebookAction>;
    document: CategoryToolConfig<DocumentAction>;
    block: CategoryToolConfig<BlockAction>;
    av: CategoryToolConfig<AvAction>;
    file: CategoryToolConfig<FileAction>;
    project: CategoryToolConfig<ProjectAction>;
    search: CategoryToolConfig<SearchAction>;
    tag: CategoryToolConfig<TagAction>;
    timeline: TimelineCategoryToolConfig;
    system: CategoryToolConfig<SystemAction>;
    extension: ExtensionCategoryToolConfig;
    provenance: CategoryToolConfig<ProvenanceAction>;
    mcpApps: McpAppsConfig;
    userRulesText: string;
    agentSiyuanMemoryText: string;
    agentSiyuanMemoryUpdatedAt: string;
    writeSafety: WriteSafetyConfig;
    errorReporting: ErrorReportingConfig;
    debug: DebugToolConfig;
};

export interface ToolConfigLoadResult {
    config: ToolConfig;
    ok: boolean;
    source: 'api_file' | 'default_fallback';
    errorMessage?: string;
    rawLength?: number;
}

export const MCP_TOOLS_CONFIG_API_PATH = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpToolsConfig';
export const AGENT_MEMORY_VIRTUAL_PATH = '/AGENTS.md';
export const USER_RULES_VIRTUAL_PATH = '/USER_RULES.md';
export const AGENT_MEMORY_STALE_AFTER_DAYS = 7;
const EMITTED_TOOL_CONFIG_WARNINGS = new Set<string>();

export const ACTIONS_BY_CATEGORY: { [Category in ToolCategory]: readonly ToolActionMap[Category][] } = {
    fs: FS_ACTIONS,
    notebook: NOTEBOOK_ACTIONS,
    document: DOCUMENT_ACTIONS,
    block: BLOCK_ACTIONS,
    av: AV_ACTIONS,
    file: FILE_ACTIONS,
    project: PROJECT_ACTIONS,
    search: SEARCH_ACTIONS,
    tag: TAG_ACTIONS,
    timeline: TIMELINE_ACTIONS,
    system: SYSTEM_ACTIONS,
    extension: EXTENSION_ACTIONS,
    provenance: PROVENANCE_ACTIONS,
};

export type ActionTier = 'basic' | 'advanced';

const ACTION_TIERS: Record<ToolCategory, Record<string, ActionTier>> = {
    fs: {
        ls: 'basic', tree: 'basic', read: 'basic', write: 'basic', replace: 'basic',
        search: 'basic', reorder: 'basic',
        rm: 'advanced', mv: 'advanced',
    },
    notebook: {
        list: 'basic', get_conf: 'basic', get_child_docs: 'basic',
        get_permissions: 'advanced',
    },
    document: {
        create: 'basic', lookup: 'basic', get_doc: 'basic', get_outline: 'basic',
        get_child_blocks: 'basic', get_child_docs: 'basic',
        search_docs: 'basic', rename: 'basic',
        move: 'advanced', reorder: 'advanced', set_attr: 'advanced', list_tree: 'advanced',
    },
    block: {
        get_kramdown: 'basic', batch_kramdown: 'basic', get_children: 'basic', get_attrs: 'basic',
        info: 'basic', append: 'basic', prepend: 'basic',
        insert: 'basic', update: 'basic', replace: 'basic',
        move: 'advanced',
        transfer_references: 'advanced', set_attrs: 'advanced', breadcrumb: 'advanced',
        dom: 'advanced', docs_info: 'advanced',
    },
    av: {
        get: 'basic', render: 'basic',
        get_attribute_view_keys: 'basic', get_attribute_view_filter_sort: 'basic',
        search: 'basic', get_primary_key_values: 'basic',
        rename: 'advanced', add_rows: 'advanced', remove_rows: 'advanced', add_column: 'advanced',
        remove_column: 'advanced', set_cells: 'advanced',
        duplicate: 'advanced',
    },
    file: {
        identify_project: 'basic', resolve_project_source: 'basic', read_project_source: 'basic', list_project_sources: 'basic',
        register_project_source: 'advanced', scan_project_manifest: 'advanced',
    },
    project: {
        snapshot: 'basic',
    },
    search: {
        fulltext: 'basic', semantic: 'basic', knowledge: 'basic', check_anchor: 'basic', query_sql: 'basic',
        get_backlinks: 'basic',
        search_refs: 'advanced', find_replace: 'advanced', list_invalid_refs: 'advanced',
        criteria_list: 'advanced', criteria_save: 'advanced', criteria_remove: 'advanced',
    },
    tag: {
        list: 'basic', rename: 'basic',
        remove: 'advanced',
    },
    timeline: {
        list_nodes: 'basic', create_node: 'basic', compare_node: 'basic',
    },
    system: {
        get_version: 'basic', get_current_time: 'basic', changelog: 'basic',
        bootstrap: 'basic', audit_environment: 'basic', validate_source_audit: 'basic',
    },
    extension: {
        list: 'basic',
    },
    provenance: {
        register_session: 'basic', record_event: 'basic', list_project_sessions: 'basic',
        list_atom_events: 'basic', resolve_session_link: 'basic', validate_session: 'basic',
    },
};

export function getActionTier(category: ToolCategory, action: string): ActionTier {
    return ACTION_TIERS[category]?.[action] ?? 'advanced';
}

export const DANGEROUS_ACTIONS: Record<ToolCategory, Set<string>> = {
    fs: new Set(['rm', 'mv']),
    notebook: new Set(),
    document: new Set(['move']),
    block: new Set(['move']),
    av: new Set(),
    file: new Set(['register_project_source', 'scan_project_manifest', 'resolve_project_source']),
    project: new Set(),
    search: new Set(['find_replace', 'criteria_save', 'criteria_remove']),
    tag: new Set(['remove']),
    timeline: new Set(),
    system: new Set(),
    extension: new Set(),
    provenance: new Set(),
};

const createActionsRecord = <Action extends string>(
    actions: readonly Action[],
    enabledByDefault: readonly Action[],
): Record<Action, boolean> => {
    const enabledSet = new Set(enabledByDefault);
    return actions.reduce((acc, action) => {
        acc[action] = enabledSet.has(action);
        return acc;
    }, {} as Record<Action, boolean>);
};

export function buildDefaultToolConfig(): ToolConfig {
    return {
        fs: {
            enabled: true,
            actions: createActionsRecord(FS_ACTIONS, ['ls', 'tree', 'read', 'write', 'replace', 'rm', 'mv', 'reorder', 'search']),
        },
        notebook: {
            enabled: true,
            actions: createActionsRecord(NOTEBOOK_ACTIONS, NOTEBOOK_ACTIONS),
        },
        document: {
            enabled: true,
            actions: createActionsRecord(DOCUMENT_ACTIONS, DOCUMENT_ACTIONS),
        },
        block: {
            enabled: true,
            actions: createActionsRecord(BLOCK_ACTIONS, BLOCK_ACTIONS),
        },
        av: {
            enabled: true,
            actions: createActionsRecord(AV_ACTIONS, ['get', 'render', 'get_attribute_view_keys', 'get_attribute_view_filter_sort', 'search', 'rename', 'add_rows', 'remove_rows', 'add_column', 'remove_column', 'set_cells', 'duplicate', 'get_primary_key_values']),
        },
        file: {
            enabled: true,
            actions: createActionsRecord(FILE_ACTIONS, FILE_ACTIONS),
        },
        project: {
            enabled: true,
            actions: createActionsRecord(PROJECT_ACTIONS, PROJECT_ACTIONS),
        },
        search: {
            enabled: true,
            actions: createActionsRecord(SEARCH_ACTIONS, SEARCH_ACTIONS),
        },
        tag: {
            enabled: true,
            actions: createActionsRecord(TAG_ACTIONS, ['list', 'rename', 'remove']),
        },
        timeline: {
            enabled: true,
            actions: createActionsRecord(TIMELINE_ACTIONS, ['list_nodes', 'create_node', 'compare_node', 'compare_recent']),
        },
        system: {
            enabled: true,
            actions: createActionsRecord(SYSTEM_ACTIONS, SYSTEM_ACTIONS),
        },
        extension: {
            enabled: true,
            actions: createActionsRecord(EXTENSION_ACTIONS, ['list']),
            includeNativeTools: true,
            blockedTools: [...DEFAULT_BLOCKED_NATIVE_EXTENSION_TOOLS],
            nativeActionPolicyVersion: 2,
        },
        provenance: {
            enabled: true,
            actions: createActionsRecord(PROVENANCE_ACTIONS, PROVENANCE_ACTIONS),
        },
        mcpApps: {
            timeline: {
                enabled: true,
                actions: createActionsRecord(TIMELINE_APP_ACTIONS, TIMELINE_APP_ACTIONS),
            },
        },
        userRulesText: '创建文档/日记后主动设图标',
        agentSiyuanMemoryText: '',
        agentSiyuanMemoryUpdatedAt: '',
        writeSafety: { strictMode: true },
        errorReporting: { softRecoverableErrors: false },
        debug: {
            includeUiRefreshMetadata: false,
            slimResponses: true,
        },
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function collectLegacyToolConfigSignals(raw: Record<string, unknown>): string[] {
    const signals: string[] = [];

    for (const category of TOOL_CATEGORIES) {
        const value = raw[category];
        if (typeof value === 'boolean') {
            signals.push(`${category}=<boolean>`);
            continue;
        }
        if (Array.isArray(value)) {
            signals.push(`${category}=[...]`);
        }
    }

    const flatActionKeys = Object.entries(raw)
        .filter(([key, value]) => !['userRulesText', 'agentSiyuanMemoryText', 'agentSiyuanMemoryUpdatedAt'].includes(key) && !TOOL_CATEGORIES.includes(key as ToolCategory) && typeof value === 'boolean')
        .map(([key]) => key);
    if (flatActionKeys.length > 0) {
        const preview = flatActionKeys.slice(0, 3).join(', ');
        signals.push(flatActionKeys.length > 3 ? `${preview}, ...` : preview);
    }

    return signals;
}

export function getLegacyToolConfigWarning(raw: unknown, source = 'mcpToolsConfig'): string | null {
    if (!isRecord(raw)) return null;

    const signals = collectLegacyToolConfigSignals(raw);
    if (signals.length === 0) return null;

    return [
        `[MCP] Detected legacy tool config format in ${source}.`,
        'Only nested { category: { enabled, actions } } config is supported now.',
        'Legacy keys are ignored and defaults may be used instead.',
        'Open MCP settings and save once to rewrite the config.',
        `Detected legacy fields: ${signals.join('; ')}`,
    ].join(' ');
}

export function emitToolConfigWarningOnce(
    warning: string | null | undefined,
    warn: (message: string) => void = (message) => console.warn(message),
): string | null {
    if (!warning) return null;
    if (EMITTED_TOOL_CONFIG_WARNINGS.has(warning)) return warning;
    EMITTED_TOOL_CONFIG_WARNINGS.add(warning);
    warn(warning);
    return warning;
}

export function warnLegacyToolConfigOnce(
    raw: unknown,
    options: {
        source?: string;
        warn?: (message: string) => void;
    } = {},
): string | null {
    const warning = getLegacyToolConfigWarning(raw, options.source);
    return emitToolConfigWarningOnce(warning, options.warn);
}

export function resetToolConfigWarningStateForTests(): void {
    EMITTED_TOOL_CONFIG_WARNINGS.clear();
}

function applyNestedConfig(config: ToolConfig, raw: Record<string, unknown>) {
    if (typeof raw.userRulesText === 'string') {
        config.userRulesText = raw.userRulesText;
    }
    if (typeof raw.agentSiyuanMemoryText === 'string') {
        config.agentSiyuanMemoryText = raw.agentSiyuanMemoryText;
    }
    if (typeof raw.agentSiyuanMemoryUpdatedAt === 'string') {
        config.agentSiyuanMemoryUpdatedAt = raw.agentSiyuanMemoryUpdatedAt;
    }
    if (isRecord(raw.writeSafety) && typeof raw.writeSafety.strictMode === 'boolean') {
        config.writeSafety.strictMode = raw.writeSafety.strictMode;
    }
    if (isRecord(raw.errorReporting) && typeof raw.errorReporting.softRecoverableErrors === 'boolean') {
        config.errorReporting.softRecoverableErrors = raw.errorReporting.softRecoverableErrors;
    }
    if (isRecord(raw.debug)) {
        if (typeof raw.debug.includeUiRefreshMetadata === 'boolean') {
            config.debug.includeUiRefreshMetadata = raw.debug.includeUiRefreshMetadata;
        }
        if (typeof raw.debug.slimResponses === 'boolean') {
            config.debug.slimResponses = raw.debug.slimResponses;
        }
    }

    const appActionSets = {
        timeline: TIMELINE_APP_ACTIONS,
    } as const;
    if (isRecord(raw.mcpApps)) {
        for (const appName of Object.keys(appActionSets) as Array<keyof McpAppsConfig>) {
            const appValue = raw.mcpApps[appName];
            if (!isRecord(appValue)) continue;
            if (typeof appValue.enabled === 'boolean') config.mcpApps[appName].enabled = appValue.enabled;
            if (!isRecord(appValue.actions)) continue;
            for (const action of appActionSets[appName]) {
                const value = appValue.actions[action];
                if (typeof value === 'boolean') {
                    (config.mcpApps[appName].actions as Record<string, boolean>)[action] = value;
                }
            }
        }
    }

    for (const category of TOOL_CATEGORIES) {
        const categoryValue = raw[category];
        if (!isRecord(categoryValue)) continue;
        if (typeof categoryValue.enabled === 'boolean') {
            config[category].enabled = categoryValue.enabled;
        }
        if (category === 'extension') {
            if (typeof categoryValue.includeNativeTools === 'boolean') {
                config.extension.includeNativeTools = categoryValue.includeNativeTools;
            }
            if (Array.isArray(categoryValue.blockedTools)) {
                const normalizedBlockedTools = Array.from(new Set(
                    categoryValue.blockedTools
                        .filter((name): name is string => typeof name === 'string')
                        .map((name) => name.trim())
                        .filter(Boolean),
                )).sort();
                const storedPolicyVersion = typeof categoryValue.nativeActionPolicyVersion === 'number'
                    ? Math.max(1, Math.trunc(categoryValue.nativeActionPolicyVersion))
                    : 0;
                config.extension.blockedTools = storedPolicyVersion < 2
                    ? Array.from(new Set([...normalizedBlockedTools, 'history', 'inbox', 'repo'])).sort()
                    : normalizedBlockedTools;
            }
            config.extension.nativeActionPolicyVersion = 2;
        }
        // Migrate the short-lived timeline.appActions format into the dedicated
        // MCP Apps permission namespace without changing AI tool permissions.
        if (category === 'timeline' && !isRecord(raw.mcpApps) && isRecord(categoryValue.appActions)) {
            for (const action of TIMELINE_APP_ACTIONS) {
                const value = categoryValue.appActions[action];
                if (typeof value === 'boolean') {
                    config.mcpApps.timeline.actions[action] = value;
                }
            }
        }
        if (!isRecord(categoryValue.actions)) continue;
        // Existing persisted configurations predate compare_recent. Do not
        // silently expand their AI-readable surface during migration; fresh
        // installations still receive the enabled default above.
        if (category === 'timeline' && typeof categoryValue.actions.compare_recent !== 'boolean') {
            config.timeline.actions.compare_recent = false;
        }
        for (const action of ACTIONS_BY_CATEGORY[category]) {
            const value = categoryValue.actions[action];
            if (typeof value === 'boolean') {
                config[category].actions[action] = value;
            }
        }
    }
}

export function normalizeToolConfig(raw: unknown): ToolConfig {
    const config = buildDefaultToolConfig();
    if (!isRecord(raw)) return config;

    applyNestedConfig(config, raw);

    for (const category of TOOL_CATEGORIES) {
        if (!config[category].enabled) continue;
        if (getEnabledActions(config[category]).length === 0) {
            config[category].enabled = false;
        }
    }

    return config;
}

export function getEnabledActions(categoryConfig: CategoryToolConfig<string>): string[] {
    return Object.entries(categoryConfig.actions)
        .filter(([, enabled]) => enabled)
        .map(([action]) => action);
}

function formatConfigLoadError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

export async function loadToolConfigFromApiFileWithStatus(client: SiYuanClient): Promise<ToolConfigLoadResult> {
    try {
        const content = await client.readFile(MCP_TOOLS_CONFIG_API_PATH);
        if (!content) {
            return {
                config: buildDefaultToolConfig(),
                ok: true,
                source: 'api_file',
                rawLength: 0,
            };
        }
        const raw = JSON.parse(content);
        warnLegacyToolConfigOnce(raw, { source: `SiYuan API file "${MCP_TOOLS_CONFIG_API_PATH}"` });
        return {
            config: normalizeToolConfig(raw),
            ok: true,
            source: 'api_file',
            rawLength: content.length,
        };
    } catch (error) {
        return {
            config: buildDefaultToolConfig(),
            ok: false,
            source: 'default_fallback',
            errorMessage: formatConfigLoadError(error),
        };
    }
}

export async function loadToolConfigFromApiFile(client: SiYuanClient): Promise<ToolConfig> {
    return (await loadToolConfigFromApiFileWithStatus(client)).config;
}

export async function saveToolConfigToApiFile(client: SiYuanClient, config: ToolConfig): Promise<ToolConfig> {
    const normalized = normalizeToolConfig(config);
    await client.writeFile(MCP_TOOLS_CONFIG_API_PATH, JSON.stringify(normalized, null, 2));
    return normalized;
}

export async function readAgentSiyuanMemory(client: SiYuanClient): Promise<string> {
    return (await loadToolConfigFromApiFile(client)).agentSiyuanMemoryText ?? '';
}

export async function writeAgentSiyuanMemory(client: SiYuanClient, text: string): Promise<ToolConfig> {
    const config = await loadToolConfigFromApiFile(client);
    return saveToolConfigToApiFile(client, {
        ...config,
        agentSiyuanMemoryText: text,
        agentSiyuanMemoryUpdatedAt: text.trim() ? new Date().toISOString() : '',
    });
}

export function isDangerousAction(category: ToolCategory, action: string): boolean {
    return DANGEROUS_ACTIONS[category].has(action);
}

export function formatDangerousActionsList(): string[] {
    const lines: string[] = [];
    for (const category of TOOL_CATEGORIES) {
        const actions = DANGEROUS_ACTIONS[category];
        if (actions.size === 0) continue;
        const items = [...actions].map(a => `\`${category}(action="${a}")\``);
        lines.push(`- ${items.join(', ')}`);
    }
    return lines;
}

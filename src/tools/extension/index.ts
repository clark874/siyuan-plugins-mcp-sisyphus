import type { SiYuanClient } from '../../api/client';
import {
    getNativeExtensionActionPolicy,
    isAllowlistedNativeExtensionRead,
    SAFE_NATIVE_EXTENSION_TOOLS,
    type ExtensionCategoryToolConfig,
} from '../../core/config';
import type {
    OfficialMcpDiscoverySnapshot,
    OfficialMcpRuntime,
    OfficialMcpTool,
} from '../../core/official-mcp-bridge';
import type { PermissionManager } from '../../core/permissions';
import type { ToolDescriptor } from '../../core/tool-registry';
import type { ActionVariant, ToolResult } from '../internal/shared';

const EXTENSION_DESCRIPTION = [
    'Bridge tools exposed through the official SiYuan /mcp endpoint.',
    'Plugin tools are included by default; when includeNativeTools is enabled, native SiYuan tools are additionally restricted to a fixed read-oriented allowlist.',
    'Use action="list" to inspect discovery status; while native tools are disabled, it returns counts only and omits tool details.',
    'Every exposed tool keeps its official name as the action.',
    'Pass downstream parameters inside arguments={...}. Tools without readOnlyHint=true may mutate data and require explicit user confirmation.',
].join(' ');
const RESERVED_EXTENSION_ACTIONS = new Set(['help', 'list']);
const SAFE_NATIVE_TOOL_NAMES = new Set<string>(SAFE_NATIVE_EXTENSION_TOOLS);
const WORKSPACE_NATIVE_TOOLS = new Set(['search', 'ref', 'outline', 'history', 'repo', 'image']);

function validateNativeCall(
    tool: OfficialMcpTool,
    args: Record<string, unknown>,
    permMgr: PermissionManager,
): ToolResult | undefined {
    if (tool.source !== 'native') return undefined;
    const policy = getNativeExtensionActionPolicy(tool.name);
    if (policy === undefined) {
        return textResult({
            error: { code: 'native_tool_not_allowed', message: `Native tool "${tool.name}" is not allowlisted.` },
        }, true);
    }

    if (WORKSPACE_NATIVE_TOOLS.has(tool.name)) {
        const getAll = (permMgr as PermissionManager & { getAll?: () => Record<string, string> }).getAll;
        if (typeof getAll === 'function' && Object.values(getAll.call(permMgr)).some((permission) => permission === 'none')) {
            return textResult({
                error: {
                    code: 'native_permission_boundary',
                    message: `Native tool "${tool.name}" cannot be forwarded while any notebook is restricted because its result cannot be filtered reliably by Sisyphus.`,
                },
            }, true);
        }
    }

    if (policy === null) {
        if (!isAllowlistedNativeExtensionRead(tool.name, args)) {
            return textResult({
                error: {
                    code: 'native_action_not_allowed',
                    message: `Native tool "${tool.name}" does not accept a forwarded action selector.`,
                },
            }, true);
        }
        if (!tool.readOnlyHint) {
            return textResult({
                error: {
                    code: 'native_readonly_hint_required',
                    message: `Actionless native tool "${tool.name}" is not declared read-only by the official registry.`,
                },
            }, true);
        }
        return undefined;
    }

    const downstreamAction = typeof args.action === 'string' ? args.action : undefined;
    if (!isAllowlistedNativeExtensionRead(tool.name, args)) {
        return textResult({
            error: {
                code: 'native_action_not_allowed',
                message: `Native action "${tool.name}.${downstreamAction ?? '<missing>'}" is not allowlisted.`,
                allowedActions: [...policy],
            },
        }, true);
    }
    return undefined;
}

export const EXTENSION_VARIANTS: ActionVariant<'list'>[] = [{
    action: 'list',
    schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            action: { type: 'string', const: 'list' },
            refresh: {
                type: 'boolean',
                description: 'Refresh the official SiYuan MCP registry before returning discovery status. Tool details are omitted while native tools are disabled.',
            },
        },
        required: ['action'],
    },
}];

function textResult(value: unknown, isError = false): ToolResult {
    return {
        content: [{
            type: 'text',
            text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
        }],
        ...(isError ? { isError: true } : {}),
    };
}

function isSourceEnabled(tool: OfficialMcpTool, config: ExtensionCategoryToolConfig): boolean {
    return tool.source === 'plugin' || config.includeNativeTools;
}

export function getExposedExtensionTools(
    config: ExtensionCategoryToolConfig,
    runtime?: OfficialMcpRuntime,
): OfficialMcpTool[] {
    if (!config.enabled || !runtime) return [];
    return filterExposedTools(runtime.bridge.getTools(), config);
}

function filterExposedTools(
    tools: OfficialMcpTool[],
    config: ExtensionCategoryToolConfig,
): OfficialMcpTool[] {
    const blocked = new Set(config.blockedTools);
    return tools.filter((tool) =>
        isSourceEnabled(tool, config)
        && (tool.source !== 'native' || SAFE_NATIVE_TOOL_NAMES.has(tool.name))
        && !blocked.has(tool.name)
        && !RESERVED_EXTENSION_ACTIONS.has(tool.name),
    );
}

export function rebaseOfficialSchemaRefs(
    value: unknown,
    basePointer: string,
): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => rebaseOfficialSchemaRefs(item, basePointer));
    }
    if (value === null || typeof value !== 'object') return value;

    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, child]) => {
            if (key === '$ref' && typeof child === 'string' && child.startsWith('#')) {
                return [key, `${basePointer}${child.slice(1)}`];
            }
            return [key, rebaseOfficialSchemaRefs(child, basePointer)];
        }),
    );
}

function actionVariant(tool: OfficialMcpTool, branchIndex: number): Record<string, unknown> {
    const safety = tool.readOnlyHint
        ? 'Declared read-only by the official MCP registry.'
        : 'May modify data or trigger side effects. Explicit user confirmation is required before calling.';
    const degradation = tool.schemaDegraded
        ? ' The original input schema was invalid and has been degraded to a generic object.'
        : '';
    return {
        type: 'object',
        title: tool.title || tool.name,
        description: `${tool.description || tool.name} ${safety}${degradation}`,
        source: tool.source,
        readOnlyHint: tool.readOnlyHint,
        ...(tool.effectScope ? { effectScope: tool.effectScope } : {}),
        properties: {
            action: {
                type: 'string',
                const: tool.name,
                description: `Official SiYuan MCP tool name: ${tool.name}`,
            },
            arguments: rebaseOfficialSchemaRefs(
                tool.inputSchema,
                `#/oneOf/${branchIndex}/properties/arguments`,
            ),
        },
        required: ['action', 'arguments'],
        additionalProperties: false,
    };
}

export function listExtensionTools(
    config: ExtensionCategoryToolConfig,
    runtime?: OfficialMcpRuntime,
): ToolDescriptor[] {
    if (!config.enabled) return [];
    const tools = getExposedExtensionTools(config, runtime);
    const actionNames = ['help', 'list', ...tools.map((tool) => tool.name)];
    const variants: Record<string, unknown>[] = [{
        type: 'object',
        title: 'Extension help',
        properties: {
            action: { type: 'string', const: 'help' },
            topic: {
                type: 'string',
                description: 'Optional official MCP tool name.',
            },
        },
        required: ['action'],
        additionalProperties: false,
    }, {
        type: 'object',
        title: 'List official MCP tools',
        properties: {
            action: { type: 'string', const: 'list' },
            refresh: {
                type: 'boolean',
                description: 'Refresh the official SiYuan MCP registry before returning discovery status. Tool details are omitted while native tools are disabled.',
            },
        },
        required: ['action'],
        additionalProperties: false,
    }, ...tools.map((tool, index) => actionVariant(tool, index + 2))];

    return [{
        name: 'extension',
        description: [
            EXTENSION_DESCRIPTION,
            `Currently exposed actions: ${actionNames.join(', ')}.`,
        ].join('\n\n'),
        inputSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: actionNames,
                    description: 'Use list or an exposed official MCP tool name.',
                },
                arguments: {
                    type: 'object',
                    description: 'Arguments forwarded unchanged to the selected official MCP tool.',
                    additionalProperties: true,
                },
                refresh: { type: 'boolean' },
                topic: { type: 'string' },
            },
            required: ['action'],
            oneOf: variants,
        },
    }];
}

export async function prepareExtensionTools(
    config: ExtensionCategoryToolConfig,
    runtime?: OfficialMcpRuntime,
): Promise<OfficialMcpDiscoverySnapshot | undefined> {
    if (!config.enabled || !runtime) return undefined;
    const cachedSnapshot = runtime.bridge.getSnapshot();
    if (cachedSnapshot.lastAttemptAt) {
        if (updateExposedToolsFingerprint(config, runtime, cachedSnapshot.tools)) {
            await notifyListChanged(runtime);
        }
        return cachedSnapshot;
    }

    if (runtime.discoveryMode === 'background') {
        updateExposedToolsFingerprint(config, runtime, cachedSnapshot.tools);
        if (!runtime.discoveryPromise) {
            runtime.discoveryPromise = runtime.bridge.refresh()
                .then(async (snapshot) => {
                    if (updateExposedToolsFingerprint(config, runtime, snapshot.tools)) {
                        await notifyListChanged(runtime);
                    }
                    return snapshot;
                })
                .finally(() => {
                    runtime.discoveryPromise = undefined;
                });
        }
        return cachedSnapshot;
    }

    const snapshot = await runtime.bridge.refresh();
    if (updateExposedToolsFingerprint(config, runtime, snapshot.tools)) {
        await notifyListChanged(runtime);
    }
    return snapshot;
}

function updateExposedToolsFingerprint(
    config: ExtensionCategoryToolConfig,
    runtime: OfficialMcpRuntime,
    tools = runtime.bridge.getTools(),
): boolean {
    const nextFingerprint = JSON.stringify(filterExposedTools(tools, config));
    const changed = runtime.exposedToolsFingerprint !== nextFingerprint;
    runtime.exposedToolsFingerprint = nextFingerprint;
    return changed;
}

async function notifyListChanged(runtime: OfficialMcpRuntime): Promise<void> {
    try {
        await runtime.notifyToolListChanged?.();
    } catch {
        // Discovery and calls remain usable even when the outer client has
        // already disconnected or does not accept list-changed notifications.
    }
}

function formatDiscovery(
    snapshot: OfficialMcpDiscoverySnapshot,
    config: ExtensionCategoryToolConfig,
) {
    const blocked = new Set(config.blockedTools);
    const exposed = filterExposedTools(snapshot.tools, config);
    const sourceCounts = snapshot.tools.reduce((counts, tool) => {
        counts[tool.source] += 1;
        return counts;
    }, { plugin: 0, native: 0 });
    return {
        connected: snapshot.connected,
        supported: snapshot.supported,
        siyuanVersion: snapshot.siyuanVersion,
        minSupportedVersion: snapshot.minSupportedVersion,
        lastSuccessfulRefreshAt: snapshot.lastSuccessfulRefreshAt,
        lastAttemptAt: snapshot.lastAttemptAt,
        error: snapshot.error,
        changed: snapshot.changed,
        discoveredCount: snapshot.tools.length,
        discoveredBySource: sourceCounts,
        nativeToolsEnabled: config.includeNativeTools,
        exposedCount: exposed.length,
        schemaBytes: JSON.stringify(exposed.map((tool) => tool.inputSchema)).length,
        detailsIncluded: config.includeNativeTools,
        ...(config.includeNativeTools
            ? {
                tools: snapshot.tools.map((tool) => ({
                    name: tool.name,
                    title: tool.title,
                    description: tool.description,
                    source: tool.source,
                    readOnlyHint: tool.readOnlyHint,
                    effectScope: tool.effectScope,
                    schemaDegraded: tool.schemaDegraded,
                    actionPolicy: tool.source === 'native'
                        ? getNativeExtensionActionPolicy(tool.name) === null
                            ? { mode: 'actionless-readonly' }
                            : getNativeExtensionActionPolicy(tool.name)
                                ? { mode: 'allowlist', allowedActions: [...getNativeExtensionActionPolicy(tool.name)!] }
                                : { mode: 'blocked' }
                        : { mode: 'plugin-owned' },
                    blocked: blocked.has(tool.name),
                    sourceEnabled: isSourceEnabled(tool, config),
                    reservedActionConflict: RESERVED_EXTENSION_ACTIONS.has(tool.name),
                    exposed: exposed.some((candidate) => candidate.name === tool.name),
                })),
            }
            : {}),
        hint: snapshot.error
            ? 'Official MCP tools require SiYuan 3.7.0+, an administrator session, and a valid API token.'
            : config.includeNativeTools
                ? 'Plugin and native SiYuan tools are exposed. Call extension(action="<official tool name>", arguments={...}).'
                : 'Plugin tools are exposed. Enable includeNativeTools in settings to expose native SiYuan tools.',
    };
}

function helpResult(
    topic: string | undefined,
    config: ExtensionCategoryToolConfig,
    runtime?: OfficialMcpRuntime,
): ToolResult {
    const discoveredTools = runtime?.bridge.getTools() ?? [];
    const tool = discoveredTools.find((candidate) => candidate.name === topic);
    if (topic && tool) {
        const sourceEnabled = isSourceEnabled(tool, config);
        const reservedActionConflict = RESERVED_EXTENSION_ACTIONS.has(tool.name);
        const policyBlocked = tool.source === 'native' && !SAFE_NATIVE_TOOL_NAMES.has(tool.name);
        return textResult({
            tool: tool.name,
            title: tool.title,
            description: tool.description,
            source: tool.source,
            readOnlyHint: tool.readOnlyHint,
            requiresConfirmation: !tool.readOnlyHint,
            effectScope: tool.effectScope,
            blocked: config.blockedTools.includes(tool.name),
            policyBlocked,
            sourceEnabled,
            reservedActionConflict,
            exposed: sourceEnabled
                && !policyBlocked
                && !reservedActionConflict
                && !config.blockedTools.includes(tool.name),
            schemaDegraded: tool.schemaDegraded,
            actionPolicy: tool.source === 'native'
                ? getNativeExtensionActionPolicy(tool.name) === null
                    ? { mode: 'actionless-readonly' }
                    : getNativeExtensionActionPolicy(tool.name)
                        ? { mode: 'allowlist', allowedActions: [...getNativeExtensionActionPolicy(tool.name)!] }
                        : { mode: 'blocked' }
                : { mode: 'plugin-owned' },
            inputSchema: tool.inputSchema,
            call: {
                action: tool.name,
                arguments: {},
            },
        });
    }

    return textResult({
        tool: 'extension',
        description: EXTENSION_DESCRIPTION,
        actions: {
            list: {
                parameters: { refresh: 'boolean, optional' },
                description: 'Inspect or refresh official MCP tool discovery.',
            },
            '<official tool name>': {
                parameters: { arguments: 'object, required' },
                description: 'Forward one call to the selected official MCP tool. Calls are never retried.',
            },
        },
        includeNativeTools: config.includeNativeTools,
        discoveredCount: discoveredTools.length,
        discoveredBySource: discoveredTools.reduce((counts, candidate) => {
            counts[candidate.source] += 1;
            return counts;
        }, { plugin: 0, native: 0 }),
        detailsIncluded: config.includeNativeTools,
        ...(config.includeNativeTools
            ? {
                discoveredTools: discoveredTools.map((candidate) => ({
                    name: candidate.name,
                    source: candidate.source,
                    exposed: getExposedExtensionTools(config, runtime)
                        .some((exposedTool) => exposedTool.name === candidate.name),
                })),
            }
            : {}),
    });
}

export async function callExtensionTool(
    _client: SiYuanClient,
    rawArgs: Record<string, unknown> | undefined,
    config: ExtensionCategoryToolConfig,
    permMgr: PermissionManager,
    runtime?: OfficialMcpRuntime,
): Promise<ToolResult> {
    const action = typeof rawArgs?.action === 'string' ? rawArgs.action : '';
    if (action === 'help') {
        return helpResult(
            typeof rawArgs?.topic === 'string' ? rawArgs.topic : undefined,
            config,
            runtime,
        );
    }
    if (!runtime) {
        return textResult('Official MCP bridge runtime is unavailable.', true);
    }
    if (action === 'list') {
        const cachedSnapshot = runtime.bridge.getSnapshot();
        const snapshot = rawArgs?.refresh === true || !cachedSnapshot.lastAttemptAt
            ? await runtime.bridge.refresh({
                forceVersionCheck: rawArgs?.refresh === true,
            })
            : cachedSnapshot;
        if (updateExposedToolsFingerprint(config, runtime, snapshot.tools)) {
            await notifyListChanged(runtime);
        }
        return textResult(formatDiscovery(snapshot, config));
    }
    if (!action) {
        return textResult('extension.action is required. Use action="list" to inspect available official MCP tools.', true);
    }
    if (config.blockedTools.includes(action)) {
        return textResult(`Official MCP tool "${action}" is blocked in Sisyphus settings.`, true);
    }

    let tool = getExposedExtensionTools(config, runtime)
        .find((candidate) => candidate.name === action);
    if (!tool) {
        const snapshot = await runtime.bridge.refresh();
        if (updateExposedToolsFingerprint(config, runtime, snapshot.tools)) {
            await notifyListChanged(runtime);
        }
        tool = filterExposedTools(snapshot.tools, config)
            .find((candidate) => candidate.name === action);
    }
    if (!tool) {
        const discovered = runtime.bridge.getTools().find((candidate) => candidate.name === action);
        if (discovered?.source === 'native' && !config.includeNativeTools) {
            return textResult(
                `Native SiYuan MCP tool "${action}" is disabled. Enable extension.includeNativeTools in Sisyphus settings first.`,
                true,
            );
        }
        if (RESERVED_EXTENSION_ACTIONS.has(action)) {
            return textResult(
                `Official MCP tool "${action}" conflicts with a reserved extension action and cannot be exposed.`,
                true,
            );
        }
        return textResult(
            `Unknown official MCP tool "${action}". Use extension(action="list", refresh=true) to inspect current tools.`,
            true,
        );
    }

    const downstreamArgs = rawArgs?.arguments;
    if (downstreamArgs === null || typeof downstreamArgs !== 'object' || Array.isArray(downstreamArgs)) {
        return textResult('extension.arguments must be an object.', true);
    }
    const validatedArgs = downstreamArgs as Record<string, unknown>;
    const policyFailure = validateNativeCall(tool, validatedArgs, permMgr);
    if (policyFailure) return policyFailure;
    return runtime.bridge.callTool(action, validatedArgs);
}

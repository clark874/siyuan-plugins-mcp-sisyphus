import type { CallToolResult, ClientCapabilities } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type { SiYuanClient } from '../api/client';
import { callTimelineTool, TIMELINE_VARIANTS } from '../tools/timeline';
import { buildAggregatedTool } from '../tools/internal/shared';
import type { McpAppConfig, McpAppsConfig, TimelineAppAction } from './config';
import type { PermissionManager } from './permissions';
import type { ToolDescriptor } from './tool-registry';

import MCP_APP_HTML from 'virtual:siyuan-mcp-app-html';

export const MCP_APPS_EXTENSION_ID = 'io.modelcontextprotocol/ui';
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';
export const MCP_APP_LEGACY_RESOURCE_URI_META_KEY = 'ui/resourceUri';
export const TIMELINE_APP_TOOL_NAME = 'timeline_app';
export const TIMELINE_APP_ACTION_TOOL_NAME = 'timeline_app_action';
export const TIMELINE_APP_HANDOFF_MESSAGE = '时间线界面已打开，请在界面中选择节点并执行操作。';
export const TIMELINE_APP_SCOPE_INSTRUCTION = [
    'The Timeline App has no target-document picker after launch.',
    'If documentId is omitted, the App starts in global-only mode and can display only global timeline nodes; document-specific nodes are unavailable.',
    'When the user asks for a particular document timeline, resolve and pass that documentId before calling this tool. Omit documentId only when the user wants the global timeline.',
].join(' ');
export const TIMELINE_APP_MODEL_INSTRUCTION = [
    'The MCP App is the sole surface for user-initiated timeline operations after this tool succeeds.',
    `Reply with exactly "${TIMELINE_APP_HANDOFF_MESSAGE}" and stop.`,
].join(' ');

export const MCP_APP_RESOURCE_URIS = { timeline: 'ui://siyuan-sisyphus/timeline' } as const;

const TimelineAppInputSchema = z.object({
    documentId: z.string().trim().min(1).optional(),
    tag: z.string().trim().min(1).optional(),
}).strict().refine((value) => !value.tag || Boolean(value.documentId), {
    message: 'documentId is required when tag is provided.',
});

const TIMELINE_APP_TOOL: ToolDescriptor = {
    name: TIMELINE_APP_TOOL_NAME,
    title: 'Open SiYuan Timeline',
    description: [
        'Open exactly one SiYuan Timeline MCP App for the user.',
        TIMELINE_APP_SCOPE_INSTRUCTION,
        'Add tag with documentId to open that historical diff directly.',
        TIMELINE_APP_MODEL_INSTRUCTION,
    ].join(' '),
    inputSchema: {
        type: 'object', additionalProperties: false,
        properties: {
            documentId: { type: 'string', minLength: 1 },
            tag: { type: 'string', minLength: 1 },
        },
    },
    outputSchema: { type: 'object', additionalProperties: true },
    annotations: { title: 'Open SiYuan Timeline', readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    _meta: {
        ui: { resourceUri: MCP_APP_RESOURCE_URIS.timeline, visibility: ['model'] },
        [MCP_APP_LEGACY_RESOURCE_URI_META_KEY]: MCP_APP_RESOURCE_URIS.timeline,
    },
};

const MCP_APP_RESOURCES = [{
    uri: MCP_APP_RESOURCE_URIS.timeline,
    name: 'siyuan_timeline',
    title: 'SiYuan Timeline',
    description: 'Browse timeline nodes and inspect block diffs.',
    mimeType: MCP_APP_MIME_TYPE,
}] as const;

export function supportsMcpApps(capabilities: ClientCapabilities | undefined): boolean {
    const extension = capabilities?.extensions?.[MCP_APPS_EXTENSION_ID] as { mimeTypes?: unknown } | undefined;
    return Array.isArray(extension?.mimeTypes) && extension.mimeTypes.includes(MCP_APP_MIME_TYPE);
}

function buildTimelineActionTool(config: McpAppConfig<TimelineAppAction>): ToolDescriptor | undefined {
    const tool = buildAggregatedTool(
        'timeline',
        'App-only timeline operations. Hidden from the model and callable only from the Timeline MCP App.',
        config,
        TIMELINE_VARIANTS.filter((variant) => variant.action in config.actions),
    )[0];
    if (!tool) return undefined;
    return { ...tool, name: TIMELINE_APP_ACTION_TOOL_NAME, title: 'SiYuan Timeline App Actions', _meta: { ui: { visibility: ['app'] } } };
}

export function decorateToolsWithMcpApps(tools: ToolDescriptor[], enabled: boolean, appConfig?: McpAppsConfig): ToolDescriptor[] {
    if (!enabled || !appConfig?.timeline.enabled) return tools;
    const additions = [TIMELINE_APP_TOOL, buildTimelineActionTool(appConfig.timeline)].filter(Boolean) as ToolDescriptor[];
    const existingNames = new Set(tools.map((tool) => tool.name));
    return [...tools, ...additions.filter((tool) => !existingNames.has(tool.name))];
}

function attachPresentation(
    result: { content: CallToolResult['content']; isError?: boolean; structuredContent?: Record<string, unknown> },
    payloadExtras: Record<string, unknown>,
) {
    let payload = result.structuredContent;
    if (!payload) {
        const text = result.content.find((item) => item.type === 'text')?.text;
        if (text) {
            try {
                const parsed = JSON.parse(text) as unknown;
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
            } catch {
                // 保留非 JSON 结果，由结构化展示字段补足。
            }
        }
    }
    const structuredContent = {
        ...(payload ?? {}), ...payloadExtras,
        presentationMode: 'mcp-app-only',
        message: TIMELINE_APP_HANDOFF_MESSAGE,
        modelInstruction: TIMELINE_APP_MODEL_INSTRUCTION,
    };
    return { ...result, content: [{ type: 'text' as const, text: JSON.stringify(structuredContent, null, 2) }], structuredContent };
}

export async function callTimelineAppTool(
    client: SiYuanClient,
    permMgr: PermissionManager,
    rawArgs: unknown,
    config: McpAppConfig<TimelineAppAction>,
) {
    const parsed = TimelineAppInputSchema.parse(rawArgs ?? {});
    const action = parsed.tag ? 'compare_node' : 'list_nodes';
    if (config.actions[action] !== true) throw new Error(`Timeline App action "${action}" is disabled.`);
    const args = parsed.tag
        ? { action, documentId: parsed.documentId, tag: parsed.tag, page: 1, pageSize: 100 }
        : { action, scope: parsed.documentId ? 'all' : 'global', ...(parsed.documentId ? { documentId: parsed.documentId } : {}), page: 1, pageSize: 50 };
    const result = await callTimelineTool(client, args, config, permMgr);
    return {
        ...attachPresentation(result, { action }),
        _meta: { 'io.siyuan-sisyphus/timeline-permissions': { appActions: Object.entries(config.actions).filter(([, value]) => value).map(([key]) => key) } },
    };
}

export function listMcpAppResources(config?: McpAppsConfig) {
    return !config || config.timeline.enabled ? MCP_APP_RESOURCES.map((resource) => ({ ...resource })) : [];
}

export function readMcpAppResource(uri: string, config?: McpAppsConfig) {
    const definition = MCP_APP_RESOURCES.find((resource) => resource.uri === uri);
    if (!definition || (config && !config.timeline.enabled)) return undefined;
    return { uri: definition.uri, mimeType: MCP_APP_MIME_TYPE, text: MCP_APP_HTML, _meta: { ui: { prefersBorder: true } } };
}

export function compactMcpAppToolResult<T extends {
    content: CallToolResult['content']; isError?: boolean; structuredContent?: unknown; _meta?: Record<string, unknown>;
}>(toolName: string, _action: string, result: T, enabled: boolean, appConfig?: McpAppsConfig): T {
    if (!enabled || !appConfig?.timeline.enabled || ![TIMELINE_APP_TOOL_NAME, TIMELINE_APP_ACTION_TOOL_NAME].includes(toolName)) return result;
    return {
        ...result,
        _meta: {
            ...result._meta,
            'io.siyuan-sisyphus/timeline-permissions': {
                appActions: Object.entries(appConfig.timeline.actions).filter(([, value]) => value).map(([key]) => key),
            },
        },
    };
}

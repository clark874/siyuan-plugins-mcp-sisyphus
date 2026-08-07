import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { z } from 'zod';

import type { SiYuanClient } from '../api/client';
import { getVersion } from '../api/system';
import {
    MIN_OFFICIAL_MCP_VERSION,
    supportsOfficialMcp,
} from '../shared/official-mcp-support';
import type { ToolResult } from '../tools/internal/shared';
import { noopSchemaValidator } from './noops/noop-schema-validator';

const SELF_PLUGIN_TOOL_PREFIX = 'plugin__siyuan_plugins_mcp_sisyphus__';

const OfficialToolSchema = z.object({
    name: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    inputSchema: z.unknown().optional(),
    outputSchema: z.unknown().optional(),
    source: z.string().optional(),
    readOnlyHint: z.boolean().optional(),
    effectScope: z.string().optional(),
}).passthrough();
const OfficialListToolsResultSchema = z.object({
    tools: z.array(OfficialToolSchema),
    nextCursor: z.string().optional(),
}).passthrough();

export type OfficialMcpToolSource = 'plugin' | 'native';

export interface OfficialMcpTool {
    name: string;
    title?: string;
    description?: string;
    inputSchema: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    source: OfficialMcpToolSource;
    readOnlyHint: boolean;
    effectScope?: string;
    schemaDegraded: boolean;
}

export interface OfficialMcpDiscoverySnapshot {
    tools: OfficialMcpTool[];
    connected: boolean;
    supported?: boolean;
    siyuanVersion?: string;
    minSupportedVersion?: string;
    lastSuccessfulRefreshAt?: string;
    lastAttemptAt?: string;
    error?: string;
    changed: boolean;
}

export interface OfficialMcpRuntime {
    bridge: OfficialMcpBridge;
    notifyToolListChanged?: () => Promise<void> | void;
    exposedToolsFingerprint?: string;
    discoveryMode?: 'blocking' | 'background';
    discoveryPromise?: Promise<OfficialMcpDiscoverySnapshot>;
}

export interface OfficialMcpBridgeOptions {
    fetch?: typeof fetch;
    getSiYuanVersion?: () => Promise<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeOfficialInputSchema(
    schema: unknown,
): { schema: Record<string, unknown>; degraded: boolean } {
    if (!isRecord(schema)) {
        return { schema: { type: 'object', additionalProperties: true }, degraded: true };
    }

    const declaredType = schema.type;
    const hasComposition = Array.isArray(schema.oneOf)
        || Array.isArray(schema.anyOf)
        || Array.isArray(schema.allOf)
        || typeof schema.$ref === 'string';
    if (declaredType !== undefined && declaredType !== 'object') {
        return { schema: { type: 'object', additionalProperties: true }, degraded: true };
    }
    if (declaredType === undefined && !hasComposition && !isRecord(schema.properties)) {
        return { schema: { type: 'object', additionalProperties: true }, degraded: true };
    }

    return {
        schema: declaredType === undefined && !hasComposition
            ? { ...schema, type: 'object' }
            : { ...schema },
        degraded: false,
    };
}

export function selectOfficialTools(rawTools: unknown[]): OfficialMcpTool[] {
    const selected = new Map<string, OfficialMcpTool>();
    for (const rawTool of rawTools) {
        const parsed = OfficialToolSchema.safeParse(rawTool);
        if (!parsed.success) continue;
        const tool = parsed.data;
        const source = !tool.source ? 'native' : tool.source;
        if (source !== 'plugin' && source !== 'native') continue;
        if (tool.name.startsWith(SELF_PLUGIN_TOOL_PREFIX)) continue;

        const normalizedInput = normalizeOfficialInputSchema(tool.inputSchema);
        selected.set(tool.name, {
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: normalizedInput.schema,
            outputSchema: isRecord(tool.outputSchema) ? tool.outputSchema : undefined,
            source,
            readOnlyHint: tool.readOnlyHint === true,
            effectScope: tool.effectScope,
            schemaDegraded: normalizedInput.degraded,
        });
    }
    return [...selected.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function toolFingerprint(tools: OfficialMcpTool[]): string {
    return JSON.stringify(tools.map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        source: tool.source,
        readOnlyHint: tool.readOnlyHint,
        effectScope: tool.effectScope,
        schemaDegraded: tool.schemaDegraded,
    })));
}

export class OfficialMcpBridge {
    private readonly siyuanClient: SiYuanClient;
    private readonly fetchImpl?: typeof fetch;
    private readonly getSiYuanVersion: () => Promise<string>;
    private client?: Client;
    private transport?: StreamableHTTPClientTransport;
    private connecting?: Promise<void>;
    private cachedTools: OfficialMcpTool[] = [];
    private connected = false;
    private lastSuccessfulRefreshAt?: string;
    private lastAttemptAt?: string;
    private lastError?: string;
    private versionChecked = false;
    private supported?: boolean;
    private siyuanVersion?: string;

    constructor(siyuanClient: SiYuanClient, options: OfficialMcpBridgeOptions = {}) {
        this.siyuanClient = siyuanClient;
        this.fetchImpl = options.fetch;
        this.getSiYuanVersion = options.getSiYuanVersion
            ?? (() => getVersion(this.siyuanClient));
    }

    getTools(): OfficialMcpTool[] {
        return this.cachedTools.map((tool) => ({
            ...tool,
            inputSchema: { ...tool.inputSchema },
            outputSchema: tool.outputSchema ? { ...tool.outputSchema } : undefined,
        }));
    }

    getSnapshot(changed = false): OfficialMcpDiscoverySnapshot {
        return {
            tools: this.getTools(),
            connected: this.connected,
            supported: this.supported,
            siyuanVersion: this.siyuanVersion,
            minSupportedVersion: MIN_OFFICIAL_MCP_VERSION,
            lastSuccessfulRefreshAt: this.lastSuccessfulRefreshAt,
            lastAttemptAt: this.lastAttemptAt,
            error: this.lastError,
            changed,
        };
    }

    async refresh(options: { forceVersionCheck?: boolean } = {}): Promise<OfficialMcpDiscoverySnapshot> {
        this.lastAttemptAt = new Date().toISOString();
        const previousFingerprint = toolFingerprint(this.cachedTools);
        const supported = await this.checkSupport(options.forceVersionCheck === true);
        if (!supported) {
            await this.resetConnection();
            this.cachedTools = [];
            return this.getSnapshot(previousFingerprint !== toolFingerprint(this.cachedTools));
        }

        try {
            const tools = await this.listToolsOnce();
            return this.commitRefresh(tools, previousFingerprint);
        } catch {
            await this.resetConnection();
        }

        try {
            const tools = await this.listToolsOnce();
            return this.commitRefresh(tools, previousFingerprint);
        } catch (error) {
            this.connected = false;
            this.lastError = formatError(error);
            this.cachedTools = [];
            return this.getSnapshot(previousFingerprint !== toolFingerprint(this.cachedTools));
        }
    }

    async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
        if (!await this.checkSupport()) {
            return {
                content: [{
                    type: 'text',
                    text: this.lastError || `Official SiYuan MCP requires SiYuan ${MIN_OFFICIAL_MCP_VERSION} or newer.`,
                }],
                isError: true,
            };
        }
        try {
            await this.ensureConnected();
        } catch (error) {
            this.connected = false;
            return {
                content: [{
                    type: 'text',
                    text: `Official SiYuan MCP is unavailable before dispatch: ${formatError(error)}`,
                }],
                isError: true,
            };
        }

        try {
            const result = await this.client!.callTool({ name, arguments: args }) as {
                content: Array<{ type: string; text?: string; [key: string]: unknown }>;
                isError?: boolean;
            };
            return {
                content: result.content.map((item) => item.type === 'text'
                    ? { type: 'text' as const, text: typeof item.text === 'string' ? item.text : '' }
                    : { type: 'text' as const, text: JSON.stringify(item) }),
                isError: result.isError,
            };
        } catch (error) {
            this.connected = false;
            this.lastError = formatError(error);
            return {
                content: [{
                    type: 'text',
                    text: [
                        `Official MCP tool call failed after dispatch: ${this.lastError}`,
                        'Execution status is unknown. Inspect the target plugin state before deciding whether to retry.',
                    ].join('\n'),
                }],
                isError: true,
            };
        }
    }

    async close(): Promise<void> {
        await this.resetConnection();
    }

    private async listToolsOnce(): Promise<OfficialMcpTool[]> {
        await this.ensureConnected();
        const rawTools: unknown[] = [];
        let cursor: string | undefined;

        do {
            const request = {
                method: 'tools/list' as const,
                params: cursor ? { cursor } : {},
            };
            const result = await this.client!.request(
                request,
                OfficialListToolsResultSchema,
                { timeout: 5000 },
            );
            rawTools.push(...result.tools);
            cursor = result.nextCursor;
        } while (cursor);

        return selectOfficialTools(rawTools);
    }

    private commitRefresh(
        tools: OfficialMcpTool[],
        previousFingerprint: string,
    ): OfficialMcpDiscoverySnapshot {
        this.cachedTools = tools;
        this.connected = true;
        this.lastError = undefined;
        this.lastSuccessfulRefreshAt = new Date().toISOString();
        return this.getSnapshot(previousFingerprint !== toolFingerprint(tools));
    }

    private async checkSupport(force = false): Promise<boolean> {
        if (this.versionChecked && !force) return this.supported === true;

        this.versionChecked = true;
        try {
            const version = await this.getSiYuanVersion();
            this.siyuanVersion = version;
            this.supported = supportsOfficialMcp(version);
            if (!this.supported) {
                this.lastError = `SiYuan ${version} does not support the official MCP endpoint. Version ${MIN_OFFICIAL_MCP_VERSION} or newer is required for extension tools.`;
                return false;
            }
            this.lastError = undefined;
            return true;
        } catch (error) {
            this.supported = undefined;
            this.lastError = `Unable to determine SiYuan version through /api/system/version: ${formatError(error)}`;
            return false;
        }
    }

    private async ensureConnected(): Promise<void> {
        if (this.connected && this.client && this.transport) return;
        if (this.connecting) return this.connecting;

        this.connecting = (async () => {
            const headers = { ...this.siyuanClient.getAuthHeaders() };
            delete headers.Connection;
            const transport = new StreamableHTTPClientTransport(
                new URL(`${this.siyuanClient.getBaseUrl()}/mcp`),
                {
                    requestInit: { headers },
                    fetch: this.fetchImpl,
                    reconnectionOptions: {
                        maxReconnectionDelay: 1000,
                        initialReconnectionDelay: 250,
                        reconnectionDelayGrowFactor: 1,
                        maxRetries: 0,
                    },
                },
            );
            const client = new Client(
                { name: 'siyuan-sisyphus-extension-bridge', version: '1.0.0' },
                {
                    capabilities: {},
                    jsonSchemaValidator: noopSchemaValidator,
                    versionNegotiation: {
                        mode: 'auto',
                        probe: { timeoutMs: 5000, maxRetries: 0 },
                    },
                },
            );
            try {
                await client.connect(transport, { timeout: 5000 });
            } catch (error) {
                await transport.close().catch(() => {});
                throw error;
            }
            this.client = client;
            this.transport = transport;
            this.connected = true;
        })();

        try {
            await this.connecting;
        } finally {
            this.connecting = undefined;
        }
    }

    private async resetConnection(): Promise<void> {
        const transport = this.transport;
        this.client = undefined;
        this.transport = undefined;
        this.connected = false;
        if (transport) {
            await transport.close().catch(() => {});
        }
    }
}

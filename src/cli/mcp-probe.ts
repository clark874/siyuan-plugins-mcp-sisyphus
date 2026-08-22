import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

export type DiagnosticCode =
    | 'kernel_not_running'
    | 'kernel_unauthorized'
    | 'plugin_not_installed'
    | 'plugin_not_ready'
    | 'gateway_not_running'
    | 'gateway_unauthorized'
    | 'mcp_initialize_failed'
    | 'tools_list_failed'
    | 'bootstrap_failed'
    | 'bootstrap_schema_mismatch'
    | 'tool_configuration_stale'
    | 'required_tool_missing'
    | 'host_reload_required';

export interface McpProbeOptions {
    url: string;
    token?: string;
    timeoutMs?: number;
    requiredTools?: string[];
}

export interface McpProbeSession {
    initialize(): Promise<void>;
    listTools(): Promise<string[]>;
    bootstrap(): Promise<unknown>;
    close(): Promise<void>;
}

export interface McpProbeDependencies {
    createSession(options: McpProbeOptions): McpProbeSession;
}

export interface McpProbeResult {
    ready: boolean;
    issue?: DiagnosticCode;
    initialized: boolean;
    toolsListed: boolean;
    bootstrapCompleted: boolean;
    toolCount?: number;
    schemaVersion?: number;
}

const DEFAULT_REQUIRED_TOOLS = ['system'];
const EXPECTED_BOOTSTRAP_SCHEMA_VERSION = 2;

function classifyInitializeError(error: unknown): DiagnosticCode {
    const message = error instanceof Error ? error.message : String(error);
    const status = typeof error === 'object' && error !== null
        ? Number((error as { status?: unknown; statusCode?: unknown }).status ?? (error as { statusCode?: unknown }).statusCode)
        : NaN;
    if (status === 401 || status === 403 || /\b(?:401|403)\b|unauthorized|forbidden/i.test(message)) {
        return 'gateway_unauthorized';
    }
    if (/ECONNREFUSED|ECONNRESET|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|fetch failed|network|socket|aborted|timeout/i.test(message)) {
        return 'gateway_not_running';
    }
    return 'mcp_initialize_failed';
}

function parseBootstrapResult(result: unknown): unknown {
    if (!result || typeof result !== 'object') return result;
    const record = result as Record<string, unknown>;
    if (record.isError === true) throw new Error('bootstrap returned an MCP tool error');
    if (record.structuredContent && typeof record.structuredContent === 'object') {
        return record.structuredContent;
    }
    if (!Array.isArray(record.content)) return result;
    const text = record.content.find((item) => item && typeof item === 'object' && (item as { type?: unknown }).type === 'text') as { text?: unknown } | undefined;
    if (typeof text?.text !== 'string') return result;
    try {
        return JSON.parse(text.text);
    } catch {
        return result;
    }
}

function validateBootstrap(value: unknown): { issue?: DiagnosticCode; schemaVersion?: number } {
    if (!value || typeof value !== 'object') return { issue: 'bootstrap_schema_mismatch' };
    const bootstrap = value as Record<string, unknown>;
    const schemaVersion = typeof bootstrap.schemaVersion === 'number' ? bootstrap.schemaVersion : undefined;
    if (schemaVersion !== EXPECTED_BOOTSTRAP_SCHEMA_VERSION || bootstrap.bootstrap !== true) {
        return { issue: 'bootstrap_schema_mismatch', schemaVersion };
    }
    const toolConfiguration = bootstrap.toolConfiguration;
    if (!toolConfiguration || typeof toolConfiguration !== 'object') {
        return { issue: 'bootstrap_schema_mismatch', schemaVersion };
    }
    if ((toolConfiguration as Record<string, unknown>).current !== true) {
        return { issue: 'tool_configuration_stale', schemaVersion };
    }
    return { schemaVersion };
}

function defaultCreateSession(options: McpProbeOptions): McpProbeSession {
    const client = new Client({ name: 'siyuan-sisyphus-doctor', version: '0.9.1' });
    const headers: Record<string, string> = {};
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    const transport = new StreamableHTTPClientTransport(new URL(options.url), {
        requestInit: { headers },
    });
    return {
        initialize: () => client.connect(transport, { timeout: options.timeoutMs ?? 5000 }),
        listTools: async () => (await client.listTools(undefined, { timeout: options.timeoutMs ?? 5000 })).tools.map((tool) => tool.name),
        bootstrap: () => client.callTool(
            { name: 'system', arguments: { action: 'bootstrap' } },
            { timeout: options.timeoutMs ?? 5000 },
        ),
        close: () => client.close(),
    };
}

export async function probeMcpGateway(
    options: McpProbeOptions,
    dependencies: McpProbeDependencies = { createSession: defaultCreateSession },
): Promise<McpProbeResult> {
    const session = dependencies.createSession(options);
    let initialized = false;
    let toolsListed = false;
    let bootstrapCompleted = false;
    try {
        try {
            await session.initialize();
            initialized = true;
        } catch (error) {
            return { ready: false, issue: classifyInitializeError(error), initialized, toolsListed, bootstrapCompleted };
        }

        let tools: string[];
        try {
            tools = await session.listTools();
            toolsListed = true;
        } catch {
            return { ready: false, issue: 'tools_list_failed', initialized, toolsListed, bootstrapCompleted };
        }

        const requiredTools = options.requiredTools ?? DEFAULT_REQUIRED_TOOLS;
        if (requiredTools.some((name) => !tools.includes(name))) {
            return {
                ready: false,
                issue: 'required_tool_missing',
                initialized,
                toolsListed,
                bootstrapCompleted,
                toolCount: tools.length,
            };
        }

        let rawBootstrap: unknown;
        try {
            rawBootstrap = await session.bootstrap();
            bootstrapCompleted = true;
        } catch {
            return {
                ready: false,
                issue: 'bootstrap_failed',
                initialized,
                toolsListed,
                bootstrapCompleted,
                toolCount: tools.length,
            };
        }

        const validation = validateBootstrap(parseBootstrapResult(rawBootstrap));
        return {
            ready: validation.issue === undefined,
            issue: validation.issue,
            initialized,
            toolsListed,
            bootstrapCompleted,
            toolCount: tools.length,
            schemaVersion: validation.schemaVersion,
        };
    } finally {
        await session.close().catch(() => undefined);
    }
}

const DEFAULT_ZOTERO_MCP_ENDPOINT = 'http://127.0.0.1:23120/mcp';
const MCP_PROTOCOL_VERSION = '2024-11-05';
const REQUEST_TIMEOUT_MS = 30_000;

export const ZOTERO_READ_TOOL_ALLOWLIST = [
    'get_libraries',
    'get_collections',
    'get_collection_items',
    'search_library',
    'get_item_details',
    'get_content',
    'search_annotations',
    'get_annotations',
] as const;

export type ZoteroReadTool = typeof ZOTERO_READ_TOOL_ALLOWLIST[number];

type JsonRpcResponse = {
    id?: string | number | null;
    result?: unknown;
    error?: { code?: number; message?: string; data?: unknown };
};

type ToolListResult = {
    tools?: Array<{ name?: string }>;
};

type ToolCallResult = {
    content?: Array<{ type?: string; text?: string }>;
    structuredContent?: unknown;
    isError?: boolean;
};

function parseJsonResponse(text: string): JsonRpcResponse {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('Zotero MCP returned an empty response.');
    if (!trimmed.startsWith('event:') && !trimmed.startsWith('data:')) {
        return JSON.parse(trimmed) as JsonRpcResponse;
    }
    const data = trimmed
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .filter(Boolean)
        .at(-1);
    if (!data) throw new Error('Zotero MCP returned an unreadable event-stream response.');
    return JSON.parse(data) as JsonRpcResponse;
}

function parseToolPayload(result: ToolCallResult): unknown {
    if (result.structuredContent !== undefined) return result.structuredContent;
    const texts = (result.content ?? [])
        .filter((item) => item.type === 'text' && typeof item.text === 'string')
        .map((item) => item.text as string);
    if (texts.length === 0) return result;
    if (texts.length > 1) return texts;
    try {
        return JSON.parse(texts[0]);
    } catch {
        return texts[0];
    }
}

function sanitizeLocalPaths(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sanitizeLocalPaths);
    if (!value || typeof value !== 'object') return value;

    const sanitized: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (/path$/i.test(key) && typeof child === 'string' && child.startsWith('/')) {
            continue;
        }
        sanitized[key] = sanitizeLocalPaths(child);
    }
    return sanitized;
}

function formatConnectionError(error: unknown): Error {
    const detail = error instanceof Error ? error.message : String(error);
    return new Error(
        `无法连接本地 Zotero 论文源（${DEFAULT_ZOTERO_MCP_ENDPOINT}）：${detail}。请确认 Zotero 已启动且 Zotero MCP 插件监听 23120 端口。`,
    );
}

export class ZoteroMcpClient {
    private nextId = 1;
    private sessionId = '';
    private initialized = false;

    constructor(private readonly endpoint = DEFAULT_ZOTERO_MCP_ENDPOINT) {
        const url = new URL(endpoint);
        if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
            throw new Error('Zotero MCP endpoint must remain on the loopback interface.');
        }
    }

    private async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    accept: 'application/json, text/event-stream',
                    ...(this.sessionId ? { 'mcp-session-id': this.sessionId } : {}),
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: this.nextId++,
                    method,
                    ...(params ? { params } : {}),
                }),
                signal: controller.signal,
            });
            if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
            this.sessionId = response.headers.get('mcp-session-id') ?? this.sessionId;
            const payload = parseJsonResponse(await response.text());
            if (payload.error) {
                throw new Error(payload.error.message ?? `JSON-RPC error ${payload.error.code ?? 'unknown'}`);
            }
            return payload.result;
        } finally {
            clearTimeout(timeout);
        }
    }

    async initialize(): Promise<Record<string, unknown>> {
        if (this.initialized) return {};
        try {
            const result = await this.request('initialize', {
                protocolVersion: MCP_PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: { name: 'sisyphus-literature', version: '1.0.0' },
            });
            this.initialized = true;
            return (result && typeof result === 'object' ? result : {}) as Record<string, unknown>;
        } catch (error) {
            throw formatConnectionError(error);
        }
    }

    async listTools(): Promise<string[]> {
        await this.initialize();
        const result = await this.request('tools/list', {}) as ToolListResult;
        return (result.tools ?? [])
            .map((tool) => tool.name)
            .filter((name): name is string => typeof name === 'string');
    }

    async callTool(name: ZoteroReadTool | 'semantic_status', args: Record<string, unknown> = {}): Promise<unknown> {
        await this.initialize();
        const result = await this.request('tools/call', { name, arguments: args }) as ToolCallResult;
        const payload = parseToolPayload(result);
        if (result.isError) {
            const detail = typeof payload === 'string' ? payload : JSON.stringify(payload);
            throw new Error(`Zotero MCP ${name} failed: ${detail}`);
        }
        return sanitizeLocalPaths(payload);
    }
}

export async function readZoteroHttpStatus(): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
        const statusUrl = new URL('/mcp/status', DEFAULT_ZOTERO_MCP_ENDPOINT);
        const response = await fetch(statusUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
        return await response.json() as Record<string, unknown>;
    } catch (error) {
        throw formatConnectionError(error);
    } finally {
        clearTimeout(timeout);
    }
}

export function compareZoteroToolContracts(
    formalTools: string[],
    advertisedTools: unknown,
): { missingRequired: string[]; advertisedOnly: string[]; formalOnly: string[] } {
    const formal = new Set(formalTools);
    const advertised = new Set(
        Array.isArray(advertisedTools)
            ? advertisedTools.filter((name): name is string => typeof name === 'string')
            : [],
    );
    return {
        missingRequired: ZOTERO_READ_TOOL_ALLOWLIST.filter((name) => !formal.has(name)),
        advertisedOnly: [...advertised].filter((name) => !formal.has(name)).sort(),
        formalOnly: [...formal].filter((name) => !advertised.has(name)).sort(),
    };
}

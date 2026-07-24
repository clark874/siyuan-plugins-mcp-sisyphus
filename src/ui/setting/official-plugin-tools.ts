export interface UiOfficialPluginTool {
    name: string;
    title?: string;
    description?: string;
    readOnlyHint: boolean;
    effectScope?: string;
}

export interface UiOfficialPluginToolDiscovery {
    loading: boolean;
    connected: boolean;
    tools: UiOfficialPluginTool[];
    refreshedAt?: string;
    error?: string;
}

const SELF_PLUGIN_TOOL_PREFIX = "plugin__siyuan_plugins_mcp_sisyphus__";

function requestId(): string {
    return `sisyphus-settings-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function postMcp(
    body: Record<string, unknown>,
    sessionId?: string,
): Promise<{ result: any; sessionId?: string }> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
    };
    if (sessionId) {
        headers["Mcp-Session-Id"] = sessionId;
        headers["MCP-Protocol-Version"] = "2025-06-18";
    }
    const response = await fetch("/mcp", {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
    }
    const payload = JSON.parse(text);
    if (payload?.error) {
        throw new Error(payload.error.message || JSON.stringify(payload.error));
    }
    return {
        result: payload?.result,
        sessionId: response.headers.get("Mcp-Session-Id") || sessionId,
    };
}

export async function discoverOfficialPluginTools(): Promise<UiOfficialPluginToolDiscovery> {
    let sessionId: string | undefined;
    try {
        const initialized = await postMcp({
            jsonrpc: "2.0",
            id: requestId(),
            method: "initialize",
            params: {
                protocolVersion: "2025-06-18",
                capabilities: {},
                clientInfo: { name: "sisyphus-settings", version: "1.0.0" },
            },
        });
        sessionId = initialized.sessionId;
        if (!sessionId) throw new Error("Official MCP initialize response did not include Mcp-Session-Id.");

        const listed = await postMcp({
            jsonrpc: "2.0",
            id: requestId(),
            method: "tools/list",
            params: {},
        }, sessionId);
        const tools = Array.isArray(listed.result?.tools)
            ? listed.result.tools
                .filter((tool: any) => tool?.source === "plugin")
                .filter((tool: any) => typeof tool?.name === "string" && !tool.name.startsWith(SELF_PLUGIN_TOOL_PREFIX))
                .map((tool: any) => ({
                    name: tool.name,
                    title: typeof tool.title === "string" ? tool.title : undefined,
                    description: typeof tool.description === "string" ? tool.description : undefined,
                    readOnlyHint: tool.readOnlyHint === true,
                    effectScope: typeof tool.effectScope === "string" ? tool.effectScope : undefined,
                }))
                .sort((left: UiOfficialPluginTool, right: UiOfficialPluginTool) => left.name.localeCompare(right.name))
            : [];
        return {
            loading: false,
            connected: true,
            tools,
            refreshedAt: new Date().toISOString(),
        };
    } catch (error) {
        return {
            loading: false,
            connected: false,
            tools: [],
            refreshedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error),
        };
    } finally {
        if (sessionId) {
            void fetch("/mcp", {
                method: "DELETE",
                credentials: "same-origin",
                headers: {
                    "Mcp-Session-Id": sessionId,
                    "MCP-Protocol-Version": "2025-06-18",
                },
            }).catch(() => {});
        }
    }
}

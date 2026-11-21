import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

import type { ToolResult } from '../tools/internal/shared';
import type { CliWriteCoordinatorSettings } from './runtime';
import { isGatewayTimeout } from './mcp-probe';

export async function callCliWriteCoordinator(
    settings: CliWriteCoordinatorSettings | undefined,
    name: string,
    args: Record<string, unknown>,
): Promise<ToolResult> {
    if (!settings) {
        return failure(
            'write_coordinator_unavailable',
            'Strict safe writes require the plugin-hosted MCP HTTP server. Enable it in plugin settings and retry.',
        );
    }

    const client = new Client(
        { name: 'siyuan-sisyphus-cli-write-coordinator', version: '1.0.0' },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(new URL(settings.url), {
        ...(settings.token ? {
            authProvider: { token: async () => settings.token! },
        } : {}),
        reconnectionOptions: { maxReconnectionDelay: 0, initialReconnectionDelay: 0, reconnectionDelayGrowFactor: 1, maxRetries: 0 },
    });
    let dispatched = false;
    try {
        await client.connect(transport);
        dispatched = true;
        const result = await client.callTool({ name, arguments: args });
        const content = result.content
            .filter((item): item is Extract<typeof item, { type: 'text' }> => item.type === 'text')
            .map((item) => ({ type: 'text' as const, text: item.text }));
        return {
            content: content.length > 0
                ? content
                : [{ type: 'text', text: JSON.stringify(result.structuredContent ?? {}) }],
            ...(result.isError ? { isError: true } : {}),
            ...(result.structuredContent && typeof result.structuredContent === 'object'
                ? { structuredContent: result.structuredContent as Record<string, unknown> }
                : {}),
        };
    } catch (error) {
        const timedOut = isGatewayTimeout(error);
        if (dispatched && args.validateOnly !== true) {
            return failure('outcome_unknown', timedOut
                ? '提交写入后等待响应超时。先按 requestId 核对目标与回执，再判断是否需要续接。'
                : '提交写入后未取得结果。先按 requestId 核对目标与回执。', true);
        }
        return failure(timedOut ? 'write_coordinator_timeout' : 'write_coordinator_unavailable', timedOut
            ? '插件网关未在期限内响应。检查网关状态后可重新预检。'
            : '未能连接插件写入协调器。请检查插件网关、权限与配置。');
    } finally {
        await client.close().catch(() => {});
    }
}
function failure(code: string, message: string, unknown = false): ToolResult {
    const payload = {
        success: false,
        writeSafetyMode: 'strict',
        writeAttempted: unknown ? null : false,
        writeExecuted: unknown ? null : false,
        ...(unknown ? { transactionState: 'unknown' } : {}),
        error: { code, message },
    };
    return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
        isError: true,
    };
}

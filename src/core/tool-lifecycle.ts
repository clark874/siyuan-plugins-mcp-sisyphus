import type { SiYuanClient } from '../api/client';
import type { ToolCategory } from './config';
import { slimToolResult } from './slim-response';
import type { ToolResult } from '@/tools/internal/shared';
import { stringifyToolJson } from '@/tools/internal/json-serialization';

export interface ToolCallContext {
    client: SiYuanClient;
    category: ToolCategory;
    name: string;
    action: string;
    args: Record<string, unknown> | undefined;
    requestText?: string;
    includeUiRefreshMetadata?: boolean;
    slimResponses?: boolean;
}

function filterUiRefreshMetadata(result: ToolResult, includeUiRefreshMetadata: boolean | undefined): ToolResult {
    if (includeUiRefreshMetadata || result.isError) return result;
    const first = result.content[0];
    if (!first || first.type !== 'text') return result;

    let payload: Record<string, unknown>;
    try {
        const parsed = JSON.parse(first.text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return result;
        payload = parsed as Record<string, unknown>;
    } catch {
        return result;
    }
    const uiRefresh = payload.uiRefresh;
    if (!uiRefresh || typeof uiRefresh !== 'object' || Array.isArray(uiRefresh) || 'partialFailure' in uiRefresh) return result;

    const nextPayload = { ...payload };
    delete nextPayload.uiRefresh;
    return { ...result, content: [{ ...first, text: stringifyToolJson(nextPayload) }] };
}

/** 执行一次工具调用，并仅保留响应压缩与界面刷新元数据过滤。 */
export async function runToolCall(ctx: ToolCallContext, handler: () => Promise<ToolResult>): Promise<ToolResult> {
    const result = await handler();
    if (ctx.slimResponses) return slimToolResult(result, { category: ctx.category, action: ctx.action });
    if (ctx.slimResponses === undefined) return filterUiRefreshMetadata(result, ctx.includeUiRefreshMetadata);
    return result;
}

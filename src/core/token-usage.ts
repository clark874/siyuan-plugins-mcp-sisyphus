import type { ToolConfig } from './config';
import { listAllTools } from './tool-registry';
import { buildServerInstructions } from './server-instructions';

export const APPROX_TOKEN_MODE = 'approx_context_v1' as const;

export interface ApproxTokenMetrics {
    chars: number;
    approxTokens: number;
}

export interface McpInitialTokenCost {
    mcpInitialChars: number;
    mcpInitialApproxTokens: number;
}

export function approximateTokensFromChars(chars: number): number {
    return Math.ceil(Math.max(0, chars) / 4);
}

export function measureApproxText(text: string | undefined | null): ApproxTokenMetrics {
    const normalized = typeof text === 'string' ? text : '';
    return {
        chars: normalized.length,
        approxTokens: approximateTokensFromChars(normalized.length),
    };
}

export function measureApproxContent(content: { type: 'text'; text: string }[] | undefined): ApproxTokenMetrics {
    const text = (content ?? []).map((item) => item.text ?? '').join('');
    return measureApproxText(text);
}

export function calculateMcpInitialTokenCost(config: ToolConfig): McpInitialTokenCost {
    const instructions = buildServerInstructions({
        userRulesText: config.userRulesText,
        agentSiyuanMemoryText: config.agentSiyuanMemoryText,
        agentSiyuanMemoryUpdatedAt: config.agentSiyuanMemoryUpdatedAt,
    }).trim();
    const toolsPayload = JSON.stringify({ tools: listAllTools(config) });
    const totalChars = instructions.length + toolsPayload.length;
    return {
        mcpInitialChars: totalChars,
        mcpInitialApproxTokens: approximateTokensFromChars(totalChars),
    };
}

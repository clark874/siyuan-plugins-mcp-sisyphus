import type { ToolConfig } from './config';
import { listAllTools } from './tool-registry';
import { buildServerInstructions } from './server-instructions';
import {
    approximateTokensFromChars,
    measureApproxContent,
    measureApproxText,
} from '../shared/token-estimate';

export {
    APPROX_TOKEN_MODE,
    approximateTokensFromChars,
    measureApproxContent,
    measureApproxText,
    type ApproxTokenMetrics,
} from '../shared/token-estimate';

export interface McpInitialTokenCost {
    mcpInitialChars: number;
    mcpInitialApproxTokens: number;
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

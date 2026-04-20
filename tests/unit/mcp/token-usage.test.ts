import { describe, expect, it } from 'vitest';

import { buildDefaultToolConfig } from '../../../src/mcp/config';
import {
    APPROX_TOKEN_MODE,
    approximateTokensFromChars,
    calculateMcpInitialTokenCost,
    measureApproxContent,
    measureApproxText,
} from '../../../src/mcp/token-usage';

describe('token usage helpers', () => {
    it('converts chars to approximate tokens', () => {
        expect(approximateTokensFromChars(0)).toBe(0);
        expect(approximateTokensFromChars(1)).toBe(1);
        expect(approximateTokensFromChars(4)).toBe(1);
        expect(approximateTokensFromChars(5)).toBe(2);
    });

    it('measures plain text and content arrays', () => {
        expect(measureApproxText('hello')).toEqual({ chars: 5, approxTokens: 2 });
        expect(measureApproxContent([{ type: 'text', text: 'ab' }, { type: 'text', text: 'cdef' }])).toEqual({
            chars: 6,
            approxTokens: 2,
        });
    });

    it('calculates MCP initial cost from current config', () => {
        const base = buildDefaultToolConfig();
        const full = calculateMcpInitialTokenCost(base);

        const reduced = buildDefaultToolConfig();
        reduced.document.enabled = false;
        reduced.userRulesText = 'Keep answers short.';
        const reducedCost = calculateMcpInitialTokenCost(reduced);

        expect(APPROX_TOKEN_MODE).toBe('approx_context_v1');
        expect(full.mcpInitialChars).toBeGreaterThan(0);
        expect(full.mcpInitialApproxTokens).toBeGreaterThan(0);
        expect(reducedCost.mcpInitialChars).not.toBe(full.mcpInitialChars);
        expect(reducedCost.mcpInitialApproxTokens).not.toBe(full.mcpInitialApproxTokens);
    });
});

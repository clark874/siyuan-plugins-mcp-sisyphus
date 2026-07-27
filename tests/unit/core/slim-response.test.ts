import { describe, expect, it } from 'vitest';

import { slimToolResult } from '@/core/slim-response';

describe('slim document-window responses', () => {
    it('keeps navigation, outline, token, and optional block-reference metadata', () => {
        const result = slimToolResult({
            content: [{
                type: 'text',
                text: JSON.stringify({
                    path: '/Notebook/Doc',
                    content: '## Heading',
                    outline: [{ blockIndex: 0, level: 2, title: 'Heading', id: 'heading' }],
                    blockStart: 0,
                    blockLimit: 1,
                    returnedBlocks: 1,
                    totalBlocks: 2,
                    tokenBudget: 2000,
                    estimatedTokens: 3,
                    tokenMode: 'approx_context_v1',
                    truncated: true,
                    hasNextWindow: true,
                    nextWindow: { action: 'read', path: '/Notebook/Doc', blockStart: 1 },
                    nextWindowHint: 'Continue.',
                    blockRefs: [{ blockIndex: 0, id: 'heading', type: 'h', subtype: 'h2' }],
                }),
            }],
        }, { category: 'fs', action: 'read' });

        expect(JSON.parse(result.content[0].text)).toEqual({
            path: '/Notebook/Doc',
            content: '## Heading',
            outline: [{ blockIndex: 0, level: 2, title: 'Heading', id: 'heading' }],
            blockStart: 0,
            blockLimit: 1,
            returnedBlocks: 1,
            totalBlocks: 2,
            tokenBudget: 2000,
            estimatedTokens: 3,
            tokenMode: 'approx_context_v1',
            truncated: true,
            hasNextWindow: true,
            nextWindow: { action: 'read', path: '/Notebook/Doc', blockStart: 1 },
            nextWindowHint: 'Continue.',
            blockRefs: [{ blockIndex: 0, id: 'heading', type: 'h', subtype: 'h2' }],
        });
    });

    it('does not rewrite forwarded official MCP tool results', () => {
        const original = {
            content: [{
                type: 'text' as const,
                text: JSON.stringify({
                    action: 'downstream_action',
                    content: 'plugin-owned content',
                    nested: { action: 'nested_action' },
                }),
            }],
        };

        expect(slimToolResult(original, {
            category: 'extension',
            action: 'plugin__example__tool',
        })).toEqual(original);
    });
});

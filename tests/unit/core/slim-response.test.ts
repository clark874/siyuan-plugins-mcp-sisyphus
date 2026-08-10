import { describe, expect, it } from 'vitest';

import { slimToolResult } from '@/core/slim-response';

describe('slim document-window responses', () => {
    it('keeps database option and asset content while still dropping generic item content', () => {
        const result = slimToolResult({
            content: [{
                type: 'text',
                text: JSON.stringify({
                    rows: [{
                        values: [
                            {
                                type: 'mSelect',
                                mSelect: [{ content: '核心方法', color: '1' }],
                            },
                            {
                                type: 'mAsset',
                                mAsset: [{ type: 'file', name: '报告', content: 'assets/report.pdf' }],
                            },
                        ],
                    }],
                    genericItems: [{ id: 'generic-1', content: '应继续精简的普通内容' }],
                }),
            }],
        }, { category: 'av', action: 'render' });

        expect(JSON.parse(result.content[0].text)).toEqual({
            rows: [{
                values: [
                    {
                        type: 'mSelect',
                        mSelect: [{ content: '核心方法', color: '1' }],
                    },
                    {
                        type: 'mAsset',
                        mAsset: [{ type: 'file', name: '报告', content: 'assets/report.pdf' }],
                    },
                ],
            }],
            genericItems: [{ id: 'generic-1' }],
        });
    });

    it('does not preserve database-shaped content outside the av tool', () => {
        const result = slimToolResult({
            content: [{
                type: 'text',
                text: JSON.stringify({
                    mSelect: [{ content: '非数据库内容', color: '1' }],
                    mAsset: [{ content: 'private/path.pdf', type: 'file' }],
                }),
            }],
        }, { category: 'system', action: 'unknown' });

        expect(JSON.parse(result.content[0].text)).toEqual({
            mSelect: [{ color: '1' }],
            mAsset: [{ type: 'file' }],
        });
    });

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

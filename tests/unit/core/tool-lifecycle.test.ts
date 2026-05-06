import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { runToolCall } from '@/core/tool-lifecycle';

vi.mock('@/core/analytics', () => ({
    appendAnalyticsEvent: vi.fn(() => Promise.resolve()),
    estimateResultSizeHint: vi.fn(() => '0-200'),
    extractErrorCode: vi.fn(() => 'UnknownError'),
    truncateAnalyticsText: vi.fn((text: string | undefined | null) => ({
        text: typeof text === 'string' ? text : '',
        truncated: false,
    })),
}));

vi.mock('@/core/puppy-state', () => ({
    earnPuppyBalance: vi.fn(async () => ({ totalCalls: 1, balance: 1 })),
    readPuppyStats: vi.fn(async () => ({ totalCalls: 0, balance: 0 })),
    writePuppyEvent: vi.fn(async () => undefined),
}));

vi.mock('@/core/telemetry', () => ({
    maybeSendTelemetry: vi.fn(async () => undefined),
}));

describe('mcp/tool-lifecycle', () => {
    beforeEach(() => {
        delete process.env.SIYUAN_MCP_TRANSPORT;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete process.env.SIYUAN_MCP_TRANSPORT;
    });

    it('awaits analytics persistence for CLI invocations', async () => {
        process.env.SIYUAN_MCP_TRANSPORT = 'cli';
        const { appendAnalyticsEvent } = await import('@/core/analytics');

        let release!: () => void;
        vi.mocked(appendAnalyticsEvent).mockImplementationOnce(() => new Promise<void>((resolve) => {
            release = resolve;
        }));

        let finished = false;
        const promise = runToolCall(
            {
                client: {} as never,
                category: 'notebook',
                name: 'notebook',
                action: 'list',
                args: { action: 'list' },
                requestText: 'siyuan-sisyphus notebook list',
            },
            async () => ({ content: [{ type: 'text', text: '{"ok":true}' }] }),
        ).then(() => {
            finished = true;
        });

        await vi.waitFor(() => {
            expect(appendAnalyticsEvent).toHaveBeenCalledTimes(1);
            expect(release).toBeTypeOf('function');
        });
        expect(vi.mocked(appendAnalyticsEvent).mock.calls[0][1]).toMatchObject({
            requestChars: 'siyuan-sisyphus notebook list'.length,
            responseChars: '{"ok":true}'.length,
            requestApproxTokens: Math.ceil('siyuan-sisyphus notebook list'.length / 4),
            responseApproxTokens: Math.ceil('{"ok":true}'.length / 4),
            totalApproxTokens: Math.ceil('siyuan-sisyphus notebook list'.length / 4) + Math.ceil('{"ok":true}'.length / 4),
            tokenMode: 'approx_context_v1',
            requestText: 'siyuan-sisyphus notebook list',
            responseText: '{"ok":true}',
            requestTextTruncated: false,
            responseTextTruncated: false,
        });
        expect(finished).toBe(false);

        release();
        await promise;
        expect(finished).toBe(true);
    });

    it('does not await analytics persistence for stdio invocations', async () => {
        process.env.SIYUAN_MCP_TRANSPORT = 'stdio';
        const { appendAnalyticsEvent } = await import('@/core/analytics');

        vi.mocked(appendAnalyticsEvent).mockImplementationOnce(() => new Promise<void>(() => {}));

        await expect(runToolCall(
            {
                client: {} as never,
                category: 'notebook',
                name: 'notebook',
                action: 'list',
                args: { action: 'list' },
                requestText: '{"name":"notebook","arguments":{"action":"list"}}',
            },
            async () => ({ content: [{ type: 'text', text: '{"ok":true}' }] }),
        )).resolves.toEqual({ content: [{ type: 'text', text: '{"ok":true}' }] });

        expect(vi.mocked(appendAnalyticsEvent).mock.calls[0][1]).toMatchObject({
            requestChars: '{"name":"notebook","arguments":{"action":"list"}}'.length,
            responseChars: '{"ok":true}'.length,
            tokenMode: 'approx_context_v1',
            requestText: '{"name":"notebook","arguments":{"action":"list"}}',
            responseText: '{"ok":true}',
        });
    });

    it('strips successful uiRefresh metadata by default before returning and logging analytics', async () => {
        const { appendAnalyticsEvent } = await import('@/core/analytics');

        const result = await runToolCall(
            {
                client: {} as never,
                category: 'notebook',
                name: 'notebook',
                action: 'rename',
                args: { action: 'rename' },
            },
            async () => ({
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        success: true,
                        uiRefresh: {
                            applied: true,
                            operations: [{ type: 'reloadFiletree' }],
                        },
                    }, null, 2),
                }],
            }),
        );

        const payload = JSON.parse(result.content[0].text);
        expect(payload).toEqual({ success: true });
        expect(vi.mocked(appendAnalyticsEvent).mock.calls[0][1]).toMatchObject({
            responseText: JSON.stringify({ success: true }, null, 2),
        });
    });

    it('keeps successful uiRefresh metadata when the debug switch is enabled', async () => {
        const result = await runToolCall(
            {
                client: {} as never,
                category: 'notebook',
                name: 'notebook',
                action: 'rename',
                args: { action: 'rename' },
                includeUiRefreshMetadata: true,
            },
            async () => ({
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        success: true,
                        uiRefresh: {
                            applied: true,
                            operations: [{ type: 'reloadFiletree' }],
                        },
                    }, null, 2),
                }],
            }),
        );

        const payload = JSON.parse(result.content[0].text);
        expect(payload.uiRefresh.operations).toEqual([{ type: 'reloadFiletree' }]);
    });

    it('keeps uiRefresh metadata when it contains a partial failure', async () => {
        const result = await runToolCall(
            {
                client: {} as never,
                category: 'notebook',
                name: 'notebook',
                action: 'rename',
                args: { action: 'rename' },
            },
            async () => ({
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        success: true,
                        uiRefresh: {
                            applied: true,
                            operations: [{ type: 'reloadFiletree' }],
                            partialFailure: [{ type: 'reloadFiletree', message: 'reload failed' }],
                        },
                    }, null, 2),
                }],
            }),
        );

        const payload = JSON.parse(result.content[0].text);
        expect(payload.uiRefresh.partialFailure).toEqual([{ type: 'reloadFiletree', message: 'reload failed' }]);
    });
});

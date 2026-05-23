import { describe, expect, it, vi } from 'vitest';

import { callFeedbackTool } from '@/tools/feedback';

function jsonResponse(payload: unknown) {
    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('feedback tool', () => {
    const config = {
        enabled: true,
        actions: {
            submit: true,
        },
    } as const;

    function createMetadata() {
        return {
            editVersion: 2,
            token: 'token-1',
            questionMap: {
                sy30r0: { type: 'select', title: '来源', baseInfo: { delete: true } },
                '8dcnsl': { type: 'input', title: '来源', baseInfo: { delete: false } },
            },
            setting: {
                baseSetting: {
                    checkLogin: false,
                    commitConfig: { options: [{ id: '7p65io', text: '' }] },
                },
            },
        };
    }

    it('submits feedback through the shared feedback channel', async () => {
        const fetcher = vi.fn()
            .mockResolvedValueOnce(jsonResponse({
                code: 0,
                data: createMetadata(),
            }))
            .mockResolvedValueOnce(jsonResponse({
                code: 0,
                data: {
                    aid: 'aid-1',
                    createdTs: 1710000000000,
                    answerShare: { asid: 'asid-1' },
                },
            }));
        global.fetch = fetcher as typeof fetch;

        const result = await callFeedbackTool({} as any, {
            action: 'submit',
            description: '工具参数提示不够清楚',
            impact: '影响调用成功率',
            suggestion: '补充示例',
            agent: 'Claude Desktop / Claude Sonnet 4.5',
            source: 'stdio',
        }, config as any, {} as any);

        expect(result.isError).toBeUndefined();
        expect(JSON.parse(result.content[0].text)).toEqual({
            action: 'submit',
            success: true,
            aid: 'aid-1',
            answerShareId: 'asid-1',
            createdTs: 1710000000000,
        });
        expect(fetcher).toHaveBeenCalledTimes(2);
        const posted = JSON.parse(fetcher.mock.calls[1][1]?.body as string);
        expect(posted.answerJson.answers.fu27dr.strValue).toBe('Claude Desktop / Claude Sonnet 4.5');
        expect(posted.answerJson.answers.sy30r0).toBeUndefined();
        expect(posted.answerJson.answers['8dcnsl']).toMatchObject({
            type: 'input',
            strValue: 'STDIO',
            isManualInput: true,
        });
    });

    it('fills optional agent text with 无 when omitted', async () => {
        const fetcher = vi.fn()
            .mockResolvedValueOnce(jsonResponse({
                code: 0,
                data: createMetadata(),
            }))
            .mockResolvedValueOnce(jsonResponse({ code: 0, data: { aid: 'aid-1' } }));
        global.fetch = fetcher as typeof fetch;

        const result = await callFeedbackTool({} as any, {
            action: 'submit',
            description: '只有必填项',
            source: 'cli',
        }, config as any, {} as any);

        expect(result.isError).toBeUndefined();
        const posted = JSON.parse(fetcher.mock.calls[1][1]?.body as string);
        expect(posted.answerJson.answers.fu27dr.strValue).toBe('无');
        expect(posted.answerJson.answers.bbev5x.strValue).toBe('无');
        expect(posted.answerJson.answers['6wxpgj'].strValue).toBe('无');
        expect(posted.answerJson.answers.sy30r0).toBeUndefined();
        expect(posted.answerJson.answers['8dcnsl']).toMatchObject({
            type: 'input',
            strValue: 'CLI',
            isManualInput: true,
        });
    });

    it('validates required description text', async () => {
        const result = await callFeedbackTool({} as any, {
            action: 'submit',
            description: '   ',
        }, config as any, {} as any);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('description');
    });
});

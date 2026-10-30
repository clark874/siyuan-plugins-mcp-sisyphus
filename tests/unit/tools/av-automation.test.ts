import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTOMATION_ACTION_HANDLERS } from '@/tools/av/automation';
import { AvSetAutomationsSchema } from '@/core/types';
import { ensurePermissionForAvId } from '@/tools/av/handlers';
import { ensurePermissionForDocumentId } from '@/tools/internal/context';
import { validateAutomationConfig } from '@/core/automation-safety';
import { getAttributeView } from '@/api/av';
import { performTransactions } from '@/api/transaction';

vi.mock('@/tools/av/handlers', () => ({ ensurePermissionForAvId: vi.fn(), extractAvRowLookup: vi.fn() }));
vi.mock('@/tools/internal/context', () => ({ ensurePermissionForDocumentId: vi.fn(), ensurePermissionForNotebook: vi.fn() }));
vi.mock('@/core/automation-safety', () => ({ validateAutomationConfig: vi.fn() }));
vi.mock('@/api/av', () => ({ getAttributeView: vi.fn() }));
vi.mock('@/api/transaction', () => ({ performTransactions: vi.fn() }));

const config = { spec: 8, rules: [{ id: '20261021150000-rule001', name: '收集项目标签', enabled: true, trigger: 'block', conditions: [], blockSource: { notebookIDs: ['nb-1'], tags: ['项目'], tagTarget: 'container', documentDepth: 2, includeSelectedDocuments: false, attributes: [{ name: '^custom-project-', nameOperator: 'regex', operator: 'exists' }] }, actions: [{ type: 'collect', target: 'current', fields: { title: { mode: 'template', template: '.action{ "项目" }' } } }] }] };
const ctx = (rawArgs: Record<string, unknown>) => ({ client: {}, permMgr: {}, rawArgs }) as any;

describe('数据库原生自动化扩展', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(ensurePermissionForAvId).mockResolvedValue({ denied: null, avData: { id: 'av-1', automations: config } });
        vi.mocked(validateAutomationConfig).mockResolvedValue(null);
    });

    it('整体保存具体规则并回读配置，事务保留旧配置供撤销', async () => {
        expect(AvSetAutomationsSchema.safeParse({ action: 'set_automations', avID: 'av-1', config: { ...config, spec: 4 } }).success).toBe(false);
        const parsed = AvSetAutomationsSchema.parse({ action: 'set_automations', avID: 'av-1', config });
        const savedConfig = { ...config, rules: config.rules.map(({ conditions, ...rule }) => rule) };
        vi.mocked(getAttributeView).mockResolvedValue({ av: { id: 'av-1', automations: savedConfig } });
        const result = await AUTOMATION_ACTION_HANDLERS.set_automations(ctx(parsed));
        expect(validateAutomationConfig).toHaveBeenCalledWith({}, {}, 'av-1', config);
        expect(performTransactions).toHaveBeenCalledWith({}, [{
            doOperations: [{ action: 'setAttrViewAutomations', avID: 'av-1', blockID: undefined, data: config }],
            undoOperations: [{ action: 'setAttrViewAutomations', avID: 'av-1', blockID: undefined, data: config }],
        }]);
        expect(JSON.parse((result.content[0] as { text: string }).text).verification.status).toBe('verified');
        expect(AvSetAutomationsSchema.safeParse({ ...parsed, config: { ...config, rules: [{ ...config.rules[0], actions: [{ type: 'collect', target: 'current', fields: { asset: { mode: 'static', value: { type: 'mAsset', mAsset: [{ type: 'image', content: 'assets/a.png' }] } } } }] }] } }).success).toBe(false);
    });

    it('来源块不可写时不提交收集事务', async () => {
        const denied = { isError: true, content: [{ type: 'text', text: '来源笔记本只有读取权限' }] } as any;
        vi.mocked(ensurePermissionForDocumentId).mockResolvedValue({ denied, context: { documentId: 'doc-1', notebook: 'nb-1', path: '/doc-1.sy' } });
        const result = await AUTOMATION_ACTION_HANDLERS.collect_blocks(ctx({ action: 'collect_blocks', avID: 'av-1', ruleID: '20261021150000-rule001', blockIDs: ['source-block'] }));
        expect(ensurePermissionForDocumentId).toHaveBeenCalledWith({}, {}, 'source-block', 'write');
        expect(result).toBe(denied);
        expect(performTransactions).not.toHaveBeenCalled();
    });
});

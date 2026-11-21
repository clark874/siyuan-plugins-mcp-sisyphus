import { expect, it, vi } from 'vitest';
import { lintKnowledgeScope } from '@/tools/search/lint';
import { SearchLintSchema } from '@/core/types';
import { createMockClient } from '../../helpers/mock-client';
import { createMockPermissionManager } from '../../helpers/mock-permissions';

it('用更新时间与块 ID 续扫同秒变更，已豁免问题和到期原因均可回读', async () => {
    const notebook = '20261121000000-bbbbbbb';
    const updated = '20261121120002';
    const first = { id: '20261121000001-aaaaaaa', updated, atomType: 'claim', content: '同一段原子', chars: 5, alias: '历史词',
        lintExempt: JSON.stringify({ orphan_atom_candidate: { reason: '保留独立判例', until: '2026-12-31' } }) };
    const second = { ...first, id: '20261121000002-ccccccc',
        lintExempt: JSON.stringify({ orphan_atom_candidate: { reason: '已完成留存期', until: '2026-11-20' } }) };
    const old = { ...first, id: '20261121000003-ddddddd', updated: '20261121110000', lintExempt: undefined };
    const client = createMockClient({ request: vi.fn(async (_endpoint, { stmt }) => {
        if (stmt.includes('strftime(')) return [{ cutoffUpdated: '20261121120100', replaySince: '20261121120000' }];
        if (stmt.includes('FROM refs')) return [];
        if (stmt.includes('ORDER BY b.id')) return [old, first, second];
        if (stmt.includes('ORDER BY b.updated,b.id')) {
            expect(stmt).toContain("b.updated >= '20261121120001'");
            if (stmt.includes('(b.updated, b.id) >')) {
                expect(stmt).toContain(`> ('${updated}', '${first.id}')`);
                return [second];
            }
            return [first, second];
        }
        throw new Error(stmt);
    }) });
    const permission = createMockPermissionManager();
    const run = async (args: Record<string, unknown>) => {
        const result = await lintKnowledgeScope(client, permission, SearchLintSchema.parse({ action: 'lint', notebook, maxBlocks: 1, ...args }));
        return JSON.parse(result.content[0].text!);
    };
    const initial = await run({ updatedSince: '20261121120001' });
    expect(initial).toMatchObject({
        scanMode: 'incremental', scanComplete: false, referenceScanComplete: true, fullyExemptedFindings: 1,
        nextCursor: { afterId: first.id, afterUpdated: updated },
        exemptions: [{ finding: { rule: 'orphan_atom_candidate' }, approvedBy: [{ id: first.id, reason: '保留独立判例' }] }],
    });
    expect(initial).not.toHaveProperty('nextUpdatedSince');
    expect(initial.findings).toContainEqual({ rule: 'duplicate_atom_content', ids: [old.id, first.id, second.id] });
    const final = await run({ cursor: initial.nextCursor });
    expect(final).toMatchObject({ scanComplete: true, nextUpdatedSince: '20261121120001' });
    expect(final.findings).toContainEqual({ rule: 'orphan_atom_candidate', ids: [second.id] });
    expect(final.exemptionDiagnostics).toContainEqual(expect.objectContaining({ id: second.id, state: 'expired' }));
});

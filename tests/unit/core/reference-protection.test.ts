import { describe, expect, it, vi } from 'vitest';

import { expandDisappearingIds, inspectReferenceImpact } from '@/core/reference-protection';

describe('reference protection', () => {
    it('expands block deletions through the live child tree', async () => {
        const root = '20260822000000-root001';
        const child = '20260822000000-child01';
        const client = {
            requestRead: vi.fn(async (_endpoint: string, payload: { id: string }) => payload.id === root ? [{ id: child }] : []),
        };

        await expect(expandDisappearingIds(client as never, 'block', 'delete', [root]))
            .resolves.toEqual([child, root].sort());
    });

    it('expands document deletion targets to descendant documents and body blocks', async () => {
        const root = '20260822000000-root001';
        const child = '20260822000000-child01';
        const body = '20260822000000-body001';
        const client = {
            requestRead: vi.fn(async (_endpoint: string, payload: { stmt: string }) => payload.stmt.includes("type = 'd'")
                ? [{ id: root }, { id: child }]
                : [{ id: root }, { id: child }, { id: body }]),
        };

        await expect(expandDisappearingIds(client as never, 'document', 'remove', [root]))
            .resolves.toEqual([body, child, root].sort());
    });

    it('deduplicates external refs and excludes refs inside the deletion set', async () => {
        const client = {
            requestRead: vi.fn(async (_endpoint: string, payload: { stmt: string }) => {
                if (payload.stmt.includes('FROM refs')) {
                    return [
                        { def_block_id: 'target-1', block_id: 'source-1', root_id: 'doc-1', box: 'nb-1', hpath: '/Visible', content: '引用内容', markdown: '((target-1))', type: 'backlink' },
                        { def_block_id: 'target-1', block_id: 'source-1', root_id: 'doc-1', box: 'nb-1', hpath: '/Visible', content: '引用内容', markdown: '((target-1))', type: 'backlink' },
                        { def_block_id: 'target-1', block_id: 'target-2', root_id: 'target-2', box: 'nb-1', hpath: '/Deleting', content: '内部引用', markdown: '((target-1))', type: 'backlink' },
                    ];
                }
                return [];
            }),
        };
        const permMgr = { canRead: vi.fn(() => true) };

        const result = await inspectReferenceImpact(client as never, permMgr as never, ['target-1', 'target-2']);

        expect(result.externalReferenceCount).toBe(1);
        expect(result.referencedTargetIds).toEqual(['target-1']);
        expect(result.visibleReferences).toEqual([
            expect.objectContaining({ targetId: 'target-1', sourceBlockId: 'source-1', sourceDocumentId: 'doc-1' }),
        ]);
    });

    it('reports protected sources only as aggregate counts', async () => {
        const client = {
            requestRead: vi.fn(async (_endpoint: string, payload: { stmt: string }) => payload.stmt.includes('FROM refs')
                ? [
                    { def_block_id: 'target-1', block_id: 'visible-source', root_id: 'visible-doc', box: 'visible-nb', hpath: '/Visible', content: '可见', markdown: '((target-1))', type: 'backlink' },
                    { def_block_id: 'target-1', block_id: 'hidden-source', root_id: 'hidden-doc', box: 'hidden-nb', hpath: '/Hidden', content: '秘密', markdown: '((target-1))', type: 'backlink' },
                ]
                : []),
        };
        const permMgr = { canRead: vi.fn((box: string) => box !== 'hidden-nb') };

        const result = await inspectReferenceImpact(client as never, permMgr as never, ['target-1']);

        expect(result.visibleReferences).toHaveLength(1);
        expect(JSON.stringify(result.visibleReferences)).not.toContain('秘密');
        expect(result.protectedReferenceCount).toBe(1);
        expect(result.protectedDocumentCount).toBe(1);
    });

    it('detects siyuan block links from spans', async () => {
        const client = {
            requestRead: vi.fn(async (_endpoint: string, payload: { stmt: string }) => {
                if (payload.stmt.includes('FROM spans')) {
                    return [{ block_id: 'source-1', root_id: 'doc-1', box: 'nb-1', hpath: '/Doc', span_markdown: '[目标](siyuan://blocks/target-1)', content: '链接', markdown: '[目标](siyuan://blocks/target-1)' }];
                }
                return [];
            }),
        };
        const permMgr = { canRead: vi.fn(() => true) };

        const result = await inspectReferenceImpact(client as never, permMgr as never, ['target-1']);

        expect(result.visibleReferences).toEqual([
            expect.objectContaining({ targetId: 'target-1', sourceBlockId: 'source-1', referenceType: 'block-link' }),
        ]);
        expect(result.referenceHash).toMatch(/^sha256:v1:[a-f0-9]{64}$/);
    });
});

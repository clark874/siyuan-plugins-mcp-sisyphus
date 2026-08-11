import { describe, expect, it } from 'vitest';

import {
    buildRecentDocumentsPageSql,
    collectRecentDocumentGroupKeys,
    filterRecentDocuments,
    formatRecentDocumentTime,
    groupRecentDocuments,
    mapRecentDocumentRows,
    mergeCollapsedGroupState,
} from '@/ui/recent-documents/recent-documents';

describe('recent documents view model', () => {
    it('maps paginated SQL rows into document cards without losing ordering', () => {
        const documents = mapRecentDocumentRows([
            {
                id: '20260810183622-w2qieo2',
                box: '20210823223507-wob4nnc',
                hpath: '/研究方法/Scattertext/Scattertext 中枢',
                path: '/folder/20260810183622-w2qieo2.sy',
                content: 'Scattertext 中枢',
                ial: '{: icon="1f4ca"}',
                updated: '20260811142243',
            },
            {
                id: '20260810114539-nt94kh3',
                box: '20210823223507-wob4nnc',
                hpath: '/研究方法/Scattertext',
                path: '/20260810114539-nt94kh3.sy',
                content: 'Scattertext',
                updated: '20260810114539',
            },
        ]);

        expect(documents.map((item) => item.id)).toEqual([
            '20260810183622-w2qieo2',
            '20260810114539-nt94kh3',
        ]);
        expect(documents[0]).toMatchObject({
            title: 'Scattertext 中枢',
            icon: '1f4ca',
            notebook: '20210823223507-wob4nnc',
            hPath: '/研究方法/Scattertext/Scattertext 中枢',
            parentPath: '/研究方法/Scattertext',
            storagePath: '/folder/20260810183622-w2qieo2.sy',
            updated: '20260811142243',
        });
    });

    it('builds a bounded deterministic SQL page instead of the fixed recent-documents endpoint', () => {
        expect(buildRecentDocumentsPageSql(1, 100)).toContain('LIMIT 100 OFFSET 0');
        expect(buildRecentDocumentsPageSql(3, 100)).toContain('LIMIT 100 OFFSET 200');
        expect(buildRecentDocumentsPageSql(-3, 9999)).toContain('LIMIT 200 OFFSET 0');
        expect(buildRecentDocumentsPageSql(1, 100)).toContain("WHERE type = 'd'");
        expect(buildRecentDocumentsPageSql(1, 100)).toContain('ORDER BY updated DESC, id DESC');
    });

    it('formats SiYuan second timestamps without relying on Date string parsing', () => {
        expect(formatRecentDocumentTime('20260811142243', 'zh-CN')).toContain('2026');
        expect(formatRecentDocumentTime('invalid', 'zh-CN')).toBe('');
    });

    it('builds a year-month-day hierarchy and supports month/year granularity', () => {
        const groups = groupRecentDocuments([
            recentView('today', '20260811153000'),
            recentView('yesterday', '20260810120000'),
            recentView('week', '20260807120000'),
            recentView('month', '20260801120000'),
            recentView('older', '20260731120000'),
        ], {
            now: new Date(2026, 7, 11, 20, 0, 0),
            locale: 'zh-CN',
            todayLabel: '今天',
            yesterdayLabel: '昨天',
            granularity: 'day',
        });

        expect(groups).toHaveLength(1);
        expect(groups[0]).toMatchObject({ key: 'year:2026', level: 'year', documentCount: 5 });
        expect(groups[0].children.map((group) => group.key)).toEqual(['month:2026-08', 'month:2026-07']);
        expect(groups[0].children[0].children.map((group) => group.key)).toEqual([
            'day:2026-08-11',
            'day:2026-08-10',
            'day:2026-08-07',
            'day:2026-08-01',
        ]);
        expect(groups[0].children[0].children[0].label).toBe('今天');
        expect(groupRecentDocuments([recentView('today', '20260811153000')], {
            now: new Date(2026, 7, 11),
            granularity: 'year',
        })[0].documents).toHaveLength(1);
    });

    it('preserves existing collapse choices while initializing only new groups', () => {
        const groups = groupRecentDocuments([
            recentView('today', '20260811153000'),
            recentView('older', '20250731120000'),
        ], { now: new Date(2026, 7, 11), granularity: 'day' });
        const keys = collectRecentDocumentGroupKeys(groups);
        const next = mergeCollapsedGroupState(new Set(['year:2026']), groups, new Set(['year:2026']));

        expect(keys).toContain('year:2025');
        expect(next.has('year:2026')).toBe(true);
        expect(next.has('year:2025')).toBe(true);
    });

    it('filters known content, structure and insufficient-history states without guessing unknown cards', () => {
        const documents = [
            recentView('content', '20260811153000'),
            recentView('path', '20260811152000'),
            recentView('same', '20260811151000'),
            recentView('unknown', '20260811150000'),
        ];
        const summaries = {
            [documents[0].id]: summary('content_changed', documents[0].updated),
            [documents[1].id]: summary('title_changed', documents[1].updated),
            [documents[2].id]: summary('same_content_checkpoint', documents[2].updated),
            [documents[3].id]: summary('content_changed', '20260810120000'),
        };

        expect(filterRecentDocuments(documents, summaries, 'content').map((item) => item.title)).toEqual(['content']);
        expect(filterRecentDocuments(documents, summaries, 'structure').map((item) => item.title)).toEqual(['path']);
        expect(filterRecentDocuments(documents, summaries, 'insufficient').map((item) => item.title)).toEqual(['same']);
        expect(filterRecentDocuments(documents, summaries, 'all')).toHaveLength(4);
    });
});

function recentView(title: string, updated: string) {
    const suffix = Array.from(title).reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 0).toString(36).padStart(7, '0').slice(-7);
    return {
        id: `20260811120000-${suffix}`,
        title,
        icon: '',
        notebook: 'nb-1',
        hPath: `/${title}`,
        parentPath: '',
        storagePath: `/${title}.sy`,
        updated,
    };
}

function summary(status: 'content_changed' | 'title_changed' | 'same_content_checkpoint', documentUpdated: string) {
    return {
        status,
        changedBlocks: status === 'content_changed' ? 1 : 0,
        addedLines: status === 'content_changed' ? 1 : 0,
        removedLines: 0,
        baselineCreated: '',
        documentUpdated,
    };
}

import { describe, expect, it } from 'vitest';

import {
    buildRecentDocumentMetadataSql,
    formatRecentDocumentTime,
    mergeRecentDocumentMetadata,
} from '@/ui/recent-documents/recent-documents';

describe('recent documents view model', () => {
    it('preserves kernel ordering while enriching paths and update times', () => {
        const documents = mergeRecentDocumentMetadata([
            { rootID: '20260810183622-w2qieo2', title: 'Scattertext 中枢', icon: '1f4ca' },
            { rootID: '20260810114539-nt94kh3', title: 'Scattertext' },
        ], [
            {
                id: '20260810114539-nt94kh3',
                box: '20210823223507-wob4nnc',
                hpath: '/研究方法/Scattertext',
                updated: '20260810114539',
            },
            {
                id: '20260810183622-w2qieo2',
                box: '20210823223507-wob4nnc',
                hpath: '/研究方法/Scattertext/Scattertext 中枢',
                updated: '20260811142243',
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
            updated: '20260811142243',
        });
    });

    it('keeps documents when metadata lookup is unavailable', () => {
        expect(mergeRecentDocumentMetadata([
            { rootID: '20260810183622-w2qieo2', title: 'Scattertext 中枢' },
        ], [])).toEqual([{
            id: '20260810183622-w2qieo2',
            title: 'Scattertext 中枢',
            icon: '',
            notebook: '',
            hPath: '',
            parentPath: '',
            updated: '',
        }]);
    });

    it('builds a bounded SQL query from valid SiYuan document IDs only', () => {
        const sql = buildRecentDocumentMetadataSql([
            '20260810183622-w2qieo2',
            "bad-id') OR 1=1 --",
            '20260810114539-nt94kh3',
        ]);

        expect(sql).toContain("id IN ('20260810183622-w2qieo2', '20260810114539-nt94kh3')");
        expect(sql).not.toContain('OR 1=1');
        expect(sql).toContain("type = 'd'");
    });

    it('formats SiYuan second timestamps without relying on Date string parsing', () => {
        expect(formatRecentDocumentTime('20260811142243', 'zh-CN')).toContain('2026');
        expect(formatRecentDocumentTime('invalid', 'zh-CN')).toBe('');
    });
});

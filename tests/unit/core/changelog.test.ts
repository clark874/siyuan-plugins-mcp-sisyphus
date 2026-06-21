import { describe, expect, it } from 'vitest';

import { buildChangelogResponse, parseChangelog, renderChangelogResource } from '@/core/changelog';

describe('changelog helpers', () => {
    it('parses release headings and bullet items', () => {
        const entries = parseChangelog([
            '# 更新日志',
            '',
            '## v0.4.9 - 2026-05-24',
            '',
            '- 新增虚拟 `/AGENTS.md` Agent 记忆入口',
            '- CLI 包同步提升',
            '',
            '## v0.4.8 - 2026-05-20',
            '',
            '- 猫猫显示支持自定义配色',
        ].join('\n'));

        expect(entries).toHaveLength(2);
        expect(entries[0]).toEqual(expect.objectContaining({
            version: '0.4.9',
            date: '2026-05-24',
            items: ['新增虚拟 `/AGENTS.md` Agent 记忆入口', 'CLI 包同步提升'],
        }));
        expect(entries[0].personalizationImpact).toEqual(expect.objectContaining({
            mayAffectPersonalization: true,
            areas: expect.arrayContaining(['agent-memory']),
        }));
    });

    it('filters entries newer than a previous version', () => {
        const response = buildChangelogResponse({ fromVersion: '0.4.8', limit: 10 });

        expect(response.entries.length).toBeGreaterThan(0);
        expect(response.entries.every((entry) => entry.version !== '0.4.8')).toBe(true);
        expect(response.query.fromVersion).toBe('0.4.8');
        expect(response.personalizationReview.hints.join('\n')).toContain('/AGENTS.md');
    });

    it('renders the raw changelog resource with upgrade-review guidance', () => {
        const markdown = renderChangelogResource();

        expect(markdown).toContain('# 更新日志');
        expect(markdown).toContain('AI upgrade review workflow');
        expect(markdown).toContain('system(action="changelog"');
    });
});

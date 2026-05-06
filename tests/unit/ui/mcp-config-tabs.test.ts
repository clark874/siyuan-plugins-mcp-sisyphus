import { describe, expect, it } from 'vitest';

import {
    CATEGORY_TAB_DEFS,
    HTTP_GROUP_KEY,
    ICON_SVGS,
    PERM_GROUP_KEY,
    PUPPY_GROUP_KEY,
    ANALYTICS_GROUP_KEY,
    USER_RULES_GROUP_KEY,
} from '@/ui/setting/mcp-config-tabs';

describe('mcp-config-tabs icon system', () => {
    it('has all 14 required icon keys', () => {
        const requiredKeys = [
            'globe',
            'lock',
            'book',
            'fileText',
            'layout',
            'database',
            'folder',
            'search',
            'tagIcon',
            'monitor',
            'layers',
            'paw',
            'barChart',
            'compass',
        ];
        for (const key of requiredKeys) {
            expect(ICON_SVGS).toHaveProperty(key);
        }
    });

    it('has 10 category tab definitions', () => {
        expect(CATEGORY_TAB_DEFS).toHaveLength(10);
    });

    it('maps every category to an existing icon key', () => {
        for (const def of CATEGORY_TAB_DEFS) {
            expect(ICON_SVGS).toHaveProperty(def.iconKey);
        }
    });

    it('renders valid svg strings for every icon', () => {
        for (const [key, svg] of Object.entries(ICON_SVGS)) {
            expect(svg, `icon ${key} should contain <svg`).toContain('<svg');
            expect(svg, `icon ${key} should contain </svg>`).toContain('</svg>');
        }
    });

    it('keeps stable group key constants', () => {
        expect(HTTP_GROUP_KEY).toBe('Connection Config');
        expect(PERM_GROUP_KEY).toBe('Permissions');
        expect(PUPPY_GROUP_KEY).toBe('Mascot');
        expect(ANALYTICS_GROUP_KEY).toBe('analyticsGroupTitle');
        expect(USER_RULES_GROUP_KEY).toBe('User Rules');
    });

    it('covers all 10 tool categories', () => {
        const categories = CATEGORY_TAB_DEFS.map((d) => d.category);
        expect(categories).toEqual([
            'fs',
            'notebook',
            'document',
            'block',
            'av',
            'file',
            'search',
            'tag',
            'system',
            'flashcard',
        ]);
    });
});

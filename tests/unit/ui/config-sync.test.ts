import { describe, expect, it } from 'vitest';

import * as mcpConfig from '@/core/config';
import * as settingConfig from '@/ui/setting/tool-config';

describe('setting and mcp config stay behaviorally aligned', () => {
    it('keeps defaults aligned', () => {
        expect(settingConfig.buildDefaultToolConfig()).toEqual(mcpConfig.buildDefaultToolConfig());
    });

    it('keeps exported action metadata aligned', () => {
        expect(settingConfig.TOOL_CATEGORIES).toEqual(mcpConfig.TOOL_CATEGORIES);
        expect(settingConfig.NOTEBOOK_ACTIONS).toEqual(mcpConfig.NOTEBOOK_ACTIONS);
        expect(settingConfig.DOCUMENT_ACTIONS).toEqual(mcpConfig.DOCUMENT_ACTIONS);
        expect(settingConfig.BLOCK_ACTIONS).toEqual(mcpConfig.BLOCK_ACTIONS);
        expect(settingConfig.AV_ACTIONS).toEqual(mcpConfig.AV_ACTIONS);
        expect(settingConfig.FILE_ACTIONS).toEqual(mcpConfig.FILE_ACTIONS);
        expect(settingConfig.SEARCH_ACTIONS).toEqual(mcpConfig.SEARCH_ACTIONS);
        expect(settingConfig.TAG_ACTIONS).toEqual(mcpConfig.TAG_ACTIONS);
        expect(settingConfig.SYSTEM_ACTIONS).toEqual(mcpConfig.SYSTEM_ACTIONS);
        expect(settingConfig.FLASHCARD_ACTIONS).toEqual(mcpConfig.FLASHCARD_ACTIONS);
        expect(settingConfig.MASCOT_ACTIONS).toEqual(mcpConfig.MASCOT_ACTIONS);
        expect(settingConfig.LEGACY_TOOL_TO_ACTION).toEqual(mcpConfig.LEGACY_TOOL_TO_ACTION);
    });

    it('keeps normalization aligned for nested and legacy shapes', () => {
        const samples: unknown[] = [
            undefined,
            {
                userRulesText: 'Always set icons.',
                file: {
                    enabled: true,
                    uploadLargeFileThresholdMB: 27.7,
                    actions: {
                        upload_asset: false,
                        render_template: true,
                    },
                },
                flashcard: {
                    enabled: true,
                    actions: {
                        remove_card: false,
                    },
                },
            },
            {
                notebook: ['list', 'rename'],
                file: ['upload_asset', 'render_sprig'],
                remove_document: true,
                find_replace: false,
            },
            {
                create_document: true,
                rename_tag: true,
                remove_tag: false,
            },
        ];

        for (const sample of samples) {
            expect(settingConfig.normalizeToolConfig(sample)).toEqual(mcpConfig.normalizeToolConfig(sample));
        }
    });

    it('keeps danger detection aligned', () => {
        for (const category of settingConfig.TOOL_CATEGORIES) {
            for (const action of settingConfig.ACTIONS_BY_CATEGORY[category]) {
                expect(settingConfig.isDangerousAction(category, action)).toBe(
                    mcpConfig.isDangerousAction(category, action),
                );
            }
        }
    });
});

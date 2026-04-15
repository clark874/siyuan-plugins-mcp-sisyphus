import { describe, expect, it } from 'vitest';

import * as mcpConfig from '@/mcp/config';
import * as settingConfig from '@/setting/tool-config';

describe('setting/mcp config sync', () => {
    it('keeps tool categories in sync', () => {
        expect(settingConfig.TOOL_CATEGORIES).toEqual(mcpConfig.TOOL_CATEGORIES);
    });

    it('keeps action lists in sync', () => {
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
    });
});

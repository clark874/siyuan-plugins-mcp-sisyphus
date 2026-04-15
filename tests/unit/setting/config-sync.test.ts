import { describe, expect, it } from 'vitest';

import * as mcpConfig from '@/mcp/config';
import * as settingConfig from '@/setting/tool-config';

// Guard: setting/tool-config.ts must stay a pure re-export of mcp/config.
// If anyone re-forks it into an independent copy, the legacy maps, defaults
// and normalize logic will silently drift (as they did historically).
// These tests use reference equality to catch a fork at its first commit.
describe('setting/mcp config share a single source of truth', () => {
    it('exports the same functions by reference', () => {
        expect(settingConfig.buildDefaultToolConfig).toBe(mcpConfig.buildDefaultToolConfig);
        expect(settingConfig.normalizeToolConfig).toBe(mcpConfig.normalizeToolConfig);
        expect(settingConfig.isDangerousAction).toBe(mcpConfig.isDangerousAction);
    });

    it('exports the same constants by reference', () => {
        expect(settingConfig.TOOL_CATEGORIES).toBe(mcpConfig.TOOL_CATEGORIES);
        expect(settingConfig.NOTEBOOK_ACTIONS).toBe(mcpConfig.NOTEBOOK_ACTIONS);
        expect(settingConfig.DOCUMENT_ACTIONS).toBe(mcpConfig.DOCUMENT_ACTIONS);
        expect(settingConfig.BLOCK_ACTIONS).toBe(mcpConfig.BLOCK_ACTIONS);
        expect(settingConfig.AV_ACTIONS).toBe(mcpConfig.AV_ACTIONS);
        expect(settingConfig.FILE_ACTIONS).toBe(mcpConfig.FILE_ACTIONS);
        expect(settingConfig.SEARCH_ACTIONS).toBe(mcpConfig.SEARCH_ACTIONS);
        expect(settingConfig.TAG_ACTIONS).toBe(mcpConfig.TAG_ACTIONS);
        expect(settingConfig.SYSTEM_ACTIONS).toBe(mcpConfig.SYSTEM_ACTIONS);
        expect(settingConfig.FLASHCARD_ACTIONS).toBe(mcpConfig.FLASHCARD_ACTIONS);
        expect(settingConfig.MASCOT_ACTIONS).toBe(mcpConfig.MASCOT_ACTIONS);
        expect(settingConfig.LEGACY_TOOL_TO_ACTION).toBe(mcpConfig.LEGACY_TOOL_TO_ACTION);
    });
});

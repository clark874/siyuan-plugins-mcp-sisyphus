import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as mcpConfig from '@/core/config';
import * as settingConfig from '@/ui/setting/tool-config';
import {
    DEFAULT_PUPPY_APPEARANCE,
    buildDefaultVersionControlSettings,
    normalizePuppySettings,
    normalizeVersionControlSettings,
} from '@/ui/setting/tool-config-storage';

describe('setting and mcp config stay behaviorally aligned', () => {
    it('re-exports the mcp config helpers directly', () => {
        expect(settingConfig.buildDefaultToolConfig).toBe(mcpConfig.buildDefaultToolConfig);
        expect(settingConfig.normalizeToolConfig).toBe(mcpConfig.normalizeToolConfig);
        expect(settingConfig.isDangerousAction).toBe(mcpConfig.isDangerousAction);
    });

    it('keeps defaults aligned', () => {
        expect(settingConfig.buildDefaultToolConfig()).toEqual(mcpConfig.buildDefaultToolConfig());
    });

    it('keeps exported action metadata aligned', () => {
        expect(settingConfig.TOOL_CATEGORIES).toEqual(mcpConfig.TOOL_CATEGORIES);
        expect(settingConfig.FS_ACTIONS).toEqual(mcpConfig.FS_ACTIONS);
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
        expect(settingConfig.FEEDBACK_ACTIONS).toEqual(mcpConfig.FEEDBACK_ACTIONS);
    });

    it('keeps normalization aligned for nested shapes', () => {
        const samples: unknown[] = [
            undefined,
            {
                userRulesText: 'Always set icons.',
                file: {
                    enabled: true,
                    uploadLargeFileThresholdMB: 27.7,
                    actions: {
                        upload_asset: false,
                        render: true,
                    },
                },
                flashcard: {
                    enabled: true,
                    actions: {
                        remove_card: false,
                    },
                },
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

    it('lists block replace in the settings panel', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config/ToolCategoriesPanel.svelte'), 'utf8');

        expect(source).toContain('ACTIONS_BY_CATEGORY');
        expect(source).toContain('buildCompleteGroupDefinitions');
        expect(source).toContain('category: "block"');
        expect(source).toContain('key: "replace"');
        expect(source).toContain('Replace Block Text');
        expect(source).toContain('category: "mascot"');
        expect(source).toContain('category: "feedback"');
    });

    it('keeps tool categories grouped under one settings page', () => {
        const panelSource = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config/ToolCategoriesPanel.svelte'), 'utf8');
        const rootSource = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config.svelte'), 'utf8');

        expect(rootSource).toContain('{ id: TOOL_GROUP_KEY, label: toolGroupLabel, iconSvg: ICON_SVGS.folder }');
        expect(rootSource).not.toContain('...CATEGORY_TAB_DEFS.map');
        expect(panelSource).toContain('tool-settings-accordion');
        expect(panelSource).toContain('tool-settings-group__header');
        expect(panelSource).toContain('dispatchToolToggle');
        expect(panelSource).toContain('SettingPanel');
    });

    it('uses stable tab keys to display the analytics panel', () => {
        const panelSource = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config/TelemetryPanel.svelte'), 'utf8');
        const rootSource = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config.svelte'), 'utf8');

        expect(rootSource).toContain('analyticsDisplay={focusGroup === ANALYTICS_GROUP_KEY}');
        expect(rootSource).toContain('display={focusGroup === FEEDBACK_GROUP_KEY}');
        expect(panelSource).toContain('export let analyticsDisplay = true;');
        expect(panelSource).toContain('display={analyticsDisplay}');
        expect(panelSource).not.toContain('display={focusGroup === analyticsGroup}');
    });

    it('keeps accordion state reactive when categories are toggled', () => {
        const panelSource = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config/ToolCategoriesPanel.svelte'), 'utf8');

        expect(panelSource).toContain('openCategories;');
        expect(panelSource).toContain('groupDefinitions = GROUP_DEFINITIONS.map');
    });

    it('keeps notebook permission rows reactive after notebooks load', () => {
        const panelSource = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config/PermissionsPanel.svelte'), 'utf8');
        const rootSource = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config.svelte'), 'utf8');

        expect(rootSource).toContain('closed: Boolean(nb.closed)');
        expect(panelSource).toContain('notebooks;');
        expect(panelSource).toContain('permissions;');
        expect(panelSource).toContain('permLoading;');
        expect(panelSource).toContain('permItems = buildPermItems();');
        expect(panelSource).toContain('closedPermItems = buildClosedPermItems();');
        expect(panelSource).toContain('mcpPermClosedGroup');
        expect(panelSource).not.toContain('mcpPermClosedHint');
    });

    it('keeps mascot tool settings out of the mascot display panel', () => {
        const puppySource = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config/PuppyPanel.svelte'), 'utf8');
        const panelSource = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config/ToolCategoriesPanel.svelte'), 'utf8');

        expect(puppySource).not.toContain('mascot__enabled');
        expect(puppySource).not.toContain('mascot__action__');
        expect(panelSource).toContain('category: "mascot"');
        expect(panelSource).toContain('groupKey: "Mascot Tool"');
    });

    it('keeps feedback form separate from tool toggles', () => {
        const feedbackSource = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config/FeedbackPanel.svelte'), 'utf8');
        const panelSource = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config/ToolCategoriesPanel.svelte'), 'utf8');

        expect(feedbackSource).toContain('submitFeedback');
        expect(feedbackSource).toContain('feedback_description_label');
        expect(feedbackSource).toContain('feedback_impact_label');
        expect(feedbackSource).toContain('feedback_suggestion_label');
        expect(feedbackSource).not.toContain('feedback_agent_label');
        expect(feedbackSource).not.toContain('bind:value={agent}');
        expect(panelSource).toContain('groupKey: "Feedback Tool"');
        expect(panelSource).toContain('key: "submit"');
    });

    it('keeps user custom rules editable while preserving deferred save behavior', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config/UserRulesPanel.svelte'), 'utf8');

        expect(source).not.toContain('$: userRulesText = config.userRulesText');
        expect(source).toContain('hasDraftChanges');
        expect(source).toContain('agentSiyuanMemoryText');
        expect(source).toContain('AGENT_MEMORY_KEY = "agentSiyuanMemoryText"');
        expect(source).toContain('agent_memory_title');
        expect(source).toContain('on:input={markDraftChanged}');
        expect(source).toContain('on:input={markAgentMemoryDraftChanged}');
        expect(source).toContain('on:blur={dispatchChanged}');
        expect(source).toContain('on:blur={dispatchAgentMemoryChanged}');
        expect(source).toContain('lastSyncedUserRulesText = userRulesText');
        expect(source).toContain('lastSyncedAgentSiyuanMemoryText = agentSiyuanMemoryText');
    });

    it('persists agent memory through the same instruction refresh path as user rules', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config.svelte'), 'utf8');

        expect(source).toContain('key === "userRulesText" || key === "agentSiyuanMemoryText"');
        expect(source).toContain('agentSiyuanMemoryUpdatedAt');
        expect(source).toContain('refreshHttpServerAfterInstructionConfigChange');
        expect(source).toContain('refreshHttpServerAfterUserRulesChange');
    });

    it('keeps mascot display appearance settings in the mascot display panel', () => {
        const puppySource = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config/PuppyPanel.svelte'), 'utf8');
        const rootSource = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config.svelte'), 'utf8');
        const formSource = readFileSync(resolve(process.cwd(), 'src/ui/shared/Form/form-input.svelte'), 'utf8');

        expect(puppySource).toContain('puppy__appearance__randomize');
        expect(puppySource).toContain('puppy__appearance__reset');
        expect(puppySource).toContain('puppy__appearance__bodyColor');
        expect(puppySource).toContain('puppy__appearance__pawColor');
        expect(puppySource).toContain('puppy__appearance__eyeColor');
        expect(puppySource).toContain('value={puppySettings.appearance.bodyColor}');
        expect(puppySource).toContain('on:input={(event) => emitColor("bodyColor", event)}');
        expect(rootSource).toContain('buildRandomPuppyAppearance');
        expect(rootSource).toContain('buildDefaultPuppyAppearance');
        expect(rootSource).toContain('key.startsWith("puppy__appearance__")');
        expect(formSource).toContain('type === "color"');
    });

    it('keeps document timeline enable switch in debug settings', () => {
        const debugSource = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config/DebugPanel.svelte'), 'utf8');
        const rootSource = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config.svelte'), 'utf8');

        expect(debugSource).toContain('versionControl__enabled');
        expect(debugSource).toContain('version_control_enabled_title');
        expect(debugSource).toContain('buildDebugItems(config, puppySettings, versionControlSettings, getLabel)');
        expect(rootSource).toContain('key === "versionControl__enabled"');
    });

    it('rebuilds persisted settings panels from explicit Svelte reactive dependencies', () => {
        const debugSource = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config/DebugPanel.svelte'), 'utf8');
        const puppySource = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config/PuppyPanel.svelte'), 'utf8');
        const telemetrySource = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config/TelemetryPanel.svelte'), 'utf8');
        const permissionsSource = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config/PermissionsPanel.svelte'), 'utf8');

        expect(debugSource).toContain('buildDebugItems(config, puppySettings, versionControlSettings, getLabel)');
        expect(debugSource).not.toContain('$: debugItems = buildDebugItems();');
        expect(puppySource).toContain('buildPuppyItems(puppySettings, getLabel)');
        expect(puppySource).not.toContain('$: puppyItems = buildPuppyItems();');
        expect(telemetrySource).toContain('buildTelemetryItems(telemetryConfig, getLabel)');
        expect(telemetrySource).not.toContain('$: telemetryItems = buildTelemetryItems();');
        expect(permissionsSource).toContain('permItems = buildPermItems();');
    });

    it('handles non-tool enabled toggles before generic category toggles', () => {
        const rootSource = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config.svelte'), 'utf8');
        const genericEnabledIndex = rootSource.indexOf('key.endsWith("__enabled")');

        expect(rootSource.indexOf('key === "versionControl__enabled"')).toBeGreaterThanOrEqual(0);
        expect(rootSource.indexOf('key === "telemetry__enabled"')).toBeGreaterThanOrEqual(0);
        expect(rootSource.indexOf('key === "versionControl__enabled"')).toBeLessThan(genericEnabledIndex);
        expect(rootSource.indexOf('key === "telemetry__enabled"')).toBeLessThan(genericEnabledIndex);
    });

    it('saves independent debug-related setting stores from the settings dialog save hook', () => {
        const rootSource = readFileSync(resolve(process.cwd(), 'src/ui/setting/mcp-config.svelte'), 'utf8');
        const saveSettingsIndex = rootSource.indexOf('export async function saveSettings()');

        expect(saveSettingsIndex).toBeGreaterThanOrEqual(0);
        expect(rootSource.indexOf('await persistPuppySettings();', saveSettingsIndex)).toBeGreaterThan(saveSettingsIndex);
        expect(rootSource.indexOf('await persistTelemetryConfig();', saveSettingsIndex)).toBeGreaterThan(saveSettingsIndex);
        expect(rootSource.indexOf('await persistVersionControlSettings();', saveSettingsIndex)).toBeGreaterThan(saveSettingsIndex);
        expect(rootSource.indexOf('await persistConfig();', saveSettingsIndex)).toBeGreaterThan(saveSettingsIndex);
    });

    it('dispatches checkbox changes from DOM checked state', () => {
        const formSource = readFileSync(resolve(process.cwd(), 'src/ui/shared/Form/form-input.svelte'), 'utf8');

        expect(formSource).toContain('event.currentTarget');
        expect(formSource).toContain('target.checked');
        expect(formSource).toContain('target.type === "checkbox"');
        expect(formSource).toContain('dispatch("changed", { key: key, value: nextValue })');
    });

    it('keeps mascot appearance defaults shared across settings and runtime display', () => {
        const toolPuppySource = readFileSync(resolve(process.cwd(), 'src/ui/components/ToolPuppy.svelte'), 'utf8');
        const awakeSvgSource = readFileSync(resolve(process.cwd(), 'src/ui/components/PuppyAwakeSVG.svelte'), 'utf8');

        expect(toolPuppySource).toContain('buildDefaultPuppyAppearance');
        expect(toolPuppySource).toContain('appearance: PuppyAppearanceSettings = buildDefaultPuppyAppearance()');
        expect(awakeSvgSource).toContain(`var(--sy-puppy-body-color, ${DEFAULT_PUPPY_APPEARANCE.bodyColor})`);
        expect(awakeSvgSource).toContain(`var(--sy-puppy-paw-color, ${DEFAULT_PUPPY_APPEARANCE.pawColor})`);
        expect(awakeSvgSource).toContain(`var(--sy-puppy-eye-color, ${DEFAULT_PUPPY_APPEARANCE.eyeColor})`);
    });

    it('normalizes mascot appearance colors and preserves legacy settings', () => {
        expect(normalizePuppySettings({ visible: false })).toMatchObject({
            visible: false,
            appearance: DEFAULT_PUPPY_APPEARANCE,
        });

        expect(normalizePuppySettings({
            appearance: {
                bodyColor: '#ABCDEF',
                pawColor: 'not-a-color',
                eyeColor: '#123456',
            },
        }).appearance).toEqual({
            bodyColor: '#abcdef',
            pawColor: DEFAULT_PUPPY_APPEARANCE.pawColor,
            eyeColor: '#123456',
        });
    });

    it('normalizes document timeline settings while preserving legacy debug-only settings', () => {
        expect(buildDefaultVersionControlSettings()).toEqual({
            enabled: true,
            showDebugMeta: false,
        });
        expect(normalizeVersionControlSettings({ showDebugMeta: true })).toEqual({
            enabled: true,
            showDebugMeta: true,
        });
        expect(normalizeVersionControlSettings({ enabled: false, showDebugMeta: true })).toEqual({
            enabled: false,
            showDebugMeta: true,
        });
    });
});

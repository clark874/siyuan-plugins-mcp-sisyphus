<script lang="ts">
    import SettingPanel from "../../shared/setting-panel.svelte";
    import type { ToolConfig } from "../tool-config";
    import type { PuppySettings, VersionControlSettings } from "../tool-config-storage";

    export let group: string;
    export let display = false;
    export let config: ToolConfig;
    export let puppySettings: PuppySettings;
    export let versionControlSettings: VersionControlSettings;
    export let getLabel: (key: string, fallback: string) => string;
    export let onChanged: (event: CustomEvent<ChangeEvent>) => void | Promise<void>;

    interface ChangeEvent { key: string; value: any; }

    function buildDebugItems(
        currentConfig: ToolConfig,
        currentPuppySettings: PuppySettings,
        currentVersionControlSettings: VersionControlSettings,
        label: (key: string, fallback: string) => string,
    ): ISettingItem[] {
        return [
            {
                type: "checkbox",
                key: "versionControl__enabled",
                value: currentVersionControlSettings.enabled,
                title: label("version_control_enabled_title", "Enable Document Timeline"),
                description: label("version_control_enabled_desc", "Register the document timeline dock, command, and editor listeners. Turn this off to remove the dock and stop loading the timeline UI."),
            },
            {
                type: "checkbox",
                key: "debug__slimResponses",
                value: currentConfig.debug.slimResponses,
                title: label("debug_slimResponses_title", "Slim Responses"),
                description: label("debug_slimResponses_desc", "Return only the data an agent usually needs. Turn this off to inspect full debug fields, pagination internals, UI refresh metadata, and raw helper metadata."),
            },
            {
                type: "checkbox",
                key: "versionControl__showDebugMeta",
                value: currentVersionControlSettings.showDebugMeta,
                title: label("version_control_show_debug_meta_title", "Timeline Debug Metadata"),
                description: label("version_control_show_debug_meta_desc", "Show document/block IDs and raw diff statuses such as unchanged in the document timeline."),
            },
            {
                type: "checkbox",
                key: "puppy__testModeEnabled",
                value: currentPuppySettings.testModeEnabled,
                title: label("puppy_testMode_title", "Random Mascot Test"),
                description: label("puppy_testMode_desc", "Randomly cycle real MCP actions for animation testing without calling tools."),
                layout: "inline",
                children: [
                    ...(currentPuppySettings.testModeEnabled
                        ? [{
                            type: "number" as const,
                            key: "puppy__testModeIntervalMs",
                            value: currentPuppySettings.testModeIntervalMs,
                            title: label("puppy_testMode_interval_title", "Interval"),
                            description: label("puppy_testMode_interval_desc", "Delay between random test actions."),
                            inputCompact: true,
                            unit: "ms",
                        }]
                        : []),
                ],
            },
        ];
    }

    $: debugItems = buildDebugItems(config, puppySettings, versionControlSettings, getLabel);
</script>

<SettingPanel {group} settingItems={debugItems} {display} on:changed={onChanged} />

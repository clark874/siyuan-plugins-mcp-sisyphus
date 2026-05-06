<script lang="ts">
    import SettingPanel from "../../shared/setting-panel.svelte";
    import type { ToolConfig } from "../tool-config";
    import type { PuppySettings } from "../tool-config-storage";

    export let group: string;
    export let display = false;
    export let config: ToolConfig;
    export let puppySettings: PuppySettings;
    export let getLabel: (key: string, fallback: string) => string;
    export let onChanged: (event: CustomEvent<ChangeEvent>) => void | Promise<void>;

    interface ChangeEvent { key: string; value: any; }

    function buildDebugItems(): ISettingItem[] {
        return [
            {
                type: "checkbox",
                key: "debug__includeUiRefreshMetadata",
                value: config.debug.includeUiRefreshMetadata,
                title: getLabel("debug_includeUiRefreshMetadata_title", "Show UI Refresh Metadata"),
                description: getLabel("debug_includeUiRefreshMetadata_desc", "Include uiRefresh details in successful MCP tool responses. Keep this off for normal agent use; UI refresh still runs either way."),
            },
            {
                type: "checkbox",
                key: "puppy__testModeEnabled",
                value: puppySettings.testModeEnabled,
                title: getLabel("puppy_testMode_title", "Random Mascot Test"),
                description: getLabel("puppy_testMode_desc", "Randomly cycle real MCP actions for animation testing without calling tools."),
                layout: "inline",
                children: [
                    ...(puppySettings.testModeEnabled
                        ? [{
                            type: "number" as const,
                            key: "puppy__testModeIntervalMs",
                            value: puppySettings.testModeIntervalMs,
                            title: getLabel("puppy_testMode_interval_title", "Interval"),
                            description: getLabel("puppy_testMode_interval_desc", "Delay between random test actions."),
                            inputCompact: true,
                            unit: "ms",
                        }]
                        : []),
                ],
            },
        ];
    }

    $: debugItems = buildDebugItems();
</script>

<SettingPanel {group} settingItems={debugItems} {display} on:changed={onChanged} />

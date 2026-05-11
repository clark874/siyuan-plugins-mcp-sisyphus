<script lang="ts">
    import SettingPanel from "../../shared/setting-panel.svelte";
    import type { PuppySettings } from "../tool-config-storage";

    export let group: string;
    export let display = false;
    export let puppySettings: PuppySettings;
    export let getLabel: (key: string, fallback: string) => string;
    export let onChanged: (event: CustomEvent<ChangeEvent>) => void | Promise<void>;

    interface ChangeEvent { key: string; value: any; }

    function buildPuppyItems(): ISettingItem[] {
        return [
            {
                type: "checkbox",
                key: "puppy__visible",
                value: puppySettings.visible,
                title: getLabel("puppy_visible_title", "Show Mascot"),
                description: getLabel("puppy_visible_desc", "Show or hide the mascot on screen."),
            },
            {
                type: "checkbox",
                key: "puppy__showClickHint",
                value: puppySettings.showClickHint,
                title: getLabel("puppy_showClickHint_title", "Show Click Hint"),
                description: getLabel("puppy_showClickHint_desc", "Show a hint on click that this mascot is provided by the MCP plugin and can be turned off here."),
            },
            {
                type: "checkbox",
                key: "puppy__showBubble",
                value: puppySettings.showBubble,
                title: getLabel("puppy_showBubble_title", "Show Bubble"),
                description: getLabel("puppy_showBubble_desc", "Show a pixel-style status bubble with tool-aware offsets and extra spacing for errors."),
            },
        ];
    }

    $: puppyItems = buildPuppyItems();
</script>

<SettingPanel {group} settingItems={puppyItems} {display} on:changed={onChanged} />

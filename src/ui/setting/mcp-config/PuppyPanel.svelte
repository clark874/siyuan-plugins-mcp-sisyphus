<script lang="ts">
    import SettingPanel from "../../shared/setting-panel.svelte";
    import type { PuppySettings } from "../tool-config-storage";

    export let group: string;
    export let display = false;
    export let puppySettings: PuppySettings;
    export let getLabel: (key: string, fallback: string) => string;
    export let onChanged: (event: CustomEvent<ChangeEvent>) => void | Promise<void>;

    interface ChangeEvent { key: string; value: any; }

    function emitChange(key: string, value: any) {
        void onChanged(new CustomEvent<ChangeEvent>("changed", { detail: { key, value } }));
    }

    function buildPuppyItems(): ISettingItem[] {
        const appearanceKey = [
            puppySettings.appearance.bodyColor,
            puppySettings.appearance.pawColor,
            puppySettings.appearance.eyeColor,
        ].join(":");

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
            {
                type: "button",
                key: "puppy__appearance__randomize",
                value: "",
                title: getLabel("puppy_appearance_random_title", "Random Appearance"),
                description: getLabel("puppy_appearance_random_desc", "Randomly pick colors for the mascot body, paws, and eyes."),
                inputCompact: true,
                button: {
                    label: getLabel("puppy_appearance_random_button", "Randomize"),
                    callback: () => emitChange("puppy__appearance__randomize", true),
                },
            },
            {
                type: "button",
                key: "puppy__appearance__reset",
                value: "",
                title: getLabel("puppy_appearance_reset_title", "Reset Appearance"),
                description: getLabel("puppy_appearance_reset_desc", "Restore the mascot body, paws, and eyes to their default colors."),
                inputCompact: true,
                button: {
                    label: getLabel("puppy_appearance_reset_button", "Reset"),
                    callback: () => emitChange("puppy__appearance__reset", true),
                },
            },
            {
                type: "color",
                key: `puppy__appearance__bodyColor__${appearanceKey}`,
                value: puppySettings.appearance.bodyColor,
                title: getLabel("puppy_appearance_body_title", "Body Color"),
                description: getLabel("puppy_appearance_body_desc", "Choose the mascot body and tail color."),
            },
            {
                type: "color",
                key: `puppy__appearance__pawColor__${appearanceKey}`,
                value: puppySettings.appearance.pawColor,
                title: getLabel("puppy_appearance_paw_title", "Paw Color"),
                description: getLabel("puppy_appearance_paw_desc", "Choose the mascot paw color."),
            },
            {
                type: "color",
                key: `puppy__appearance__eyeColor__${appearanceKey}`,
                value: puppySettings.appearance.eyeColor,
                title: getLabel("puppy_appearance_eye_title", "Eye Color"),
                description: getLabel("puppy_appearance_eye_desc", "Choose the mascot eye color."),
            },
        ];
    }

    $: puppyItems = buildPuppyItems();
</script>

<SettingPanel {group} settingItems={puppyItems} {display} on:changed={onChanged} />

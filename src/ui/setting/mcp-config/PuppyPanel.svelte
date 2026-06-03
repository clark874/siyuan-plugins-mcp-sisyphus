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

    function buildPuppyItems(
        currentPuppySettings: PuppySettings,
        label: (key: string, fallback: string) => string,
    ): ISettingItem[] {
        return [
            {
                type: "checkbox",
                key: "puppy__visible",
                value: currentPuppySettings.visible,
                title: label("puppy_visible_title", "Show Mascot"),
                description: label("puppy_visible_desc", "Show or hide the mascot on screen."),
            },
            {
                type: "checkbox",
                key: "puppy__showClickHint",
                value: currentPuppySettings.showClickHint,
                title: label("puppy_showClickHint_title", "Show Click Hint"),
                description: label("puppy_showClickHint_desc", "Show a hint on click that this mascot is provided by the MCP plugin and can be turned off here."),
            },
            {
                type: "checkbox",
                key: "puppy__showBubble",
                value: currentPuppySettings.showBubble,
                title: label("puppy_showBubble_title", "Show Bubble"),
                description: label("puppy_showBubble_desc", "Show a pixel-style status bubble with tool-aware offsets and extra spacing for errors."),
            },
        ];
    }

    function emitColor(field: "bodyColor" | "pawColor" | "eyeColor", event: Event) {
        const target = event.currentTarget as HTMLInputElement;
        emitChange(`puppy__appearance__${field}`, target.value);
    }

    $: puppyItems = buildPuppyItems(puppySettings, getLabel);
</script>

<SettingPanel {group} settingItems={puppyItems} {display} on:changed={onChanged} />

<div class="config__tab-container puppy-appearance-panel" class:fn__none={!display} data-name={`${group}-appearance`}>
    <div class="puppy-appearance-actions">
        <div>
            <div class="puppy-appearance-title">{getLabel("puppy_appearance_random_title", "Random Appearance")}</div>
            <div class="b3-label__text">{getLabel("puppy_appearance_random_desc", "Randomly pick colors for the mascot body, paws, and eyes.")}</div>
        </div>
        <div class="puppy-appearance-buttons">
            <button class="b3-button b3-button--outline" type="button" on:click={() => emitChange("puppy__appearance__randomize", true)}>
                {getLabel("puppy_appearance_random_button", "Randomize")}
            </button>
            <button class="b3-button b3-button--outline" type="button" on:click={() => emitChange("puppy__appearance__reset", true)}>
                {getLabel("puppy_appearance_reset_button", "Reset")}
            </button>
        </div>
    </div>

    <div class="puppy-appearance-row">
        <div>
            <div class="puppy-appearance-title">{getLabel("puppy_appearance_body_title", "Body Color")}</div>
            <div class="b3-label__text">{getLabel("puppy_appearance_body_desc", "Choose the mascot body and tail color.")}</div>
        </div>
        <input id="puppy__appearance__bodyColor" class="b3-text-field puppy-color-field" type="color" value={puppySettings.appearance.bodyColor} on:input={(event) => emitColor("bodyColor", event)} />
    </div>
    <div class="puppy-appearance-row">
        <div>
            <div class="puppy-appearance-title">{getLabel("puppy_appearance_paw_title", "Paw Color")}</div>
            <div class="b3-label__text">{getLabel("puppy_appearance_paw_desc", "Choose the mascot paw color.")}</div>
        </div>
        <input id="puppy__appearance__pawColor" class="b3-text-field puppy-color-field" type="color" value={puppySettings.appearance.pawColor} on:input={(event) => emitColor("pawColor", event)} />
    </div>
    <div class="puppy-appearance-row">
        <div>
            <div class="puppy-appearance-title">{getLabel("puppy_appearance_eye_title", "Eye Color")}</div>
            <div class="b3-label__text">{getLabel("puppy_appearance_eye_desc", "Choose the mascot eye color.")}</div>
        </div>
        <input id="puppy__appearance__eyeColor" class="b3-text-field puppy-color-field" type="color" value={puppySettings.appearance.eyeColor} on:input={(event) => emitColor("eyeColor", event)} />
    </div>
</div>

<style>
    .puppy-appearance-panel {
        border-top: 1px solid var(--b3-border-color);
        margin-top: 12px;
        padding-top: 12px;
    }

    .puppy-appearance-actions,
    .puppy-appearance-row {
        align-items: center;
        display: flex;
        justify-content: space-between;
        gap: 16px;
        min-height: 46px;
        padding: 8px 0;
    }

    .puppy-appearance-title {
        color: var(--mcp-config-title-color, var(--b3-theme-on-background));
        font-size: var(--mcp-config-title-font-size, 14px);
        font-weight: var(--mcp-config-title-font-weight, 500);
        margin-bottom: 4px;
    }

    .puppy-appearance-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
    }

    .puppy-color-field {
        box-sizing: border-box;
        flex: 0 0 72px;
        height: 32px;
        min-width: 72px;
        padding: 2px 4px;
        width: 72px;
    }

    @media (max-width: 768px) {
        .puppy-appearance-actions,
        .puppy-appearance-row {
            align-items: stretch;
            flex-direction: column;
        }

        .puppy-appearance-buttons {
            justify-content: flex-start;
        }
    }
</style>

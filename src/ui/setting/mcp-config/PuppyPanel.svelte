<script lang="ts">
    import SettingPanel from "../../shared/setting-panel.svelte";
    import PuppyAwakeSVG from "../../components/PuppyAwakeSVG.svelte";
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

{#if display}
    <section class="puppy-preview">
        <div class="puppy-preview__stage" aria-hidden="true">
            <PuppyAwakeSVG
                bodyColor={puppySettings.appearance.bodyColor}
                pawColor={puppySettings.appearance.pawColor}
                eyeColor={puppySettings.appearance.eyeColor}
            />
        </div>
        <div class="puppy-preview__copy">
            <strong>{getLabel("puppy_preview_title", "Live preview")}</strong>
            <span>{getLabel("puppy_preview_desc", "Appearance changes are reflected here immediately and saved for the on-screen mascot.")}</span>
        </div>
        <span class:puppy-preview__status--enabled={puppySettings.visible} class="puppy-preview__status">
            {puppySettings.visible ? getLabel("puppy_preview_visible", "Visible") : getLabel("puppy_preview_hidden", "Hidden")}
        </span>
        <div class="puppy-preview__appearance">
            <label class="puppy-preview__color">
                <span>{getLabel("puppy_appearance_body_title", "Body Color")}</span>
                <input id="puppy__appearance__bodyColor" class="b3-text-field puppy-color-field" type="color" value={puppySettings.appearance.bodyColor} aria-label={getLabel("puppy_appearance_body_desc", "Choose the mascot body and tail color.")} title={getLabel("puppy_appearance_body_desc", "Choose the mascot body and tail color.")} on:input={(event) => emitColor("bodyColor", event)} />
            </label>
            <label class="puppy-preview__color">
                <span>{getLabel("puppy_appearance_paw_title", "Paw Color")}</span>
                <input id="puppy__appearance__pawColor" class="b3-text-field puppy-color-field" type="color" value={puppySettings.appearance.pawColor} aria-label={getLabel("puppy_appearance_paw_desc", "Choose the mascot paw color.")} title={getLabel("puppy_appearance_paw_desc", "Choose the mascot paw color.")} on:input={(event) => emitColor("pawColor", event)} />
            </label>
            <label class="puppy-preview__color">
                <span>{getLabel("puppy_appearance_eye_title", "Eye Color")}</span>
                <input id="puppy__appearance__eyeColor" class="b3-text-field puppy-color-field" type="color" value={puppySettings.appearance.eyeColor} aria-label={getLabel("puppy_appearance_eye_desc", "Choose the mascot eye color.")} title={getLabel("puppy_appearance_eye_desc", "Choose the mascot eye color.")} on:input={(event) => emitColor("eyeColor", event)} />
            </label>
            <div class="puppy-preview__buttons">
                <button class="b3-button b3-button--outline" type="button" on:click={() => emitChange("puppy__appearance__randomize", true)}>
                    {getLabel("puppy_appearance_random_button", "Randomize")}
                </button>
                <button class="b3-button b3-button--outline" type="button" on:click={() => emitChange("puppy__appearance__reset", true)}>
                    {getLabel("puppy_appearance_reset_button", "Reset")}
                </button>
            </div>
        </div>
    </section>
{/if}
<SettingPanel {group} settingItems={puppyItems} {display} on:changed={onChanged} />

<style>
    .puppy-preview {
        align-items: center;
        background: var(--mcp-config-surface-accent, var(--mcp-config-surface-raised, var(--b3-theme-surface)));
        border: 1px solid var(--mcp-config-primary-border, var(--b3-border-color));
        border-radius: var(--mcp-config-card-radius, 10px);
        box-shadow: var(--mcp-config-shadow, none);
        column-gap: 16px;
        display: grid;
        grid-template-columns: 66px minmax(0, 1fr) auto;
        margin-bottom: var(--mcp-config-section-gap, 14px);
        min-height: 84px;
        padding: 14px 18px;
        row-gap: 12px;
    }

    .puppy-preview__stage {
        align-items: center;
        background: color-mix(in srgb, var(--b3-theme-background) 76%, transparent);
        border: 1px solid var(--mcp-config-border, var(--b3-border-color));
        border-radius: var(--mcp-config-control-radius, 8px);
        display: flex;
        flex: 0 0 66px;
        grid-row: 1 / span 2;
        height: 66px;
        justify-content: center;
        overflow: hidden;
        width: 66px;
    }

    .puppy-preview__copy {
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
    }

    .puppy-preview__copy strong {
        color: var(--mcp-config-title-color, var(--b3-theme-on-background));
        font-size: 14px;
        font-weight: var(--mcp-config-title-font-weight, 600);
    }

    .puppy-preview__copy span {
        color: var(--mcp-config-caption-color, var(--b3-theme-on-surface-light));
        font-size: 12px;
        line-height: 1.5;
    }

    .puppy-preview__status {
        background: color-mix(in srgb, var(--b3-theme-on-surface) 8%, transparent);
        border: 1px solid var(--mcp-config-border, var(--b3-border-color));
        border-radius: 999px;
        color: var(--mcp-config-caption-color, var(--b3-theme-on-surface-light));
        flex: 0 0 auto;
        font-size: 11px;
        font-weight: 600;
        padding: 3px 9px;
    }

    .puppy-preview__status--enabled {
        background: color-mix(in srgb, var(--b3-theme-success, var(--b3-theme-primary)) 12%, transparent);
        border-color: color-mix(in srgb, var(--b3-theme-success, var(--b3-theme-primary)) 28%, transparent);
        color: var(--b3-theme-success, var(--b3-theme-primary));
    }

    .puppy-preview__appearance {
        align-items: center;
        border-top: 1px solid var(--mcp-config-border, var(--b3-border-color));
        display: flex;
        flex-wrap: wrap;
        gap: 10px 16px;
        grid-column: 2 / -1;
        padding-top: 12px;
    }

    .puppy-preview__color {
        align-items: center;
        color: var(--mcp-config-title-color, var(--b3-theme-on-background));
        display: flex;
        font-size: 12px;
        gap: 7px;
    }

    .puppy-preview__buttons {
        display: flex;
        flex-wrap: nowrap;
        gap: 8px;
        margin-left: auto;
    }

    .puppy-color-field {
        box-sizing: border-box;
        flex: 0 0 42px;
        height: 28px;
        min-width: 42px;
        padding: 2px 4px;
        width: 42px;
    }

    @media (max-width: 768px) {
        .puppy-preview {
            align-items: flex-start;
            display: flex;
            flex-wrap: wrap;
        }

        .puppy-preview__appearance {
            flex: 1 0 100%;
            width: 100%;
        }
    }
</style>

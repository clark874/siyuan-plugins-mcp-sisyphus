<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import SettingPanel from "../../shared/setting-panel.svelte";
    import type { ToolConfig } from "../tool-config";

    export let group: string;
    export let display = false;
    export let config: ToolConfig;
    export let getLabel: (key: string, fallback: string) => string;
    export let onChanged: (event: CustomEvent<ChangeEvent>) => void | Promise<void>;

    interface ChangeEvent { key: string; value: any; }

    const dispatch = createEventDispatcher();
    const USER_RULES_KEY = "userRulesText";

    let userRulesText = "";

    $: userRulesText = config.userRulesText;
    $: title = getLabel("user_rules_title", "User Custom Rules");
    $: description = getLabel("user_rules_desc", "Additional instructions appended to the MCP server prompt at startup. Use this for personal preferences like icon behavior, naming, language, or formatting defaults. Avoid secrets and keep it concise.");
    $: placeholder = getLabel("user_rules_placeholder", "创建文档/日记后主动设图标");

    function dispatchChanged() {
        const event = new CustomEvent<ChangeEvent>("changed", {
            detail: {
                key: USER_RULES_KEY,
                value: userRulesText,
            },
        });
        onChanged?.(event);
        dispatch("changed", { group, key: USER_RULES_KEY, value: userRulesText });
    }
</script>

<SettingPanel {group} settingItems={[]} {display}>
    <section class="user-rules-editor" aria-labelledby="user-rules-title">
        <div class="user-rules-editor__header">
            <div>
                <h3 id="user-rules-title" class="user-rules-editor__title">{title}</h3>
                <p class="user-rules-editor__desc">{description}</p>
            </div>
        </div>

        <textarea
            class="b3-text-field user-rules-editor__textarea"
            bind:value={userRulesText}
            {placeholder}
            on:change={dispatchChanged}
        />
    </section>
</SettingPanel>

<style>
    .user-rules-editor {
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: var(--mcp-config-section-gap, 12px);
        min-height: 100%;
        padding: 0;
    }

    .user-rules-editor__header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--mcp-config-section-gap, 12px);
    }

    .user-rules-editor__title {
        margin: 0;
        color: var(--mcp-config-title-color, var(--b3-theme-on-background));
        font-size: var(--mcp-config-title-font-size, 14px);
        font-weight: var(--mcp-config-title-font-weight, 500);
        line-height: 1.5;
    }

    .user-rules-editor__desc {
        margin: 6px 0 0;
        max-width: 760px;
        color: var(--mcp-config-caption-color, var(--b3-theme-on-surface-light));
        font-size: 12px;
        line-height: 1.55;
    }

    .user-rules-editor__textarea {
        box-sizing: border-box;
        width: 100%;
        min-height: 240px;
        padding: 12px 14px;
        resize: vertical;
        white-space: pre-wrap;
        line-height: 1.55;
    }

    @media (max-width: 768px) {
        .user-rules-editor {
            gap: 12px;
            max-width: none;
        }

        .user-rules-editor__textarea {
            min-height: 180px;
        }
    }
</style>

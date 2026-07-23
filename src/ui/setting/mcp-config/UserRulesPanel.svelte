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
    const AGENT_MEMORY_KEY = "agentSiyuanMemoryText";

    let userRulesText = "";
    let lastSyncedUserRulesText = "";
    let hasDraftChanges = false;
    let agentSiyuanMemoryText = "";
    let lastSyncedAgentSiyuanMemoryText = "";
    let hasAgentMemoryDraftChanges = false;

    $: {
        const nextUserRulesText = typeof config?.userRulesText === "string" ? config.userRulesText : "";
        if (nextUserRulesText !== lastSyncedUserRulesText) {
            lastSyncedUserRulesText = nextUserRulesText;
            if (!hasDraftChanges) {
                userRulesText = nextUserRulesText;
            }
        }
    }
    $: {
        const nextAgentSiyuanMemoryText = typeof config?.agentSiyuanMemoryText === "string" ? config.agentSiyuanMemoryText : "";
        if (nextAgentSiyuanMemoryText !== lastSyncedAgentSiyuanMemoryText) {
            lastSyncedAgentSiyuanMemoryText = nextAgentSiyuanMemoryText;
            if (!hasAgentMemoryDraftChanges) {
                agentSiyuanMemoryText = nextAgentSiyuanMemoryText;
            }
        }
    }
    $: title = getLabel("user_rules_title", "User Custom Rules");
    $: description = getLabel("user_rules_desc", "Additional instructions appended to the MCP server prompt at startup. Use this for personal preferences like icon behavior, naming, language, or formatting defaults. Avoid secrets and keep it concise.");
    $: placeholder = getLabel("user_rules_placeholder", "创建文档/日记后主动设图标");
    $: agentMemoryTitle = getLabel("agent_memory_title", "Agent siyuan Memory");
    $: agentMemoryDescription = getLabel("agent_memory_desc", "AI-maintained summary of the SiYuan workspace state. This memory is injected into MCP startup instructions and exposed as /AGENTS.md through the fs tool. Avoid secrets and sensitive personal data.");
    $: agentMemoryPlaceholder = getLabel("agent_memory_placeholder", "Summarize durable workspace facts, important notebooks, naming conventions, and current project context.");

    function markDraftChanged(event: Event) {
        const target = event.currentTarget as HTMLTextAreaElement;
        userRulesText = target.value;
        hasDraftChanges = userRulesText !== lastSyncedUserRulesText;
    }

    function dispatchChanged() {
        if (userRulesText === lastSyncedUserRulesText) {
            hasDraftChanges = false;
            return;
        }
        hasDraftChanges = false;
        lastSyncedUserRulesText = userRulesText;
        const event = new CustomEvent<ChangeEvent>("changed", {
            detail: {
                key: USER_RULES_KEY,
                value: userRulesText,
            },
        });
        onChanged?.(event);
        dispatch("changed", { group, key: USER_RULES_KEY, value: userRulesText });
    }

    function markAgentMemoryDraftChanged(event: Event) {
        const target = event.currentTarget as HTMLTextAreaElement;
        agentSiyuanMemoryText = target.value;
        hasAgentMemoryDraftChanges = agentSiyuanMemoryText !== lastSyncedAgentSiyuanMemoryText;
    }

    function dispatchAgentMemoryChanged() {
        if (agentSiyuanMemoryText === lastSyncedAgentSiyuanMemoryText) {
            hasAgentMemoryDraftChanges = false;
            return;
        }
        hasAgentMemoryDraftChanges = false;
        lastSyncedAgentSiyuanMemoryText = agentSiyuanMemoryText;
        const event = new CustomEvent<ChangeEvent>("changed", {
            detail: {
                key: AGENT_MEMORY_KEY,
                value: agentSiyuanMemoryText,
            },
        });
        onChanged?.(event);
        dispatch("changed", { group, key: AGENT_MEMORY_KEY, value: agentSiyuanMemoryText });
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
            on:input={markDraftChanged}
            on:change={dispatchChanged}
            on:blur={dispatchChanged}
        />

        <div class="user-rules-editor__divider" aria-hidden="true"></div>

        <div class="user-rules-editor__header">
            <div>
                <h3 class="user-rules-editor__title">{agentMemoryTitle}</h3>
                <p class="user-rules-editor__desc">{agentMemoryDescription}</p>
            </div>
        </div>

        <textarea
            class="b3-text-field user-rules-editor__textarea"
            bind:value={agentSiyuanMemoryText}
            placeholder={agentMemoryPlaceholder}
            on:input={markAgentMemoryDraftChanged}
            on:change={dispatchAgentMemoryChanged}
            on:blur={dispatchAgentMemoryChanged}
        />
    </section>
</SettingPanel>

<style>
    .user-rules-editor {
        background: var(--mcp-config-surface, var(--b3-theme-surface));
        border: 1px solid var(--mcp-config-border, var(--b3-border-color));
        border-radius: var(--mcp-config-card-radius, 10px);
        box-shadow: var(--mcp-config-shadow, none);
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: var(--mcp-config-section-gap, 12px);
        min-height: 100%;
        padding: var(--mcp-config-card-padding, 16px 18px);
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

    .user-rules-editor__divider {
        height: 1px;
        margin: 4px 0;
        background: var(--mcp-config-border, var(--b3-border-color));
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

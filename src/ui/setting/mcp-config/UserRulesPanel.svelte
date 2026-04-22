<script lang="ts">
    import SettingPanel from "../../shared/setting-panel.svelte";
    import type { ToolConfig } from "../tool-config";

    export let group: string;
    export let display = false;
    export let config: ToolConfig;
    export let getLabel: (key: string, fallback: string) => string;
    export let onChanged: (event: CustomEvent<ChangeEvent>) => void | Promise<void>;

    interface ChangeEvent { key: string; value: any; }

    function buildUserRulesItems(): ISettingItem[] {
        return [
            {
                type: "textarea",
                key: "userRulesText",
                value: config.userRulesText,
                title: getLabel("user_rules_title", "User Custom Rules"),
                description: getLabel("user_rules_desc", "Additional instructions appended to the MCP server prompt at startup. Use this for personal preferences like icon behavior, naming, language, or formatting defaults. Avoid secrets and keep it concise."),
                placeholder: getLabel("user_rules_placeholder", "创建文档/日记后主动设图标"),
                inputStyle: "min-height: 12em; white-space: pre-wrap;",
            },
        ];
    }

    $: userRulesItems = buildUserRulesItems();
</script>

<SettingPanel {group} settingItems={userRulesItems} {display} on:changed={onChanged} />

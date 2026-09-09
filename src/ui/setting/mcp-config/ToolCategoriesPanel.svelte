<script lang="ts">
    import {
        ACTIONS_BY_CATEGORY,
        SAFE_NATIVE_EXTENSION_TOOLS,
        TOOL_CATEGORIES,
        isDangerousAction,
        type ToolCategory,
        type ToolConfig,
    } from "../tool-config";
    import type { UiOfficialMcpDiscovery } from "../official-plugin-tools";

    export let group: string;
    export let display = false;
    export let config: ToolConfig;
    export let getLabel: (key: string, fallback: string) => string;
    export let onChanged: (event: CustomEvent<{ key: string; value: any }>) => void | Promise<void>;
    export let extensionDiscovery: UiOfficialMcpDiscovery = { loading: false, connected: false, tools: [] };
    export let onRefreshExtensionTools: () => void | Promise<void> = () => {};

    const SAFE_NATIVE_TOOL_NAMES = new Set<string>(SAFE_NATIVE_EXTENSION_TOOLS);
    const labelForCategory = (category: ToolCategory) => getLabel(`tool_${category}`, category);
    const change = (key: string, value: boolean) => void onChanged(new CustomEvent("changed", { detail: { key, value } }));
    const visibleOfficialTools = () => extensionDiscovery.tools.filter((tool) => tool.source === "plugin" || SAFE_NATIVE_TOOL_NAMES.has(tool.name));
</script>

<div class="tools-page" class:fn__none={!display} aria-label={group}>
    {#each TOOL_CATEGORIES as category}
        <section class="tool-card">
            <header>
                <div><h3>{labelForCategory(category)}</h3><small>{ACTIONS_BY_CATEGORY[category].length} 个动作</small></div>
                <input type="checkbox" checked={config[category].enabled} on:change={(event) => change(`${category}__enabled`, event.currentTarget.checked)} />
            </header>
            <div class="actions">
                {#each ACTIONS_BY_CATEGORY[category] as action}
                    <label>
                        <span>{action}{isDangerousAction(category, action) ? " · 高风险" : ""}</span>
                        <input type="checkbox" disabled={!config[category].enabled} checked={Boolean(config[category].actions[action])} on:change={(event) => change(`${category}__action__${action}`, event.currentTarget.checked)} />
                    </label>
                {/each}
            </div>
            {#if category === "extension"}
                <div class="extension-row">
                    <label><span>启用原生只读工具</span><input type="checkbox" checked={config.extension.includeNativeTools} on:change={(event) => change("extension__include_native_tools", event.currentTarget.checked)} /></label>
                    <button class="b3-button" on:click={() => onRefreshExtensionTools()} disabled={extensionDiscovery.loading}>{extensionDiscovery.loading ? "刷新中" : "刷新发现"}</button>
                </div>
                {#each visibleOfficialTools() as tool}
                    <label class="official-tool"><span>{tool.name} <small>{tool.source}</small></span><input type="checkbox" checked={!config.extension.blockedTools.includes(tool.name)} on:change={(event) => change(`extension__tool__${tool.name}`, event.currentTarget.checked)} /></label>
                {/each}
            {/if}
        </section>
    {/each}
</div>

<style>
    .tools-page{display:flex;flex-direction:column;gap:14px;max-width:920px}.tool-card{border:1px solid var(--b3-border-color);border-radius:10px;overflow:hidden}.tool-card header{align-items:center;display:flex;justify-content:space-between;padding:14px 16px}.tool-card h3{font-size:14px;margin:0}.tool-card small{color:var(--b3-theme-on-surface-light);font-size:11px}.actions{border-top:1px solid var(--b3-border-color);display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.actions label,.official-tool,.extension-row label{align-items:center;display:flex;justify-content:space-between;padding:10px 16px}.actions label:nth-child(odd){border-right:1px solid var(--b3-border-color)}.actions label{border-bottom:1px solid var(--b3-border-color);font-family:var(--b3-font-family-code);font-size:12px}.extension-row{align-items:center;display:flex;justify-content:space-between;padding:8px 0}.official-tool{border-top:1px solid var(--b3-border-color);font-family:var(--b3-font-family-code);font-size:12px}@media(max-width:560px){.actions{grid-template-columns:1fr}.actions label:nth-child(odd){border-right:0}}
</style>

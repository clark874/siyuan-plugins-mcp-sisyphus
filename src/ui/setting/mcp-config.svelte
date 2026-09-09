<script lang="ts">
    import { onMount } from "svelte";
    import { fetchPost, showMessage } from "siyuan";
    import { buildDefaultToolConfig, normalizeToolConfig, type ToolCategory, type ToolConfig } from "./tool-config";
    import {
        buildDefaultHttpServerSettings,
        buildDefaultPermissionDisplaySettings,
        buildDefaultVersionControlSettings,
        loadPersistedHttpServerSettings,
        loadPersistedPermissionDisplaySettings,
        loadPersistedToolConfig,
        loadPersistedVersionControlSettings,
        savePersistedPermissionDisplaySettings,
        savePersistedToolConfig,
        savePersistedVersionControlSettings,
        type HttpServerSettings,
        type PermissionDisplaySettings,
        type VersionControlSettings,
    } from "./tool-config-storage";
    import { normalizeNotebookPermission, normalizeNotebookPermissions, type NotebookPermission } from "../permission-tree-indicator";
    import HttpServerPanel from "./mcp-config/HttpServerPanel.svelte";
    import PermissionsPanel from "./mcp-config/PermissionsPanel.svelte";
    import ToolCategoriesPanel from "./mcp-config/ToolCategoriesPanel.svelte";
    import McpAppsPanel from "./mcp-config/McpAppsPanel.svelte";
    import UserRulesPanel from "./mcp-config/UserRulesPanel.svelte";
    import DebugPanel from "./mcp-config/DebugPanel.svelte";
    import { discoverOfficialTools, type UiOfficialMcpDiscovery } from "./official-plugin-tools";

    export let plugin: any;
    interface NotebookInfo { id: string; name: string; closed?: boolean }
    interface ChangeEvent { key: string; value: any }

    const tabs = [
        { id: "connection", label: "连接" },
        { id: "permissions", label: "权限" },
        { id: "tools", label: "工具" },
        { id: "mcpApps", label: "MCP Apps" },
        { id: "debug", label: "安全与显示" },
        { id: "userRules", label: "规则与记忆" },
    ] as const;
    let focusGroup: typeof tabs[number]["id"] = "connection";
    let config: ToolConfig = buildDefaultToolConfig();
    let httpSettings: HttpServerSettings = buildDefaultHttpServerSettings();
    let versionControlSettings: VersionControlSettings = buildDefaultVersionControlSettings();
    let permissionDisplaySettings: PermissionDisplaySettings = buildDefaultPermissionDisplaySettings();
    let notebooks: NotebookInfo[] = [];
    let permissions: Record<string, NotebookPermission> = {};
    let permLoading = true;
    let extensionDiscovery: UiOfficialMcpDiscovery = { loading: false, connected: false, tools: [] };
    const getLabel = (key: string, fallback: string) => plugin?.i18n?.[key] ?? fallback;

    async function loadNotebooks() {
        permLoading = true;
        await new Promise<void>((resolve) => {
            fetchPost("/api/notebook/lsNotebooks", {}, (response: any) => {
                notebooks = Array.isArray(response?.data?.notebooks) ? response.data.notebooks : [];
                resolve();
            });
        });
        permLoading = false;
    }

    async function refreshExtensionTools() {
        extensionDiscovery = { ...extensionDiscovery, loading: true };
        extensionDiscovery = await discoverOfficialTools();
    }

    onMount(async () => {
        [config, httpSettings, versionControlSettings, permissionDisplaySettings] = await Promise.all([
            loadPersistedToolConfig(plugin),
            loadPersistedHttpServerSettings(plugin),
            loadPersistedVersionControlSettings(plugin),
            loadPersistedPermissionDisplaySettings(plugin),
        ]);
        permissions = normalizeNotebookPermissions(await plugin?.loadData?.("notebookPermissions"));
        await Promise.all([loadNotebooks(), refreshExtensionTools()]);
    });

    async function persistConfig() {
        config = await savePersistedToolConfig(config, plugin);
    }
    async function persistPermissions() {
        await plugin?.saveData?.("notebookPermissions", permissions);
        plugin?.refreshPermissionTreeIndicators?.(permissions);
    }
    function updateCategory(category: ToolCategory, enabled: boolean) {
        config = { ...config, [category]: { ...config[category], enabled } };
    }
    function updateAction(category: ToolCategory, action: string, enabled: boolean) {
        config = { ...config, [category]: { ...config[category], actions: { ...config[category].actions, [action]: enabled } } };
    }

    async function onChanged(event: CustomEvent<ChangeEvent>) {
        const { key, value } = event.detail;
        if (key.startsWith("perm__") && key !== "perm__hint") {
            permissions = { ...permissions, [key.slice(6)]: normalizeNotebookPermission(value) };
            await persistPermissions();
            return;
        }
        if (key === "permissionDisplay__showInFileTree") {
            permissionDisplaySettings = await savePersistedPermissionDisplaySettings({ showInFileTree: Boolean(value) }, plugin);
            plugin?.updatePermissionDisplaySettings?.(permissionDisplaySettings);
            return;
        }
        if (key === "writeSafety__strictMode") config = { ...config, writeSafety: { strictMode: Boolean(value) } };
        else if (key === "errorReporting__softRecoverableErrors") config = { ...config, errorReporting: { softRecoverableErrors: Boolean(value) } };
        else if (key === "debug__slimResponses") config = { ...config, debug: { ...config.debug, slimResponses: Boolean(value) } };
        else if (key === "versionControl__enabled" || key === "versionControl__recentDocumentsEnabled" || key === "versionControl__showDebugMeta") {
            const field = key.slice("versionControl__".length) as keyof VersionControlSettings;
            versionControlSettings = await savePersistedVersionControlSettings({ ...versionControlSettings, [field]: Boolean(value) }, plugin);
            await plugin?.updateVersionControlSettings?.(versionControlSettings);
            return;
        } else if (key === "userRulesText" || key === "agentSiyuanMemoryText") {
            config = normalizeToolConfig({ ...config, [key]: String(value ?? "") });
        } else if (key === "extension__include_native_tools") {
            config = { ...config, extension: { ...config.extension, includeNativeTools: Boolean(value) } };
        } else if (key.startsWith("extension__tool__")) {
            const toolName = key.slice("extension__tool__".length);
            const blocked = new Set(config.extension.blockedTools);
            Boolean(value) ? blocked.delete(toolName) : blocked.add(toolName);
            config = { ...config, extension: { ...config.extension, blockedTools: [...blocked].sort() } };
        } else if (key.startsWith("mcpApps__")) {
            const [, appName, kind, action] = key.split("__");
            if (appName === "timeline" && kind === "enabled") config = { ...config, mcpApps: { timeline: { ...config.mcpApps.timeline, enabled: Boolean(value) } } };
            if (appName === "timeline" && kind === "action" && action) config = { ...config, mcpApps: { timeline: { ...config.mcpApps.timeline, actions: { ...config.mcpApps.timeline.actions, [action]: Boolean(value) } } } };
        } else if (key.endsWith("__enabled")) {
            updateCategory(key.slice(0, -"__enabled".length) as ToolCategory, Boolean(value));
        } else {
            const [category, marker, action] = key.split("__");
            if (marker === "action" && action) updateAction(category as ToolCategory, action, Boolean(value));
        }
        await persistConfig();
        if (key === "userRulesText" || key === "agentSiyuanMemoryText") await plugin?.refreshHttpServerAfterInstructionConfigChange?.();
    }

    export async function saveSettings() {
        await Promise.all([persistConfig(), persistPermissions()]);
        showMessage(getLabel("saved", "已保存"));
    }
    export async function resetDefaults() {
        config = buildDefaultToolConfig();
        versionControlSettings = buildDefaultVersionControlSettings();
        permissionDisplaySettings = buildDefaultPermissionDisplaySettings();
        await Promise.all([persistConfig(), savePersistedVersionControlSettings(versionControlSettings, plugin), savePersistedPermissionDisplaySettings(permissionDisplaySettings, plugin)]);
    }
</script>

<div class="config-layout">
    <nav>{#each tabs as tab}<button class:active={focusGroup === tab.id} on:click={() => focusGroup = tab.id}>{getLabel(tab.id, tab.label)}</button>{/each}</nav>
    <main>
        <HttpServerPanel plugin={plugin} group="connection" display={focusGroup === "connection"} {httpSettings} {getLabel} />
        <PermissionsPanel group="permissions" display={focusGroup === "permissions"} {notebooks} {permissions} {permissionDisplaySettings} {permLoading} {getLabel} {onChanged} />
        <ToolCategoriesPanel group="tools" display={focusGroup === "tools"} {config} {getLabel} {onChanged} {extensionDiscovery} onRefreshExtensionTools={refreshExtensionTools} />
        <McpAppsPanel display={focusGroup === "mcpApps"} {config} {getLabel} {onChanged} />
        <DebugPanel group="debug" display={focusGroup === "debug"} {config} {versionControlSettings} {getLabel} {onChanged} />
        <UserRulesPanel group="userRules" display={focusGroup === "userRules"} {config} {getLabel} {onChanged} />
    </main>
</div>

<style>
    .config-layout{display:grid;grid-template-columns:180px 1fr;min-height:560px}nav{border-right:1px solid var(--b3-border-color);display:flex;flex-direction:column;padding:10px}nav button{background:transparent;border:0;border-radius:7px;color:var(--b3-theme-on-background);cursor:pointer;padding:10px 12px;text-align:left}nav button.active{background:var(--b3-list-hover);color:var(--b3-theme-primary)}main{min-width:0;overflow:auto;padding:18px}@media(max-width:700px){.config-layout{grid-template-columns:1fr}nav{border-bottom:1px solid var(--b3-border-color);border-right:0;flex-direction:row;overflow:auto}nav button{white-space:nowrap}}
</style>

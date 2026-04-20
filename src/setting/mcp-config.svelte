<script lang="ts">
    import { onMount } from "svelte";
    import { fetchPost, showMessage } from "siyuan";

    import { buildDefaultToolConfig, normalizeToolConfig, type ToolCategory, type ToolConfig } from "./tool-config";
    import {
        buildDefaultHttpServerSettings,
        buildDefaultPuppySettings,
        buildDefaultTelemetryConfig,
        loadPersistedHttpServerSettings,
        loadPersistedPuppySettings,
        loadPersistedTelemetryConfig,
        loadPersistedToolConfig,
        normalizePuppySettings,
        savePersistedPuppySettings,
        savePersistedTelemetryConfig,
        savePersistedToolConfig,
        type HttpServerSettings,
        type PuppySettings,
        type TelemetryConfig,
    } from "./tool-config-storage";
    import HttpServerPanel from "./mcp-config/HttpServerPanel.svelte";
    import PuppyPanel from "./mcp-config/PuppyPanel.svelte";
    import TelemetryPanel from "./mcp-config/TelemetryPanel.svelte";
    import ToolCategoriesPanel from "./mcp-config/ToolCategoriesPanel.svelte";
    import UserRulesPanel from "./mcp-config/UserRulesPanel.svelte";

    export let plugin: any;

    type NotebookPermission = 'none' | 'r' | 'rw' | 'rwd';
    const VALID_PERMISSIONS: NotebookPermission[] = ['none', 'r', 'rw', 'rwd'];
    const LEGACY_PERMISSION_MAP = {
        none: 'none',
        readonly: 'r',
        write: 'rw',
    } as const;

    interface NotebookInfo { id: string; name: string; }
    interface ChangeEvent { key: string; value: any; }

    const USER_RULES_GROUP_KEY = "User Rules";
    const USER_RULES_GROUP_LABEL = "User Rules";
    const PUPPY_GROUP_KEY = "Mascot";
    const PUPPY_GROUP_LABEL = "🐾 Mascot";
    const PERM_GROUP_KEY = "Permissions";
    const PERM_GROUP_LABEL = "🔒 Permissions";
    const HTTP_GROUP_KEY = "Connection Config";
    const ANALYTICS_GROUP_KEY = "analyticsGroupTitle";
    const ANALYTICS_GROUP_LABEL = "Usage Stats";

    const CATEGORY_TABS: Array<{ category: Exclude<ToolCategory, "mascot">; icon: string; groupKey: string }> = [
        { category: "notebook", icon: "📚", groupKey: "Notebooks" },
        { category: "document", icon: "📝", groupKey: "Documents" },
        { category: "block", icon: "🧱", groupKey: "Blocks" },
        { category: "av", icon: "🗃️", groupKey: "Databases" },
        { category: "file", icon: "📁", groupKey: "Files" },
        { category: "search", icon: "🔍", groupKey: "Search" },
        { category: "tag", icon: "🏷️", groupKey: "Tags" },
        { category: "system", icon: "🖥️", groupKey: "System" },
        { category: "flashcard", icon: "🃏", groupKey: "Flashcards" },
    ];

    let config: ToolConfig = buildDefaultToolConfig();
    let httpSettings: HttpServerSettings = buildDefaultHttpServerSettings();
    let puppySettings: PuppySettings = buildDefaultPuppySettings();
    let telemetryConfig: TelemetryConfig = buildDefaultTelemetryConfig();
    let focusGroup = `🌐 ${HTTP_GROUP_KEY}`;
    let notebooks: NotebookInfo[] = [];
    let permissions: Record<string, NotebookPermission> = {};
    let permLoading = true;

    const getLabel = (key: string, fallback: string) => plugin?.i18n?.[key] ?? fallback;

    const normalizePermission = (value: unknown): NotebookPermission => {
        if (VALID_PERMISSIONS.includes(value as NotebookPermission)) {
            return value as NotebookPermission;
        }
        if (typeof value === "string" && value in LEGACY_PERMISSION_MAP) {
            return LEGACY_PERMISSION_MAP[value as keyof typeof LEGACY_PERMISSION_MAP];
        }
        return 'none';
    };

    $: userRulesGroupLabel = `🧭 ${getLabel(USER_RULES_GROUP_KEY, USER_RULES_GROUP_LABEL)}`;
    $: puppyGroupLabel = `🐾 ${getLabel(PUPPY_GROUP_KEY, PUPPY_GROUP_LABEL)}`;
    $: permGroupLabel = `🔒 ${getLabel(PERM_GROUP_KEY, PERM_GROUP_LABEL)}`;
    $: httpGroupLabel = `🌐 ${getLabel("httpServerTitle", HTTP_GROUP_KEY)}`;
    $: analyticsGroupLabel = `📊 ${getLabel(ANALYTICS_GROUP_KEY, ANALYTICS_GROUP_LABEL)}`;
    $: groups = [
        httpGroupLabel,
        permGroupLabel,
        ...CATEGORY_TABS.map((group) => `${group.icon} ${getLabel(group.groupKey, group.groupKey)}`),
        puppyGroupLabel,
        analyticsGroupLabel,
        userRulesGroupLabel,
    ];
    $: if (!groups.includes(focusGroup)) {
        focusGroup = groups[0];
    }

    async function loadNotebooks() {
        try {
            await new Promise<void>((resolve, reject) => {
                fetchPost("/api/notebook/lsNotebooks", {}, (resp: any) => {
                    if (resp?.code === 0) {
                        notebooks = (resp?.data?.notebooks ?? []).map((nb: any) => ({
                            id: nb.id,
                            name: nb.name,
                        }));
                        resolve();
                    } else {
                        reject(new Error(resp?.msg || "Failed to load notebooks"));
                    }
                });
            });
        } catch {
            notebooks = [];
        }
        permLoading = false;
    }

    onMount(async () => {
        config = await loadPersistedToolConfig(plugin);
        puppySettings = await loadPersistedPuppySettings(plugin);
        httpSettings = await loadPersistedHttpServerSettings(plugin);
        telemetryConfig = await loadPersistedTelemetryConfig(plugin);

        const savedPerms = await plugin?.loadData("notebookPermissions");
        if (savedPerms && typeof savedPerms === "object") {
            const normalizedPermissions = Object.fromEntries(
                Object.entries(savedPerms).map(([notebookId, permission]) => [notebookId, normalizePermission(permission)]),
            );
            permissions = normalizedPermissions;
            if (JSON.stringify(savedPerms) !== JSON.stringify(normalizedPermissions)) {
                await plugin.saveData("notebookPermissions", normalizedPermissions);
            }
        }

        await loadNotebooks();
    });

    function setCategoryEnabled(category: ToolCategory, enabled: boolean) {
        config = {
            ...config,
            [category]: {
                ...config[category],
                enabled,
            },
        };
    }

    function setActionEnabled(category: ToolCategory, action: string, enabled: boolean) {
        const nextActions = {
            ...config[category].actions,
            [action]: enabled,
        };
        const hasEnabledActions = Object.values(nextActions).some(Boolean);

        config = {
            ...config,
            [category]: {
                enabled: enabled ? true : hasEnabledActions ? config[category].enabled : false,
                actions: nextActions,
            },
        };
    }

    async function persistPuppySettings() {
        if (plugin) {
            puppySettings = await savePersistedPuppySettings(puppySettings, plugin);
            plugin.updatePuppyTestSettings?.(puppySettings);
        }
    }

    async function persistConfig() {
        if (plugin) {
            config = await savePersistedToolConfig(config, plugin);
        }
    }

    async function persistPermissions() {
        if (plugin) {
            await plugin.saveData("notebookPermissions", permissions);
        }
    }

    async function persistTelemetryConfig() {
        if (plugin) {
            telemetryConfig = await savePersistedTelemetryConfig(telemetryConfig, plugin);
        }
    }

    const onChanged = async (event: CustomEvent<ChangeEvent>) => {
        const { key, value } = event.detail;

        if (key === "puppy__visible") {
            puppySettings = { ...puppySettings, visible: Boolean(value) };
            await persistPuppySettings();
            return;
        }

        if (key === "puppy__testModeEnabled") {
            puppySettings = { ...puppySettings, testModeEnabled: Boolean(value) };
            await persistPuppySettings();
            return;
        }

        if (key === "puppy__showBubble") {
            puppySettings = { ...puppySettings, showBubble: Boolean(value) };
            await persistPuppySettings();
            return;
        }

        if (key === "puppy__showClickHint") {
            puppySettings = { ...puppySettings, showClickHint: Boolean(value) };
            await persistPuppySettings();
            return;
        }

        if (key === "puppy__testModeIntervalMs") {
            const numeric = Number(value);
            puppySettings = {
                ...puppySettings,
                testModeIntervalMs: Number.isFinite(numeric) ? Math.max(800, Math.min(10000, Math.floor(numeric))) : puppySettings.testModeIntervalMs,
            };
            await persistPuppySettings();
            return;
        }

        if (key.startsWith("perm__") && key !== "perm__hint") {
            const notebookId = key.slice("perm__".length);
            permissions = { ...permissions, [notebookId]: value as NotebookPermission };
            await persistPermissions();
            return;
        }

        if (key.endsWith("__enabled")) {
            const category = key.replace("__enabled", "") as ToolCategory;
            setCategoryEnabled(category, Boolean(value));
            await persistConfig();
            return;
        }

        if (key === "file__setting__uploadLargeFileThresholdMB") {
            const numeric = Number(value);
            config = {
                ...config,
                file: {
                    ...config.file,
                    uploadLargeFileThresholdMB: Number.isFinite(numeric) ? Math.max(1, Math.min(1024, Math.floor(numeric))) : config.file.uploadLargeFileThresholdMB,
                },
            };
            await persistConfig();
            return;
        }

        if (key === "userRulesText") {
            config = {
                ...config,
                userRulesText: typeof value === "string" ? value : String(value ?? ""),
            };
            await persistConfig();
            return;
        }

        if (key === "telemetry__enabled") {
            telemetryConfig = { ...telemetryConfig, enabled: Boolean(value) };
            await persistTelemetryConfig();
            return;
        }

        if (key === "telemetry__interval") {
            const hours = parseInt(String(value), 10);
            telemetryConfig = {
                ...telemetryConfig,
                reportIntervalHours: Number.isFinite(hours) ? Math.max(1, Math.min(168, hours)) : telemetryConfig.reportIntervalHours,
            };
            await persistTelemetryConfig();
            return;
        }

        if (key === "telemetry__endpoint") {
            telemetryConfig = {
                ...telemetryConfig,
                endpoint: typeof value === "string" && value.trim() ? value.trim() : undefined,
            };
            await persistTelemetryConfig();
            return;
        }

        const [category, , action] = key.split("__");
        if (category && action) {
            setActionEnabled(category as ToolCategory, action, Boolean(value));
            await persistConfig();
        }
    };

    export async function saveSettings() {
        await persistConfig();
        showMessage(plugin?.i18n?.mcpConfigSaved || "✅ MCP Tools configuration saved");
    }

    export async function resetDefaults() {
        config = normalizeToolConfig(buildDefaultToolConfig());
        puppySettings = normalizePuppySettings(buildDefaultPuppySettings());
        telemetryConfig = buildDefaultTelemetryConfig();
        await persistConfig();
        await persistPuppySettings();
        await persistTelemetryConfig();
        showMessage(plugin?.i18n?.mcpConfigReset || "🔄 MCP Tools configuration reset to defaults");
    }
</script>

<div class="fn__flex-1 fn__flex config__panel">
    <ul class="b3-tab-bar b3-list b3-list--background">
        {#each groups as group}
            <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
            <li
                data-name="mcp-config"
                class:b3-list-item--focus={group === focusGroup}
                class="b3-list-item"
                on:click={() => {
                    focusGroup = group;
                }}
                on:keydown={() => {}}
            >
                <span class="b3-list-item__text">{group}</span>
            </li>
        {/each}
    </ul>
    <div class="config__tab-wrap">
        <HttpServerPanel {plugin} group={httpGroupLabel} display={focusGroup === httpGroupLabel} bind:httpSettings {getLabel} />
        <ToolCategoriesPanel {config} {groups} {focusGroup} {permGroupLabel} {notebooks} {permissions} {permLoading} {getLabel} {onChanged} />
        <PuppyPanel group={puppyGroupLabel} display={focusGroup === puppyGroupLabel} {config} {puppySettings} {getLabel} {onChanged} />
        <TelemetryPanel analyticsGroup={analyticsGroupLabel} telemetryGroup="" showTelemetry={false} currentToolConfig={config} {focusGroup} {telemetryConfig} {getLabel} {onChanged} />
        <UserRulesPanel group={userRulesGroupLabel} display={focusGroup === userRulesGroupLabel} {config} {getLabel} {onChanged} />
    </div>
</div>

<style lang="scss">
    .config__panel {
        height: 100%;
        min-height: 0;
    }

    .config__panel > ul > li {
        padding-left: 1rem;
    }

    .config__tab-wrap {
        max-height: calc(100vh - 250px);
        overflow-y: auto;
        overflow-x: hidden;
        scroll-behavior: smooth;
    }
</style>

<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { fetchPost, showMessage } from "siyuan";

    import { buildDefaultToolConfig, isDangerousAction, normalizeToolConfig, type AvAction, type BlockAction, type DocumentAction, type FileAction, type FlashcardAction, type MascotAction, type NotebookAction, type SearchAction, type SystemAction, type TagAction, type ToolCategory, type ToolConfig } from "./tool-config";
    import {
    buildDefaultHttpServerSettings,
    buildDefaultPuppySettings,
    loadPersistedHttpServerSettings,
    loadPersistedPuppySettings,
    loadPersistedToolConfig,
    normalizePuppySettings,
    regenerateHttpServerToken,
    savePersistedHttpServerSettings,
    savePersistedPuppySettings,
    savePersistedToolConfig,
    type HttpServerSettings,
    type PuppySettings,
} from "./tool-config-storage";
    import type { HttpServerStatus } from "../server-launcher";
    import SettingPanel from "../libs/components/setting-panel.svelte";

    export let plugin: any;

    type GroupAction = NotebookAction | DocumentAction | BlockAction | AvAction | FileAction | SearchAction | TagAction | SystemAction | FlashcardAction | MascotAction;
    type NotebookPermission = 'none' | 'r' | 'rw' | 'rwd';
    const VALID_PERMISSIONS: NotebookPermission[] = ['none', 'r', 'rw', 'rwd'];
    const LEGACY_PERMISSION_MAP = {
        none: 'none',
        readonly: 'r',
        write: 'rw',
    } as const;

    interface GroupDefinition {
        category: ToolCategory;
        icon: string;
        groupKey: string;
        actions: Array<{
            key: GroupAction;
            title: string;
            description: string;
        }>;
    }

    const GROUP_DEFINITIONS: GroupDefinition[] = [
        {
            category: "notebook",
            icon: "📚",
            groupKey: "Notebooks",
            actions: [
                { key: "list", title: "List Notebooks", description: "List all notebooks in the workspace." },
                { key: "create", title: "Create Notebook", description: "Create a new notebook." },
                { key: "open", title: "Open Notebook", description: "Open a notebook." },
                { key: "close", title: "Close Notebook", description: "Close a notebook." },
                { key: "remove", title: "Remove Notebook", description: "Remove a notebook." },
                { key: "rename", title: "Rename Notebook", description: "Rename a notebook." },
                { key: "get_conf", title: "Get Notebook Config", description: "Get notebook configuration." },
                { key: "set_conf", title: "Set Notebook Config", description: "Set notebook configuration." },
                { key: "get_permissions", title: "Get Notebook Permissions", description: "Get MCP access permissions for all notebooks." },
                { key: "set_permission", title: "Set Notebook Permission", description: "Set MCP access permission for a notebook." },
                { key: "get_child_docs", title: "Get Child Documents", description: "Get direct child documents at the notebook root." },
                { key: "set_icon", title: "Set Notebook Icon", description: "Set the icon for a notebook." },
            ],
        },
        {
            category: "document",
            icon: "📝",
            groupKey: "Documents",
            actions: [
                { key: "create", title: "Create Document", description: "Create a new document with markdown content at a human-readable target path." },
                { key: "rename", title: "Rename Document", description: "Rename a document by ID or storage path." },
                { key: "remove", title: "Remove Document", description: "Remove a document by ID or storage path." },
                { key: "move", title: "Move Documents", description: "Move multiple documents by ID or storage path." },
                { key: "get_path", title: "Get Document Path", description: "Get a storage path by document ID." },
                { key: "get_hpath", title: "Get Hierarchical Path", description: "Get a hierarchical path by ID or storage path." },
                { key: "get_ids", title: "Get IDs by Hierarchical Path", description: "Get document IDs by hierarchical path." },
                { key: "get_child_blocks", title: "Get Child Blocks", description: "Get direct child blocks by document ID." },
                { key: "get_child_docs", title: "Get Child Documents", description: "Get direct child documents by document ID." },
                { key: "set_icon", title: "Set Document Icon", description: "Set the icon for a document or folder." },
                { key: "set_cover", title: "Set Document Cover", description: "Set the document cover image from a URL or SiYuan asset path." },
                { key: "clear_cover", title: "Clear Document Cover", description: "Clear the document cover image." },
                { key: "list_tree", title: "List Document Tree", description: "List the nested document tree under a notebook path." },
                { key: "search_docs", title: "Search Documents", description: "Search documents by title keyword." },
                { key: "get_doc", title: "Get Document Content", description: "Get document content and metadata by document ID." },
                { key: "create_daily_note", title: "Create Daily Note", description: "Create or return today's daily note for a notebook." },
            ],
        },
        {
            category: "block",
            icon: "🧱",
            groupKey: "Blocks",
            actions: [
                { key: "insert", title: "Insert Block", description: "Insert a new block at a specified position." },
                { key: "prepend", title: "Prepend Block", description: "Insert a block at the beginning of a parent." },
                { key: "append", title: "Append Block", description: "Insert a block at the end of a parent." },
                { key: "update", title: "Update Block", description: "Update block content." },
                { key: "delete", title: "Delete Block", description: "Delete a block." },
                { key: "move", title: "Move Block", description: "Move a block to a new position." },
                { key: "fold", title: "Fold Block", description: "Fold a foldable block." },
                { key: "unfold", title: "Unfold Block", description: "Unfold a foldable block." },
                { key: "get_kramdown", title: "Get Block Kramdown", description: "Get block content in kramdown format." },
                { key: "get_children", title: "Get Child Blocks", description: "Get all child blocks of a parent." },
                { key: "transfer_ref", title: "Transfer Block Reference", description: "Transfer block references." },
                { key: "set_attrs", title: "Set Block Attributes", description: "Set block attributes." },
                { key: "get_attrs", title: "Get Block Attributes", description: "Get block attributes." },
                { key: "exists", title: "Check Block Existence", description: "Check whether a block exists." },
                { key: "info", title: "Get Block Info", description: "Get root document metadata for a block." },
                { key: "breadcrumb", title: "Get Block Breadcrumb", description: "Get the breadcrumb path for a block." },
                { key: "dom", title: "Get Block DOM", description: "Get rendered DOM for a block." },
                { key: "recent_updated", title: "Recent Updated Blocks", description: "List recently updated blocks." },
                { key: "word_count", title: "Block Word Count", description: "Get word-count statistics for blocks." },
            ],
        },
        {
            category: "av",
            icon: "🗃️",
            groupKey: "Databases",
            actions: [
                { key: "get", title: "Get Database", description: "Get the full attribute view payload by AV ID." },
                { key: "search", title: "Search Databases", description: "Search attribute views by keyword." },
                { key: "add_rows", title: "Add Rows", description: "Add existing blocks as rows in a database." },
                { key: "remove_rows", title: "Remove Rows", description: "Remove bound rows from a database." },
                { key: "add_column", title: "Add Column", description: "Add a column to a database." },
                { key: "remove_column", title: "Remove Column", description: "Remove a column from a database." },
                { key: "set_cell", title: "Set Cell", description: "Update one cell with a typed value payload." },
                { key: "batch_set_cells", title: "Batch Set Cells", description: "Batch update multiple database cells." },
                { key: "duplicate_block", title: "Duplicate Database Block", description: "Duplicate an existing database block." },
                { key: "get_primary_key_values", title: "Get Primary Key Values", description: "Get database primary key rows with optional filtering." },
            ],
        },
        {
            category: "file",
            icon: "📁",
            groupKey: "Files",
            actions: [
                { key: "upload_asset", title: "Upload Asset", description: "Read a local file path and upload that file to the assets directory. Files larger than the configured threshold must stop and ask the user before retrying with confirmLargeFile=true." },
                { key: "render_template", title: "Render Template", description: "Render a template with document context." },
                { key: "render_sprig", title: "Render Sprig", description: "Render a Sprig template." },
                { key: "export_md", title: "Export Markdown Content", description: "Export document content as Markdown." },
                { key: "export_resources", title: "Export Resources", description: "Export resources as a ZIP archive." },
            ],
        },
        {
            category: "search",
            icon: "🔍",
            groupKey: "Search",
            actions: [
                { key: "fulltext", title: "Full-text Search", description: "Search blocks across the workspace." },
                { key: "query_sql", title: "Query SQL", description: "Run read-only SQL queries against SiYuan data." },
                { key: "search_tag", title: "Search Tags", description: "Search for matching tags." },
                { key: "get_backlinks", title: "Get Backlinks", description: "Get backlinks for a block or document." },
                { key: "get_backmentions", title: "Get Backmentions", description: "Get backmentions for a block or document." },
            ],
        },
        {
            category: "tag",
            icon: "🏷️",
            groupKey: "Tags",
            actions: [
                { key: "list", title: "List Tags", description: "List tags in the workspace." },
                { key: "rename", title: "Rename Tag", description: "Rename a tag label." },
                { key: "remove", title: "Remove Tag", description: "Remove a tag label." },
            ],
        },
        {
            category: "system",
            icon: "🖥️",
            groupKey: "System",
            actions: [
                { key: "workspace_info", title: "Workspace Info", description: "Get SiYuan workspace metadata. High risk: exposes the absolute workspace path." },
                { key: "network", title: "Network Info", description: "Get masked network proxy information." },
                { key: "changelog", title: "Changelog", description: "Get the current version changelog when available." },
                { key: "conf", title: "Masked Config", description: "Get masked system configuration via summary-first progressive reading." },
                { key: "sys_fonts", title: "System Fonts", description: "List available system fonts via summary-first paginated reading." },
                { key: "boot_progress", title: "Boot Progress", description: "Get current boot progress details." },
                { key: "push_msg", title: "Push Message", description: "Push a notification message." },
                { key: "push_err_msg", title: "Push Error Message", description: "Push an error notification message." },
                { key: "get_version", title: "Get Version", description: "Get the SiYuan system version." },
                { key: "get_current_time", title: "Get Current Time", description: "Get the current system time." },
            ],
        },
        {
            category: "flashcard",
            icon: "🃏",
            groupKey: "Flashcards",
            actions: [
                { key: "list_cards", title: "List Cards", description: "List due flashcards by scope and optionally filter to due/new/old cards." },
                { key: "get_decks", title: "Get Decks", description: "List available flashcard decks for discovering deck IDs." },
                { key: "review_card", title: "Review Card", description: "Submit a flashcard review rating." },
                { key: "skip_review_card", title: "Skip Review Card", description: "Skip the current flashcard in the review flow." },
                { key: "add_card", title: "Add Card", description: "Add existing blocks to a flashcard deck." },
                { key: "remove_card", title: "Remove Card", description: "Remove existing blocks from a flashcard deck." },
            ],
        },
        {
            category: "mascot",
            icon: "🐾",
            groupKey: "Mascot Tool",
            actions: [
                { key: "get_balance", title: "Get Balance", description: "Get the mascot's current balance. Every successful MCP tool call earns 1 coin." },
                { key: "shop", title: "Shop", description: "List the mascot shop inventory." },
                { key: "buy", title: "Buy", description: "Buy one item from the mascot shop by item ID." },
            ],
        },
    ];

    const USER_RULES_GROUP_KEY = "User Rules";
    const USER_RULES_GROUP_LABEL = "User Rules";
    const PUPPY_GROUP_KEY = "Mascot";
    const PUPPY_GROUP_LABEL = "🐾 Mascot";
    const PERM_GROUP_KEY = "Permissions";
    const PERM_GROUP_LABEL = "🔒 Permissions";
    const HTTP_GROUP_KEY = "Connection Config";
    const HTTP_GROUP_LABEL = "🌐 Connection Config";
    const defaultGroups = [HTTP_GROUP_LABEL, PERM_GROUP_LABEL, ...GROUP_DEFINITIONS.filter((group) => group.category !== "mascot").map((group) => `${group.icon} ${group.groupKey}`), PUPPY_GROUP_LABEL, USER_RULES_GROUP_LABEL];

    let config: ToolConfig = buildDefaultToolConfig();
    let groups = defaultGroups;
    let focusGroup = defaultGroups[0];

    let puppySettings: PuppySettings = buildDefaultPuppySettings();
    let puppyItems: ISettingItem[] = [];

    let notebookItems: ISettingItem[] = [];
    let documentItems: ISettingItem[] = [];
    let blockItems: ISettingItem[] = [];
    let avItems: ISettingItem[] = [];
    let fileItems: ISettingItem[] = [];
    let searchItems: ISettingItem[] = [];
    let tagItems: ISettingItem[] = [];
    let systemItems: ISettingItem[] = [];
    let flashcardItems: ISettingItem[] = [];
    let userRulesItems: ISettingItem[] = [];

    // HTTP server tab state
    let httpSettings: HttpServerSettings = buildDefaultHttpServerSettings();
    let httpStatus: HttpServerStatus = { running: false, host: httpSettings.host, port: httpSettings.port };
    let httpRecentLogs: string[] = [];
    let httpDirty = false;
    let httpBusy = false;
    let httpUnsubStatus: (() => void) | null = null;
    let httpUnsubLogs: (() => void) | null = null;

    // Permissions tab state
    interface NotebookInfo { id: string; name: string; }
    let notebooks: NotebookInfo[] = [];
    let permissions: Record<string, NotebookPermission> = {};
    let permItems: ISettingItem[] = [];
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

    const getDangerTitle = (title: string) => `${title} ${getLabel("mcpHighRiskBadge", "[High risk]")}`;
    const getDangerDescription = (description: string) => `${description} ${getLabel("mcpRequiresConfirmation", "Requires explicit user confirmation before execution.")} ${getLabel("mcpDefaultVisible", "This action stays visible in the default configuration.")}`;

    const buildToolToggleItem = (definition: GroupDefinition): ISettingItem => ({
        type: "checkbox",
        key: `${definition.category}__enabled`,
        value: config[definition.category].enabled,
        title: getLabel(`${definition.category}_tool_title`, `${definition.groupKey} Tool`),
        description: getLabel(`${definition.category}_tool_desc`, `Expose the grouped ${definition.category} tool to MCP clients.`),
    });

    const buildUploadAssetThresholdItem = (): ISettingItemCore => ({
        type: "number",
        key: "file__setting__uploadLargeFileThresholdMB",
        value: config.file.uploadLargeFileThresholdMB,
        title: getLabel("file_setting_uploadLargeFileThresholdMB", "Large Upload Threshold"),
        description: getLabel("desc_file_setting_uploadLargeFileThresholdMB", "Files larger than this threshold must stop and ask the user before retrying with confirmLargeFile=true."),
        inputCompact: true,
        unit: "MB",
    });

    const buildActionItems = (definition: GroupDefinition): ISettingItem[] => definition.actions.flatMap((action) => {
        const baseTitle = getLabel(`${definition.category}_action_${action.key}`, action.title);
        const baseDescription = getLabel(`desc_${definition.category}_action_${action.key}`, action.description);
        const dangerous = isDangerousAction(definition.category, action.key);
        const uploadAssetEnabled = definition.category === "file" && action.key === "upload_asset" && config.file.actions.upload_asset;
        const items: ISettingItem[] = [{
            type: "checkbox",
            key: `${definition.category}__action__${action.key}`,
            value: config[definition.category].actions[action.key as keyof typeof config[typeof definition.category]["actions"]],
            title: dangerous ? getDangerTitle(baseTitle) : baseTitle,
            description: dangerous ? getDangerDescription(baseDescription) : baseDescription,
            ...(definition.category === "file" && action.key === "upload_asset"
                ? { layout: "inline" as const }
                : {}),
            ...(definition.category === "file" && action.key === "upload_asset"
                ? { children: uploadAssetEnabled ? [buildUploadAssetThresholdItem()] : [] }
                : {}),
        }];

        return items;
    });

    function getGroupDefinition(category: ToolCategory): GroupDefinition {
        const definition = GROUP_DEFINITIONS.find((item) => item.category === category);
        if (!definition) {
            throw new Error(`Unknown tool category: ${category}`);
        }
        return definition;
    }

    function buildPermItems(): ISettingItem[] {
        if (notebooks.length === 0) {
            return [{
                type: "hint",
                key: "perm__hint",
                value: permLoading ? "Loading notebooks..." : "No notebooks found.",
                title: "",
                description: "",
            }];
        }
        return notebooks.map((nb) => ({
            type: "select",
            key: `perm__${nb.id}`,
            value: permissions[nb.id] ?? "rwd",
            title: nb.name,
            description: getLabel("mcpPermDesc", "MCP 访问权限：无权限 / 只读 / 读写不可删除 / 读写可删除"),
            options: {
                none: getLabel("mcpPermNone", "禁止访问"),
                r: getLabel("mcpPermRead", "只读"),
                rw: getLabel("mcpPermReadWrite", "读写不可删除"),
                rwd: getLabel("mcpPermReadWriteDelete", "读写可删除"),
            },
        }));
    }

    function buildPuppyItems(): ISettingItem[] {
        return [
            buildToolToggleItem(getGroupDefinition("mascot")),
            ...buildActionItems(getGroupDefinition("mascot")),
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
                key: "puppy__testModeEnabled",
                value: puppySettings.testModeEnabled,
                title: getLabel("puppy_testMode_title", "Random Mascot Test"),
                description: getLabel("puppy_testMode_desc", "Randomly cycle real MCP actions for animation testing without calling tools."),
                layout: "inline",
                children: [
                    ...(puppySettings.testModeEnabled
                        ? [{
                            type: "number",
                            key: "puppy__testModeIntervalMs",
                            value: puppySettings.testModeIntervalMs,
                            title: getLabel("puppy_testMode_interval_title", "Interval"),
                            description: getLabel("puppy_testMode_interval_desc", "Delay between random test actions."),
                            inputCompact: true,
                            unit: "ms",
                        }]
                        : []),
                ],
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

    function refreshItems() {
        puppyItems = buildPuppyItems();
        notebookItems = [buildToolToggleItem(getGroupDefinition("notebook")), ...buildActionItems(getGroupDefinition("notebook"))];
        documentItems = [buildToolToggleItem(getGroupDefinition("document")), ...buildActionItems(getGroupDefinition("document"))];
        blockItems = [buildToolToggleItem(getGroupDefinition("block")), ...buildActionItems(getGroupDefinition("block"))];
        avItems = [buildToolToggleItem(getGroupDefinition("av")), ...buildActionItems(getGroupDefinition("av"))];
        fileItems = [buildToolToggleItem(getGroupDefinition("file")), ...buildActionItems(getGroupDefinition("file"))];
        searchItems = [buildToolToggleItem(getGroupDefinition("search")), ...buildActionItems(getGroupDefinition("search"))];
        tagItems = [buildToolToggleItem(getGroupDefinition("tag")), ...buildActionItems(getGroupDefinition("tag"))];
        systemItems = [buildToolToggleItem(getGroupDefinition("system")), ...buildActionItems(getGroupDefinition("system"))];
        flashcardItems = [buildToolToggleItem(getGroupDefinition("flashcard")), ...buildActionItems(getGroupDefinition("flashcard"))];
        userRulesItems = buildUserRulesItems();
        permItems = buildPermItems();
    }

    $: userRulesGroupLabel = `🧭 ${getLabel(USER_RULES_GROUP_KEY, USER_RULES_GROUP_LABEL)}`;
    $: puppyGroupLabel = `🐾 ${getLabel(PUPPY_GROUP_KEY, PUPPY_GROUP_LABEL)}`;
    $: permGroupLabel = `🔒 ${getLabel(PERM_GROUP_KEY, PERM_GROUP_LABEL)}`;
    $: httpGroupLabel = `🌐 ${getLabel("httpServerTitle", HTTP_GROUP_KEY)}`;
    $: groups = [httpGroupLabel, permGroupLabel, ...GROUP_DEFINITIONS.filter((group) => group.category !== "mascot").map((group) => `${group.icon} ${getLabel(group.groupKey, group.groupKey)}`), puppyGroupLabel, userRulesGroupLabel];
    $: if (!groups.includes(focusGroup)) {
        focusGroup = groups[0];
    }
    $: config, notebooks, permissions, puppySettings, refreshItems();

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
        permItems = buildPermItems();
    }

    onMount(async () => {
        config = await loadPersistedToolConfig(plugin);
        puppySettings = await loadPersistedPuppySettings(plugin);
        httpSettings = await loadPersistedHttpServerSettings(plugin);

        if (plugin?.httpLauncher) {
            httpStatus = plugin.httpLauncher.getStatus();
            httpRecentLogs = plugin.httpLauncher.getRecentLogs();
            httpUnsubStatus = plugin.httpLauncher.onStatusChange((s: HttpServerStatus) => {
                httpStatus = s;
            });
            httpUnsubLogs = plugin.httpLauncher.onLogsChange((lines: string[]) => {
                httpRecentLogs = lines;
            });
        }

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

    onDestroy(() => {
        httpUnsubStatus?.();
        httpUnsubLogs?.();
    });

    function getWorkspaceScriptPath(): string {
        const workspaceDir = (window as any)?.siyuan?.config?.system?.workspaceDir;
        if (typeof workspaceDir !== "string" || !workspaceDir.trim()) {
            return "{SIYUAN_PATH}/data/plugins/siyuan-plugins-mcp-sisyphus/mcp-server.cjs";
        }
        return `${workspaceDir.replace(/[\\/]+$/, "")}/data/plugins/siyuan-plugins-mcp-sisyphus/mcp-server.cjs`;
    }

    function getSiYuanApiToken(): string {
        const token = (window as any)?.siyuan?.config?.api?.token;
        if (typeof token !== "string" || !token.trim()) {
            return "xxxxxx";
        }
        return token;
    }

    function generateClientSnippet(s: HttpServerSettings, mode: "direct" | "stdio" | "bridge"): string {
        const url = `http://${s.host}:${s.port}/mcp`;
        if (mode === "direct") {
            const headers = s.authEnabled ? { Authorization: `Bearer ${s.token}` } : undefined;
            const obj: any = { mcpServers: { siyuan: { type: "http", url } } };
            if (headers) obj.mcpServers.siyuan.headers = headers;
            return JSON.stringify(obj, null, 2);
        }
        if (mode === "bridge") {
            const args = ["mcp-remote", url];
            if (s.authEnabled) {
                args.push("--header", `Authorization: Bearer ${s.token}`);
            }
            return JSON.stringify({ mcpServers: { siyuan: { command: "npx", args } } }, null, 2);
        }
        return JSON.stringify({
            mcpServers: {
                siyuan: {
                    command: "node",
                    args: [getWorkspaceScriptPath()],
                    env: {
                        SIYUAN_API_URL: "http://127.0.0.1:6806",
                        SIYUAN_TOKEN: getSiYuanApiToken(),
                    },
                },
            },
        }, null, 2);
    }

    async function copyText(text: string) {
        try {
            await navigator.clipboard.writeText(text);
            showMessage(getLabel("copySuccess", "✅ Copied"));
        } catch {
            showMessage(getLabel("copyFailed", "Failed to copy to clipboard"));
        }
    }

    async function persistHttpSettings(next: HttpServerSettings, restart: boolean) {
        if (!plugin) return;
        if (restart && typeof plugin.updateHttpServerSettings === "function") {
            httpBusy = true;
            try {
                httpSettings = await plugin.updateHttpServerSettings(next);
            } finally {
                httpBusy = false;
            }
        } else if (typeof plugin.setHttpServerSettings === "function") {
            httpSettings = await plugin.setHttpServerSettings(next);
        } else {
            httpSettings = await savePersistedHttpServerSettings(next, plugin);
        }
        httpDirty = false;
    }

    async function toggleHttpServer() {
        if (!plugin?.httpLauncher) {
            showMessage(getLabel("httpUnsupported", "HTTP server is only available in the SiYuan desktop app."));
            return;
        }
        httpBusy = true;
        try {
            if (httpStatus.running) {
                await plugin.stopHttpServer();
            } else {
                if (httpDirty) {
                    await persistHttpSettings(httpSettings, false);
                }
                await plugin.startHttpServer();
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            showMessage(`${getLabel("httpStartError", "HTTP server error")}: ${msg}`);
        } finally {
            httpBusy = false;
        }
    }

    async function applyHttpSettings() {
        await persistHttpSettings(httpSettings, true);
        showMessage(getLabel("httpSettingsSaved", "✅ HTTP server settings saved"));
    }

    function regenerateToken() {
        httpSettings = regenerateHttpServerToken(httpSettings);
        httpDirty = true;
    }

    function markHttpDirty() {
        httpDirty = true;
    }

    async function toggleHttpAutoStart(value: boolean) {
        const next = { ...httpSettings, enabled: value };
        await persistHttpSettings(next, false);
    }

    async function onHttpAutoStartChange(event: Event) {
        const target = event.currentTarget as HTMLInputElement;
        await toggleHttpAutoStart(target.checked);
    }

    function onHttpAuthChange(event: Event) {
        const target = event.currentTarget as HTMLInputElement;
        httpSettings = { ...httpSettings, authEnabled: target.checked };
        httpDirty = true;
    }

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

    interface ChangeEvent {
        key: string;
        value: any;
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
            permItems = buildPermItems();
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
        await persistConfig();
        await persistPuppySettings();
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
        <SettingPanel group={httpGroupLabel} settingItems={[]} display={focusGroup === httpGroupLabel}>
            <div class="http-server-section">
                <div class="http-status-row">
                    <span class="http-status-dot" class:running={httpStatus.running}></span>
                    {#if httpStatus.running}
                        <span class="http-status-text">
                            {getLabel("httpStatusRunning", "Running")}: <code>http://{httpStatus.host}:{httpStatus.port}/mcp</code>
                            {#if httpStatus.pid} (PID {httpStatus.pid}){/if}
                        </span>
                    {:else}
                        <span class="http-status-text">{getLabel("httpStatusStopped", "Stopped")}</span>
                        {#if httpStatus.lastError}
                            <span class="http-error">{httpStatus.lastError}</span>
                        {/if}
                    {/if}
                </div>

                {#if !plugin?.httpLauncher}
                    <div class="http-warning">{getLabel("httpUnsupported", "HTTP server is only available in the SiYuan desktop app.")}</div>
                {/if}

                <div class="http-actions">
                    <button class="b3-button b3-button--outline" on:click={toggleHttpServer} disabled={httpBusy || !plugin?.httpLauncher}>
                        {httpStatus.running ? getLabel("httpStop", "Stop") : getLabel("httpStart", "Start")}
                    </button>
                    <button class="b3-button b3-button--outline" on:click={applyHttpSettings} disabled={httpBusy || !httpDirty}>
                        {getLabel("httpApply", "Apply & Restart")}
                    </button>
                </div>

                <div class="http-form">
                    <label class="http-field">
                        <input type="checkbox" checked={httpSettings.enabled} on:change={onHttpAutoStartChange} />
                        {getLabel("httpAutoStart", "Auto-start with SiYuan")}
                    </label>

                    <label class="http-field">
                        <span class="http-label">Host</span>
                        <input type="text" class="b3-text-field" bind:value={httpSettings.host} on:input={markHttpDirty} placeholder="127.0.0.1" />
                    </label>

                    <label class="http-field">
                        <span class="http-label">Port</span>
                        <input type="number" class="b3-text-field" bind:value={httpSettings.port} on:input={markHttpDirty} min="1" max="65535" />
                    </label>

                    <label class="http-field">
                        <input type="checkbox" checked={httpSettings.authEnabled} on:change={onHttpAuthChange} />
                        {getLabel("httpEnableAuth", "Require Bearer token")}
                    </label>

                    {#if httpSettings.authEnabled}
                        <div class="http-field http-token-row">
                            <span class="http-label">Token</span>
                            <input type="text" class="b3-text-field http-token-input" readonly value={httpSettings.token} />
                            <button class="b3-button b3-button--outline" on:click={() => copyText(httpSettings.token)}>{getLabel("httpCopy", "Copy")}</button>
                            <button class="b3-button b3-button--outline" on:click={regenerateToken}>{getLabel("httpRegenerate", "Regenerate")}</button>
                        </div>
                    {/if}
                </div>

                {#if httpSettings.host !== "127.0.0.1" && httpSettings.host !== "localhost" && !httpSettings.authEnabled}
                    <div class="http-warning">{getLabel("httpWarnExposedNoAuth", "⚠️ Bound to a non-loopback address with auth disabled. Other devices on the network can access your SiYuan workspace.")}</div>
                {/if}

                <details class="http-snippet">
                    <summary>{getLabel("httpClientSnippet", "HTTP Connection")}</summary>
                    <pre>{generateClientSnippet(httpSettings, "direct")}</pre>
                    <button class="b3-button b3-button--outline" on:click={() => copyText(generateClientSnippet(httpSettings, "direct"))}>{getLabel("httpCopy", "Copy")}</button>
                </details>

                <details class="http-snippet">
                    <summary>{getLabel("httpClientSnippetBridge", "mcp-remote Bridge")}</summary>
                    <pre>{generateClientSnippet(httpSettings, "bridge")}</pre>
                    <button class="b3-button b3-button--outline" on:click={() => copyText(generateClientSnippet(httpSettings, "bridge"))}>{getLabel("httpCopy", "Copy")}</button>
                </details>
                <details class="http-snippet">
                    <summary>{getLabel("httpClientSnippetRemote", "stdio Connection")}</summary>
                    <pre>{generateClientSnippet(httpSettings, "stdio")}</pre>
                    <button class="b3-button b3-button--outline" on:click={() => copyText(generateClientSnippet(httpSettings, "stdio"))}>{getLabel("httpCopy", "Copy")}</button>
                </details>
                <details class="http-snippet">
                    <summary>{getLabel("httpRecentLogs", "Recent server logs")}</summary>
                    <pre class="http-log-box">{httpRecentLogs.length ? httpRecentLogs.join("\n") : getLabel("httpNoLogs", "(no logs yet)")}</pre>
                </details>
            </div>
        </SettingPanel>
        <SettingPanel group={permGroupLabel} settingItems={permItems} display={focusGroup === permGroupLabel} on:changed={onChanged} />
        <SettingPanel group={groups[2]} settingItems={notebookItems} display={focusGroup === groups[2]} on:changed={onChanged} />
        <SettingPanel group={groups[3]} settingItems={documentItems} display={focusGroup === groups[3]} on:changed={onChanged} />
        <SettingPanel group={groups[4]} settingItems={blockItems} display={focusGroup === groups[4]} on:changed={onChanged} />
        <SettingPanel group={groups[5]} settingItems={avItems} display={focusGroup === groups[5]} on:changed={onChanged} />
        <SettingPanel group={groups[6]} settingItems={fileItems} display={focusGroup === groups[6]} on:changed={onChanged} />
        <SettingPanel group={groups[7]} settingItems={searchItems} display={focusGroup === groups[7]} on:changed={onChanged} />
        <SettingPanel group={groups[8]} settingItems={tagItems} display={focusGroup === groups[8]} on:changed={onChanged} />
        <SettingPanel group={groups[9]} settingItems={systemItems} display={focusGroup === groups[9]} on:changed={onChanged} />
        <SettingPanel group={groups[10]} settingItems={flashcardItems} display={focusGroup === groups[10]} on:changed={onChanged} />
        <SettingPanel group={puppyGroupLabel} settingItems={puppyItems} display={focusGroup === puppyGroupLabel} on:changed={onChanged} />
        <SettingPanel group={userRulesGroupLabel} settingItems={userRulesItems} display={focusGroup === userRulesGroupLabel} on:changed={onChanged} />
    </div>
</div>

<style lang="scss">
    .config__panel {
        height: 100%;
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

    .http-server-section {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        font-size: 13px;

        .http-status-row {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }

        .http-status-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: var(--b3-theme-error, #d33);
            display: inline-block;
        }

        .http-status-dot.running {
            background: var(--b3-theme-success, #3b3);
        }

        .http-status-text code {
            background: var(--b3-theme-surface);
            padding: 1px 6px;
            border-radius: 3px;
        }

        .http-error {
            color: var(--b3-theme-error, #d33);
        }

        .http-warning {
            padding: 8px 12px;
            background: var(--b3-card-warning-background, rgba(255, 180, 0, 0.12));
            border-left: 3px solid var(--b3-theme-warning, #e0a000);
            border-radius: 3px;
            color: var(--b3-card-warning-color, inherit);
        }

        .http-actions {
            display: flex;
            gap: 8px;
        }

        .http-form {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .http-field {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }

        .http-label {
            min-width: 60px;
        }

        .http-token-row {
            .http-token-input {
                flex: 1;
                min-width: 240px;
                font-family: monospace;
                font-size: 12px;
            }
        }

        .http-snippet {
            background: var(--b3-theme-surface);
            border-radius: 4px;
            padding: 8px 12px;

            summary {
                cursor: pointer;
                user-select: none;
            }

            pre {
                margin: 8px 0;
                padding: 8px;
                background: var(--b3-theme-background);
                border-radius: 3px;
                overflow: auto;
                max-height: 200px;
                font-size: 12px;
            }
        }

        .http-log-box {
            white-space: pre-wrap;
            word-break: break-all;
        }
    }
</style>

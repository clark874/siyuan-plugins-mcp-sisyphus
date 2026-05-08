<script lang="ts">
    import SettingPanel from "../../shared/setting-panel.svelte";
    import { isDangerousAction, type AvAction, type BlockAction, type DocumentAction, type FileAction, type FlashcardAction, type FsAction, type MascotAction, type NotebookAction, type SearchAction, type SystemAction, type TagAction, type ToolCategory, type ToolConfig } from "../tool-config";

    export let config: ToolConfig;
    export let groups: string[];
    export let focusGroup: string;
    export let permGroupLabel: string;
    export let notebooks: NotebookInfo[] = [];
    export let permissions: Record<string, NotebookPermission> = {};
    export let permLoading = true;
    export let getLabel: (key: string, fallback: string) => string;
    export let onChanged: (event: CustomEvent<ChangeEvent>) => void | Promise<void>;

    interface NotebookInfo { id: string; name: string; }
    interface ChangeEvent { key: string; value: any; }
    type GroupAction = FsAction | NotebookAction | DocumentAction | BlockAction | AvAction | FileAction | SearchAction | TagAction | SystemAction | FlashcardAction | MascotAction;
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
            category: "fs",
            icon: "📂",
            groupKey: "Filesystem",
            actions: [
                { key: "ls", title: "List Path", description: "List direct child documents with compact human-readable paths." },
                { key: "tree", title: "Document Tree", description: "List a recursive document tree using human-readable paths." },
                { key: "read", title: "Read Markdown", description: "Read a document as plain Markdown by human-readable path." },
                { key: "write", title: "Write Markdown", description: "Create a document or replace an existing document body with overwrite=true." },
                { key: "replace", title: "Replace Text", description: "Apply exact old/new text replacement edits inside one Markdown document." },
                { key: "rm", title: "Remove Document", description: "Delete a document by human-readable path." },
                { key: "mv", title: "Move Document", description: "Move or rename a document by human-readable paths." },
                { key: "search", title: "Search Path", description: "Search Markdown lines under a human-readable path." },
            ],
        },
        {
            category: "notebook",
            icon: "📚",
            groupKey: "Notebooks",
            actions: [
                { key: "list", title: "List Notebooks", description: "List all notebooks in the workspace." },
                { key: "create", title: "Create Notebook", description: "Create a new notebook." },
                { key: "set_open_state", title: "Open/Close Notebook", description: "Set notebook open state (open or close)." },
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
                { key: "lookup", title: "Lookup Document Reference", description: "Look up document IDs, storage paths, human-readable paths, and metadata." },
                { key: "get_child_blocks", title: "Get Child Blocks", description: "Get direct child blocks by document ID." },
                { key: "get_child_docs", title: "Get Child Documents", description: "Get direct child documents by document ID." },
                { key: "set_attr", title: "Set Document Metadata", description: "Set the icon or cover for a document or folder." },
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
                { key: "replace", title: "Replace Block Text", description: "Apply exact old/new text replacement edits inside one block." },
                { key: "delete", title: "Delete Block", description: "Delete a block." },
                { key: "move", title: "Move Block", description: "Move a block to a new position." },
                { key: "set_fold_state", title: "Fold/Unfold Block", description: "Set the fold state of a foldable block." },
                { key: "get_kramdown", title: "Get Block Kramdown", description: "Get block content in kramdown format." },
                { key: "get_children", title: "Get Child Blocks", description: "Get all child blocks of a parent." },
                { key: "transfer_references", title: "Transfer Block References", description: "Transfer block references." },
                { key: "set_attrs", title: "Set Block Attributes", description: "Set block attributes." },
                { key: "get_attrs", title: "Get Block Attributes", description: "Get block attributes." },
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
                { key: "render", title: "Render Database View", description: "Render database rows with optional view, pagination, and query context." },
                { key: "get_attribute_view_keys", title: "Get Database Keys", description: "Get keys or columns for a database." },
                { key: "get_attribute_view_filter_sort", title: "Get Database Filter Sort", description: "Get filters and sorts for a database block view." },
                { key: "search", title: "Search Databases", description: "Search attribute views by keyword." },
                { key: "add_rows", title: "Add Rows", description: "Add existing blocks as rows in a database." },
                { key: "remove_rows", title: "Remove Rows", description: "Remove bound rows from a database." },
                { key: "add_column", title: "Add Column", description: "Add a column to a database." },
                { key: "remove_column", title: "Remove Column", description: "Remove a column from a database." },
                { key: "set_cells", title: "Set Cells", description: "Update one or more cells with typed value payloads." },
                { key: "duplicate", title: "Duplicate Database Block", description: "Duplicate an existing database block." },
                { key: "get_primary_key_values", title: "Get Primary Key Values", description: "Get database primary key rows with optional filtering." },
            ],
        },
        {
            category: "file",
            icon: "📁",
            groupKey: "Files",
            actions: [
                { key: "upload_asset", title: "Upload Asset", description: "Read a local file path and upload that file to the assets directory. Files larger than the configured threshold must stop and ask the user before retrying with confirmLargeFile=true." },
                { key: "render", title: "Render Template", description: "Render a workspace template or Sprig template." },
                { key: "export_md", title: "Export Markdown Content", description: "Export document content as Markdown." },
                { key: "export_resources", title: "Export Resources", description: "Export resources as a ZIP archive." },
                { key: "list_unused_assets", title: "List Unused Assets", description: "List asset files not currently referenced." },
                { key: "get_doc_assets", title: "Get Document Assets", description: "List assets referenced by a document (supports filtering by asset type)." },
                { key: "get_image_ocr_text", title: "Get Image OCR Text", description: "Get stored OCR text for an image asset." },
                { key: "remove_unused_assets", title: "Remove Unused Assets", description: "Remove all unused asset files." },
                { key: "rename_asset", title: "Rename Asset", description: "Rename an asset file." },
                { key: "delete_asset", title: "Delete Asset", description: "Delete an asset file." },
            ],
        },
        {
            category: "search",
            icon: "🔍",
            groupKey: "Search",
            actions: [
                { key: "fulltext", title: "Full-text Search", description: "Search blocks across the workspace." },
                { key: "query_sql", title: "Query SQL", description: "Run read-only SQL queries against SiYuan data." },
                { key: "get_backlinks", title: "Get Backlinks", description: "Get backlinks or backmentions for a block or document." },
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
                { key: "conf", title: "Masked Config", description: "Get masked system configuration via summary-first progressive reading." },
                { key: "notify", title: "Notify", description: "Push an info or error notification message." },
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
                { key: "get_cards", title: "Get Cards", description: "List all cards in a flashcard deck with pagination." },
                { key: "review_card", title: "Review Card", description: "Submit a flashcard review rating." },
                { key: "create_card", title: "Create Card", description: "Turn existing blocks into flashcards by writing deck attrs and registering riff cards." },
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
                value: permLoading ? getLabel("mcpPermLoading", "Loading notebooks...") : getLabel("mcpPermEmpty", "No notebooks found."),
                title: "",
                description: "",
            }];
        }
        return notebooks.map((nb) => ({
            type: "select",
            key: `perm__${nb.id}`,
            value: permissions[nb.id] ?? "r",
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


    let permItems: ISettingItem[] = [];
    let fsItems: ISettingItem[] = [];
    let notebookItems: ISettingItem[] = [];
    let documentItems: ISettingItem[] = [];
    let blockItems: ISettingItem[] = [];
    let avItems: ISettingItem[] = [];
    let fileItems: ISettingItem[] = [];
    let searchItems: ISettingItem[] = [];
    let tagItems: ISettingItem[] = [];
    let systemItems: ISettingItem[] = [];
    let flashcardItems: ISettingItem[] = [];

    function buildCategoryItems(category: ToolCategory): ISettingItem[] {
        const definition = getGroupDefinition(category);
        return [buildToolToggleItem(definition), ...buildActionItems(definition)];
    }

    $: config, notebooks, permissions, permLoading, getLabel, permItems = buildPermItems();
    $: config, getLabel, fsItems = buildCategoryItems("fs");
    $: config, getLabel, notebookItems = buildCategoryItems("notebook");
    $: config, getLabel, documentItems = buildCategoryItems("document");
    $: config, getLabel, blockItems = buildCategoryItems("block");
    $: config, getLabel, avItems = buildCategoryItems("av");
    $: config, getLabel, fileItems = buildCategoryItems("file");
    $: config, getLabel, searchItems = buildCategoryItems("search");
    $: config, getLabel, tagItems = buildCategoryItems("tag");
    $: config, getLabel, systemItems = buildCategoryItems("system");
    $: config, getLabel, flashcardItems = buildCategoryItems("flashcard");
</script>

<SettingPanel group={permGroupLabel} settingItems={permItems} display={focusGroup === permGroupLabel} on:changed={onChanged} />
<SettingPanel group={groups[2]} settingItems={fsItems} display={focusGroup === groups[2]} on:changed={onChanged} />
<SettingPanel group={groups[3]} settingItems={notebookItems} display={focusGroup === groups[3]} on:changed={onChanged} />
<SettingPanel group={groups[4]} settingItems={documentItems} display={focusGroup === groups[4]} on:changed={onChanged} />
<SettingPanel group={groups[5]} settingItems={blockItems} display={focusGroup === groups[5]} on:changed={onChanged} />
<SettingPanel group={groups[6]} settingItems={avItems} display={focusGroup === groups[6]} on:changed={onChanged} />
<SettingPanel group={groups[7]} settingItems={fileItems} display={focusGroup === groups[7]} on:changed={onChanged} />
<SettingPanel group={groups[8]} settingItems={searchItems} display={focusGroup === groups[8]} on:changed={onChanged} />
<SettingPanel group={groups[9]} settingItems={tagItems} display={focusGroup === groups[9]} on:changed={onChanged} />
<SettingPanel group={groups[10]} settingItems={systemItems} display={focusGroup === groups[10]} on:changed={onChanged} />
<SettingPanel group={groups[11]} settingItems={flashcardItems} display={focusGroup === groups[11]} on:changed={onChanged} />

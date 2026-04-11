export const TOOL_CATEGORIES = ['notebook', 'document', 'block', 'av', 'file', 'search', 'tag', 'system', 'flashcard', 'mascot'] as const;

export type ToolCategory = typeof TOOL_CATEGORIES[number];

export const NOTEBOOK_ACTIONS = ['list', 'create', 'open', 'close', 'remove', 'rename', 'get_conf', 'set_conf', 'set_icon', 'get_permissions', 'set_permission', 'get_child_docs'] as const;
export const DOCUMENT_ACTIONS = ['create', 'rename', 'remove', 'move', 'get_path', 'get_hpath', 'get_ids', 'get_child_blocks', 'get_child_docs', 'set_icon', 'set_cover', 'clear_cover', 'list_tree', 'search_docs', 'get_doc', 'create_daily_note'] as const;
export const BLOCK_ACTIONS = ['insert', 'prepend', 'append', 'update', 'delete', 'move', 'fold', 'unfold', 'get_kramdown', 'get_children', 'transfer_ref', 'set_attrs', 'get_attrs', 'exists', 'info', 'breadcrumb', 'dom', 'recent_updated', 'word_count'] as const;
export const AV_ACTIONS = ['get', 'search', 'add_rows', 'remove_rows', 'add_column', 'remove_column', 'set_cell', 'batch_set_cells', 'duplicate_block', 'get_primary_key_values'] as const;
export const FILE_ACTIONS = ['upload_asset', 'render_template', 'render_sprig', 'export_md', 'export_resources'] as const;
export const SEARCH_ACTIONS = ['fulltext', 'query_sql', 'search_tag', 'get_backlinks', 'get_backmentions'] as const;
export const TAG_ACTIONS = ['list', 'rename', 'remove'] as const;
export const SYSTEM_ACTIONS = ['workspace_info', 'network', 'changelog', 'conf', 'sys_fonts', 'boot_progress', 'push_msg', 'push_err_msg', 'get_version', 'get_current_time'] as const;
export const FLASHCARD_ACTIONS = ['list_cards', 'get_decks', 'get_cards', 'review_card', 'skip_review_card', 'add_card', 'remove_card'] as const;
export const MASCOT_ACTIONS = ['get_balance', 'shop', 'buy'] as const;

export type NotebookAction = typeof NOTEBOOK_ACTIONS[number];
export type DocumentAction = typeof DOCUMENT_ACTIONS[number];
export type BlockAction = typeof BLOCK_ACTIONS[number];
export type AvAction = typeof AV_ACTIONS[number];
export type FileAction = typeof FILE_ACTIONS[number];
export type SearchAction = typeof SEARCH_ACTIONS[number];
export type TagAction = typeof TAG_ACTIONS[number];
export type SystemAction = typeof SYSTEM_ACTIONS[number];
export type FlashcardAction = typeof FLASHCARD_ACTIONS[number];
export type MascotAction = typeof MASCOT_ACTIONS[number];

export type ToolActionMap = {
    notebook: NotebookAction;
    document: DocumentAction;
    block: BlockAction;
    av: AvAction;
    file: FileAction;
    search: SearchAction;
    tag: TagAction;
    system: SystemAction;
    flashcard: FlashcardAction;
    mascot: MascotAction;
};

export interface CategoryToolConfig<Action extends string = string> {
    enabled: boolean;
    actions: Record<Action, boolean>;
}

export interface FileCategoryToolConfig<Action extends string = string> extends CategoryToolConfig<Action> {
    uploadLargeFileThresholdMB: number;
}

export type ToolConfig = {
    notebook: CategoryToolConfig<NotebookAction>;
    document: CategoryToolConfig<DocumentAction>;
    block: CategoryToolConfig<BlockAction>;
    av: CategoryToolConfig<AvAction>;
    file: FileCategoryToolConfig<FileAction>;
    search: CategoryToolConfig<SearchAction>;
    tag: CategoryToolConfig<TagAction>;
    system: CategoryToolConfig<SystemAction>;
    flashcard: CategoryToolConfig<FlashcardAction>;
    mascot: CategoryToolConfig<MascotAction>;
    userRulesText: string;
};

export const LEGACY_TOOL_TO_ACTION: Record<string, { category: ToolCategory; action: string }> = {
    list_notebooks: { category: 'notebook', action: 'list' },
    create_notebook: { category: 'notebook', action: 'create' },
    open_notebook: { category: 'notebook', action: 'open' },
    close_notebook: { category: 'notebook', action: 'close' },
    remove_notebook: { category: 'notebook', action: 'remove' },
    rename_notebook: { category: 'notebook', action: 'rename' },
    get_notebook_conf: { category: 'notebook', action: 'get_conf' },
    set_notebook_conf: { category: 'notebook', action: 'set_conf' },

    create_document: { category: 'document', action: 'create' },
    rename_document: { category: 'document', action: 'rename' },
    rename_document_by_id: { category: 'document', action: 'rename' },
    remove_document: { category: 'document', action: 'remove' },
    remove_document_by_id: { category: 'document', action: 'remove' },
    move_documents: { category: 'document', action: 'move' },
    move_documents_by_id: { category: 'document', action: 'move' },
    get_document_path: { category: 'document', action: 'get_path' },
    get_hpath_by_path: { category: 'document', action: 'get_hpath' },
    get_hpath_by_id: { category: 'document', action: 'get_hpath' },
    get_ids_by_hpath: { category: 'document', action: 'get_ids' },
    list_doc_tree: { category: 'document', action: 'list_tree' },
    search_docs: { category: 'document', action: 'search_docs' },
    get_doc: { category: 'document', action: 'get_doc' },
    create_daily_note: { category: 'document', action: 'create_daily_note' },

    insert_block: { category: 'block', action: 'insert' },
    prepend_block: { category: 'block', action: 'prepend' },
    append_block: { category: 'block', action: 'append' },
    update_block: { category: 'block', action: 'update' },
    delete_block: { category: 'block', action: 'delete' },
    move_block: { category: 'block', action: 'move' },
    fold_block: { category: 'block', action: 'fold' },
    unfold_block: { category: 'block', action: 'unfold' },
    get_block_kramdown: { category: 'block', action: 'get_kramdown' },
    get_child_blocks: { category: 'block', action: 'get_children' },
    transfer_block_ref: { category: 'block', action: 'transfer_ref' },
    set_block_attrs: { category: 'block', action: 'set_attrs' },
    get_block_attrs: { category: 'block', action: 'get_attrs' },
    check_block_exist: { category: 'block', action: 'exists' },
    get_block_info: { category: 'block', action: 'info' },
    get_block_breadcrumb: { category: 'block', action: 'breadcrumb' },
    get_block_dom: { category: 'block', action: 'dom' },
    get_recent_updated_blocks: { category: 'block', action: 'recent_updated' },
    get_blocks_word_count: { category: 'block', action: 'word_count' },

    get_attribute_view: { category: 'av', action: 'get' },
    search_attribute_view: { category: 'av', action: 'search' },
    add_attribute_view_blocks: { category: 'av', action: 'add_rows' },
    remove_attribute_view_blocks: { category: 'av', action: 'remove_rows' },
    add_attribute_view_key: { category: 'av', action: 'add_column' },
    remove_attribute_view_key: { category: 'av', action: 'remove_column' },
    set_attribute_view_block_attr: { category: 'av', action: 'set_cell' },
    batch_set_attribute_view_block_attrs: { category: 'av', action: 'batch_set_cells' },
    duplicate_attribute_view_block: { category: 'av', action: 'duplicate_block' },
    get_attribute_view_primary_key_values: { category: 'av', action: 'get_primary_key_values' },

    upload_asset: { category: 'file', action: 'upload_asset' },
    render_template: { category: 'file', action: 'render_template' },
    render_sprig: { category: 'file', action: 'render_sprig' },
    export_md_content: { category: 'file', action: 'export_md' },
    export_resources: { category: 'file', action: 'export_resources' },
    push_msg: { category: 'system', action: 'push_msg' },
    push_err_msg: { category: 'system', action: 'push_err_msg' },
    get_version: { category: 'system', action: 'get_version' },
    get_current_time: { category: 'system', action: 'get_current_time' },
    get_tag: { category: 'tag', action: 'list' },
    rename_tag: { category: 'tag', action: 'rename' },
    remove_tag: { category: 'tag', action: 'remove' },
    get_workspace_info: { category: 'system', action: 'workspace_info' },
    get_network: { category: 'system', action: 'network' },
    get_changelog: { category: 'system', action: 'changelog' },
    get_system_conf: { category: 'system', action: 'conf' },
    get_sys_fonts: { category: 'system', action: 'sys_fonts' },
    get_boot_progress: { category: 'system', action: 'boot_progress' },
    list_flashcards: { category: 'flashcard', action: 'list_cards' },
    get_flashcard_decks: { category: 'flashcard', action: 'get_decks' },
    get_flashcard_cards: { category: 'flashcard', action: 'get_cards' },
    review_flashcard: { category: 'flashcard', action: 'review_card' },
    skip_flashcard_review: { category: 'flashcard', action: 'skip_review_card' },
    add_flashcard: { category: 'flashcard', action: 'add_card' },
    remove_flashcard: { category: 'flashcard', action: 'remove_card' },
    get_mascot_balance: { category: 'mascot', action: 'get_balance' },
    get_mascot_shop: { category: 'mascot', action: 'shop' },
    buy_mascot_item: { category: 'mascot', action: 'buy' },
};

export const ACTIONS_BY_CATEGORY: { [Category in ToolCategory]: readonly ToolActionMap[Category][] } = {
    notebook: NOTEBOOK_ACTIONS,
    document: DOCUMENT_ACTIONS,
    block: BLOCK_ACTIONS,
    av: AV_ACTIONS,
    file: FILE_ACTIONS,
    search: SEARCH_ACTIONS,
    tag: TAG_ACTIONS,
    system: SYSTEM_ACTIONS,
    flashcard: FLASHCARD_ACTIONS,
    mascot: MASCOT_ACTIONS,
};

export type ActionTier = 'basic' | 'advanced';

const ACTION_TIERS: Record<ToolCategory, Record<string, ActionTier>> = {
    notebook: {
        list: 'basic', create: 'basic', open: 'basic', close: 'basic',
        rename: 'basic', get_conf: 'basic', get_child_docs: 'basic',
        remove: 'advanced', set_conf: 'advanced', set_icon: 'advanced',
        get_permissions: 'advanced', set_permission: 'advanced',
    },
    document: {
        create: 'basic', get_doc: 'basic', get_path: 'basic', get_hpath: 'basic',
        get_ids: 'basic', get_child_blocks: 'basic', get_child_docs: 'basic',
        search_docs: 'basic', rename: 'basic',
        remove: 'advanced', move: 'advanced', set_icon: 'advanced',
        set_cover: 'advanced', clear_cover: 'advanced',
        list_tree: 'advanced', create_daily_note: 'advanced',
    },
    block: {
        get_kramdown: 'basic', get_children: 'basic', get_attrs: 'basic',
        exists: 'basic', info: 'basic', append: 'basic', prepend: 'basic',
        insert: 'basic', update: 'basic',
        delete: 'advanced', move: 'advanced', fold: 'advanced', unfold: 'advanced',
        transfer_ref: 'advanced', set_attrs: 'advanced', breadcrumb: 'advanced',
        dom: 'advanced', recent_updated: 'advanced', word_count: 'advanced',
    },
    av: {
        get: 'basic', search: 'basic', get_primary_key_values: 'basic',
        add_rows: 'advanced', remove_rows: 'advanced', add_column: 'advanced',
        remove_column: 'advanced', set_cell: 'advanced', batch_set_cells: 'advanced',
        duplicate_block: 'advanced',
    },
    file: {
        export_md: 'basic', upload_asset: 'basic',
        render_template: 'advanced', render_sprig: 'advanced',
        export_resources: 'advanced',
    },
    search: {
        fulltext: 'basic', query_sql: 'basic',
        search_tag: 'basic', get_backlinks: 'basic', get_backmentions: 'basic',
    },
    tag: {
        list: 'basic', rename: 'basic',
        remove: 'advanced',
    },
    system: {
        get_version: 'basic', get_current_time: 'basic', conf: 'basic',
        boot_progress: 'basic',
        workspace_info: 'advanced', network: 'advanced', changelog: 'advanced',
        sys_fonts: 'advanced', push_msg: 'advanced', push_err_msg: 'advanced',
    },
    flashcard: {
        list_cards: 'basic', get_decks: 'basic', get_cards: 'basic',
        review_card: 'advanced', skip_review_card: 'advanced',
        add_card: 'advanced', remove_card: 'advanced',
    },
    mascot: {
        get_balance: 'basic', shop: 'basic', buy: 'basic',
    },
};

export function getActionTier(category: ToolCategory, action: string): ActionTier {
    return ACTION_TIERS[category]?.[action] ?? 'advanced';
}

export const DANGEROUS_ACTIONS: Record<ToolCategory, Set<string>> = {
    notebook: new Set(['remove', 'set_permission']),
    document: new Set(['remove', 'move']),
    block: new Set(['delete', 'move']),
    av: new Set(),
    file: new Set(['upload_asset']),
    search: new Set(),
    tag: new Set(['remove']),
    system: new Set(['workspace_info']),
    flashcard: new Set(['remove_card']),
    mascot: new Set(),
};

const createActionsRecord = <Action extends string>(
    actions: readonly Action[],
    enabledByDefault: readonly Action[],
): Record<Action, boolean> => {
    const enabledSet = new Set(enabledByDefault);
    return actions.reduce((acc, action) => {
        acc[action] = enabledSet.has(action);
        return acc;
    }, {} as Record<Action, boolean>);
};

export function buildDefaultToolConfig(): ToolConfig {
    return {
        notebook: {
            enabled: true,
            actions: createActionsRecord(NOTEBOOK_ACTIONS, ['list', 'create', 'open', 'close', 'rename', 'get_conf', 'set_conf', 'set_icon', 'get_permissions', 'get_child_docs']),
        },
        document: {
            enabled: true,
            actions: createActionsRecord(DOCUMENT_ACTIONS, ['create', 'rename', 'move', 'get_path', 'get_hpath', 'get_ids', 'get_child_blocks', 'get_child_docs', 'set_icon', 'set_cover', 'clear_cover', 'list_tree', 'search_docs', 'get_doc', 'create_daily_note']),
        },
        block: {
            enabled: true,
            actions: createActionsRecord(BLOCK_ACTIONS, ['insert', 'prepend', 'append', 'update', 'move', 'fold', 'unfold', 'get_kramdown', 'get_children', 'transfer_ref', 'set_attrs', 'get_attrs', 'exists', 'info', 'breadcrumb', 'dom', 'recent_updated', 'word_count']),
        },
        av: {
            enabled: true,
            actions: createActionsRecord(AV_ACTIONS, ['get', 'search', 'add_rows', 'remove_rows', 'add_column', 'remove_column', 'set_cell', 'batch_set_cells', 'duplicate_block', 'get_primary_key_values']),
        },
        file: {
            enabled: true,
            actions: createActionsRecord(FILE_ACTIONS, ['upload_asset', 'render_template', 'render_sprig', 'export_md', 'export_resources']),
            uploadLargeFileThresholdMB: 10,
        },
        search: {
            enabled: true,
            actions: createActionsRecord(SEARCH_ACTIONS, ['fulltext', 'query_sql', 'search_tag', 'get_backlinks', 'get_backmentions']),
        },
        tag: {
            enabled: true,
            actions: createActionsRecord(TAG_ACTIONS, ['list', 'rename', 'remove']),
        },
        system: {
            enabled: true,
            actions: createActionsRecord(SYSTEM_ACTIONS, ['network', 'changelog', 'conf', 'sys_fonts', 'boot_progress', 'push_msg', 'push_err_msg', 'get_version', 'get_current_time']),
        },
        flashcard: {
            enabled: true,
            actions: createActionsRecord(FLASHCARD_ACTIONS, ['list_cards', 'get_decks', 'get_cards', 'review_card', 'skip_review_card', 'add_card', 'remove_card']),
        },
        mascot: {
            enabled: true,
            actions: createActionsRecord(MASCOT_ACTIONS, ['get_balance', 'shop', 'buy']),
        },
        userRulesText: 'After creating a document or daily note, proactively set an icon.',
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeUploadLargeFileThresholdMB(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 10;
    const normalized = Math.floor(value);
    if (normalized < 1) return 1;
    if (normalized > 1024) return 1024;
    return normalized;
}

function setActionValue(config: ToolConfig, category: ToolCategory, action: string, enabled: boolean) {
    if (action in config[category].actions) {
        config[category].actions[action as ToolActionMap[typeof category]] = enabled;
    }
}

function resolveActionName(category: ToolCategory, candidate: string): string | null {
    if ((ACTIONS_BY_CATEGORY[category] as readonly string[]).includes(candidate)) {
        return candidate;
    }
    const legacy = LEGACY_TOOL_TO_ACTION[candidate];
    if (legacy?.category === category) {
        return legacy.action;
    }
    return null;
}

function applyLegacyFlatConfig(config: ToolConfig, raw: Record<string, unknown>) {
    const grouped = new Map<string, boolean[]>();

    for (const [key, value] of Object.entries(raw)) {
        if (typeof value !== 'boolean') continue;
        const mapping = LEGACY_TOOL_TO_ACTION[key];
        if (!mapping) continue;
        const groupKey = `${mapping.category}:${mapping.action}`;
        const current = grouped.get(groupKey) ?? [];
        current.push(value);
        grouped.set(groupKey, current);
    }

    for (const category of TOOL_CATEGORIES) {
        const categoryGroups = [...grouped.entries()].filter(([groupKey]) => groupKey.startsWith(`${category}:`));
        if (categoryGroups.length === 0) continue;

        for (const action of ACTIONS_BY_CATEGORY[category]) {
            config[category].actions[action] = false;
        }

        for (const [groupKey, values] of categoryGroups) {
            const action = groupKey.split(':')[1];
            setActionValue(config, category, action, values.some(Boolean));
        }

        config[category].enabled = getEnabledActions(config[category]).length > 0;
    }
}

function applyLegacyCategoryConfig(config: ToolConfig, raw: Record<string, unknown>) {
    for (const category of TOOL_CATEGORIES) {
        const categoryValue = raw[category];
        if (typeof categoryValue === 'boolean') {
            config[category].enabled = categoryValue;
            continue;
        }

        if (!Array.isArray(categoryValue)) continue;

        for (const action of ACTIONS_BY_CATEGORY[category]) {
            config[category].actions[action] = false;
        }

        for (const entry of categoryValue) {
            if (typeof entry !== 'string') continue;
            const action = resolveActionName(category, entry);
            if (action) setActionValue(config, category, action, true);
        }

        config[category].enabled = getEnabledActions(config[category]).length > 0;
    }
}

function applyNestedConfig(config: ToolConfig, raw: Record<string, unknown>) {
    if (typeof raw.userRulesText === 'string') {
        config.userRulesText = raw.userRulesText;
    }

    for (const category of TOOL_CATEGORIES) {
        const categoryValue = raw[category];
        if (!isRecord(categoryValue)) continue;
        if (typeof categoryValue.enabled === 'boolean') {
            config[category].enabled = categoryValue.enabled;
        }
        if (category === 'file' && 'uploadLargeFileThresholdMB' in categoryValue) {
            config.file.uploadLargeFileThresholdMB = normalizeUploadLargeFileThresholdMB(categoryValue.uploadLargeFileThresholdMB);
        }
        if (!isRecord(categoryValue.actions)) continue;
        for (const action of ACTIONS_BY_CATEGORY[category]) {
            const value = categoryValue.actions[action];
            if (typeof value === 'boolean') {
                config[category].actions[action] = value;
            }
        }
    }
}

export function normalizeToolConfig(raw: unknown): ToolConfig {
    const config = buildDefaultToolConfig();
    if (!isRecord(raw)) return config;

    if (typeof raw.userRulesText === 'string') {
        config.userRulesText = raw.userRulesText;
    }

    const hasNestedConfig = TOOL_CATEGORIES.some(
        cat => isRecord(raw[cat]) && isRecord((raw[cat] as Record<string, unknown>).actions),
    );

    if (hasNestedConfig) {
        // Nested config is the canonical format — ignore legacy keys
        applyNestedConfig(config, raw);
    } else {
        // No nested config found — migrate from legacy formats
        applyLegacyCategoryConfig(config, raw);
        applyLegacyFlatConfig(config, raw);
    }

    for (const category of TOOL_CATEGORIES) {
        if (!config[category].enabled) continue;
        if (getEnabledActions(config[category]).length === 0) {
            config[category].enabled = false;
        }
    }

    return config;
}

export function getEnabledActions(categoryConfig: CategoryToolConfig<string>): string[] {
    return Object.entries(categoryConfig.actions)
        .filter(([, enabled]) => enabled)
        .map(([action]) => action);
}

export function isDangerousAction(category: ToolCategory, action: string): boolean {
    return DANGEROUS_ACTIONS[category].has(action);
}

export function formatDangerousActionsList(): string[] {
    const lines: string[] = [];
    for (const category of TOOL_CATEGORIES) {
        const actions = DANGEROUS_ACTIONS[category];
        if (actions.size === 0) continue;
        const items = [...actions].map(a => `\`${category}(action="${a}")\``);
        lines.push(`- ${items.join(', ')}`);
    }
    return lines;
}

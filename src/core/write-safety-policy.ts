import {
    ACTIONS_BY_CATEGORY,
    isAllowlistedNativeExtensionRead,
    type ToolActionMap,
    type ToolCategory,
} from './config';

export type WritePrecondition = 'none' | 'state' | 'structure' | 'value' | 'manifest' | 'source';

export type ActionSafetyPolicy =
    | { mode: 'read' }
    | { mode: 'external' }
    | {
        mode: 'mutation';
        precondition: WritePrecondition;
        validateOnly: boolean;
    };

const read = (): ActionSafetyPolicy => ({ mode: 'read' });
const external = (): ActionSafetyPolicy => ({ mode: 'external' });
const mutation = (
    precondition: WritePrecondition = 'none',
    validateOnly = precondition !== 'none',
): ActionSafetyPolicy => ({ mode: 'mutation', precondition, validateOnly });

/**
 * Sisyphus 自有动作的权威安全分类。若只在 config.ts 新增动作而未在此登记，
 * 类型检查或测试必须失败，禁止静默暴露未受保护的修改动作。
 */
export const ACTION_SAFETY_POLICIES: {
    [Category in ToolCategory]: Record<ToolActionMap[Category], ActionSafetyPolicy>;
} = {
    fs: {
        ls: read(), tree: read(), read: read(), search: read(),
        write: mutation('state'), replace: mutation('manifest'), rm: mutation('state'),
        mv: mutation('structure'), reorder: mutation('structure'),
    },
    notebook: {
        list: read(), get_conf: read(), get_permissions: read(), get_child_docs: read(),
        create: mutation(), set_open_state: mutation('state'), remove: mutation('state'), rename: mutation('state'),
        set_conf: mutation('state'), set_icon: mutation('state'), set_permission: mutation('state'),
    },
    document: {
        lookup: read(), get_child_blocks: read(), get_child_docs: read(), get_child_sort_mode: read(), list_tree: read(), search_docs: read(),
        get_doc: read(), get_outline: read(),
        create: mutation(), create_daily_note: mutation(), duplicate: mutation('state'), rename: mutation('state'),
        remove: mutation('state'), move: mutation('structure'), reorder: mutation('structure'), set_child_sort_mode: mutation('state'), set_attr: mutation('state'),
        heading_to_doc: mutation('structure'), doc_to_heading: mutation('structure'),
    },
    block: {
        get_kramdown: read(), batch_kramdown: read(), get_children: read(), get_attrs: read(), info: read(),
        breadcrumb: read(), dom: read(), recent_updated: read(), word_count: read(), docs_info: read(),
        insert: mutation(), prepend: mutation(), append: mutation(), add_to_daily_note: mutation(),
        update: mutation('state'), replace: mutation('state'), delete: mutation('state'), move: mutation('structure'),
        set_fold_state: mutation('state'), transfer_references: mutation('manifest'), set_attrs: mutation('state'),
    },
    av: {
        get: read(), render: mutation(), get_attribute_view_keys: read(), get_attribute_view_filter_sort: read(),
        search: read(), get_primary_key_values: read(),
        rename: mutation('state'), add_rows: mutation(), remove_rows: mutation('manifest'), add_column: mutation('state'),
        remove_column: mutation('state'), set_cells: mutation('manifest'), duplicate: mutation('state'),
    },
    file: {
        list_templates: read(), read_template: read(), render: read(), export_md: read(), list_unused_assets: read(),
        get_doc_assets: read(), identify_project: read(), resolve_project_source: read(), read_project_source: read(), list_project_sources: read(),
        register_project_source: mutation('state'), scan_project_manifest: mutation('state'),
        upload_asset: mutation('source'), create_template: mutation('state'), update_template: mutation('state'),
        delete_template: mutation('state'), save_doc_as_template: mutation('state'), export_resources: external(),
        remove_unused_assets: mutation('manifest'), rename_asset: mutation('state'), delete_asset: mutation('state'),
        extract_doc: external(),
    },
    search: {
        fulltext: read(), semantic: read(), knowledge: read(), check_anchor: read(), query_sql: read(), get_backlinks: read(), search_refs: read(), search_assets: read(),
        fulltext_asset_content: read(), list_invalid_refs: read(), find_replace: mutation('manifest'),
        criteria_list: read(), criteria_save: mutation('state'), criteria_remove: mutation('state'),
    },
    tag: { list: read(), rename: mutation('manifest'), remove: mutation('manifest') },
    timeline: {
        list_nodes: read(), compare_node: read(), compare_recent: read(), create_node: mutation(), delete_node: mutation('state'),
        rollback_document: mutation('state'), rollback_block: mutation('state'),
    },
    system: {
        workspace_info: read(), network: read(), conf: read(), changelog: read(), get_version: read(),
        get_current_time: read(), bootstrap: read(), audit_environment: read(), validate_source_audit: read(), list_packages: read(),
        search_bazaar: read(), get_bazaar_package: read(), read_bazaar_readme: read(), get_plugin: read(),
        list_plugin_updates: read(), list_snippets: read(), list_plugin_storage: read(), read_plugin_storage: read(),
        inspect_plugin: read(), list_control_changes: read(), get_control_change: read(),
        plan_change: mutation(), apply_change: mutation('state'), rollback_change: mutation('state'),
        discard_change_plan: mutation('state'), notify: external(), perform_sync: external(),
    },
    flashcard: {
        list_cards: read(), get_decks: read(), get_cards: read(), review_card: mutation('state'),
        create_card: mutation(), remove_card: mutation('state'),
    },
    extension: { list: read() },
    mascot: { get_balance: read(), shop: read(), buy: mutation('state') },
    feedback: { submit: external() },
    provenance: {
        register_session: mutation('state'), record_event: mutation('state'),
        discover_session: read(),
        list_project_sessions: read(), list_atom_events: read(), resolve_session_link: read(), validate_session: read(),
    },
};

export const PRECONDITION_FIELD: Record<Exclude<WritePrecondition, 'none'>, string> = {
    state: 'expectedStateHash',
    structure: 'expectedStructureHash',
    value: 'expectedValueHash',
    manifest: 'expectedManifestHash',
    source: 'expectedSourceHash',
};

export function getActionSafetyPolicy(
    category: ToolCategory,
    action: string,
    args: Record<string, unknown> = {},
): ActionSafetyPolicy {
    if (category === 'extension' && action !== 'list' && action !== 'help') {
        const forwardedArgs = args.arguments !== null
            && typeof args.arguments === 'object'
            && !Array.isArray(args.arguments)
            ? args.arguments as Record<string, unknown>
            : {};
        return isAllowlistedNativeExtensionRead(action, forwardedArgs) ? read() : external();
    }
    const policy = (ACTION_SAFETY_POLICIES[category] as Record<string, ActionSafetyPolicy>)[action];
    if (!policy) return read();

    // 新建 fs 文档属于增量写入；overwrite=true 会修改既有文档，必须具备当前状态前置条件。
    if (category === 'fs' && action === 'write' && args.overwrite !== true) {
        return mutation();
    }
    if (category === 'file' && action === 'create_template' && args.overwrite !== true) {
        return mutation();
    }
    // renderAttributeView 默认为只读；仅当调用方明确要求内核创建缺失数据库时才属于修改。
    if (category === 'av' && action === 'render') {
        return args.createIfNotExist === true ? mutation() : read();
    }
    return policy;
}

export function assertActionSafetyPoliciesComplete(): void {
    for (const [category, actions] of Object.entries(ACTIONS_BY_CATEGORY) as Array<[
        ToolCategory,
        readonly string[],
    ]>) {
        const policies = ACTION_SAFETY_POLICIES[category] as Record<string, ActionSafetyPolicy>;
        for (const action of actions) {
            if (!policies[action]) throw new Error(`Missing write-safety policy for ${category}.${action}.`);
        }
    }
}

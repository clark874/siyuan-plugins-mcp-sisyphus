import {
    AV_ACTIONS,
    BLOCK_ACTIONS,
    DOCUMENT_ACTIONS,
    FILE_ACTIONS,
    FLASHCARD_ACTIONS,
    MASCOT_ACTIONS,
    NOTEBOOK_ACTIONS,
    SEARCH_ACTIONS,
    SYSTEM_ACTIONS,
    TAG_ACTIONS,
} from '../setting/tool-config';

export type PuppyState = 'idle' | 'reading' | 'writing' | 'deleting' | 'moving' | 'dangerous';
export type ToolVariant = 'none' | 'notebook' | 'document' | 'block' | 'av' | 'file' | 'search' | 'tag' | 'system' | 'flashcard' | 'mascot';
export type TestActionEntry = { tool: Exclude<ToolVariant, 'none'>; action: string };

export const TOOL_VARIANTS = new Set<ToolVariant>(['notebook', 'document', 'block', 'av', 'file', 'search', 'tag', 'system', 'flashcard', 'mascot']);

const READING_ACTIONS = new Set([
    'get_kramdown', 'get_children', 'get_attrs', 'exists', 'info', 'breadcrumb',
    'dom', 'word_count', 'recent_updated', 'resolve',
    'get_child_blocks', 'get_child_docs', 'search_docs', 'get_doc', 'list_tree',
    'list', 'get_conf', 'get_permissions', 'conf', 'get_version',
    'get_current_time', 'boot_progress', 'network', 'changelog', 'sys_fonts',
    'fulltext', 'query_sql', 'search_tag', 'get_backlinks', 'get_backmentions',
    'get', 'render_attribute_view', 'get_attribute_view_keys', 'get_attribute_view_filter_sort',
    'search', 'get_primary_key_values', 'get_doc_assets', 'get_image_ocr_text',
    'list_unused_assets', 'list_cards', 'get_decks', 'get_cards', 'get_balance', 'shop',
]);

const BUILD_ACTIONS = new Set([
    'insert', 'prepend', 'append', 'create', 'create_daily_note', 'duplicate_block',
]);

const EDIT_ACTIONS = new Set([
    'update', 'rename', 'set_attrs', 'transfer_ref', 'set_fold_state',
    'set_icon', 'set_cover', 'set_conf', 'push_msg', 'push_err_msg', 'set_open_state',
    'render_template', 'render_sprig', 'rename_tag', 'buy',
    'review_card', 'skip_review_card', 'create_card', 'add_card',
    'add_rows', 'remove_rows', 'add_column', 'remove_column', 'set_cells',
]);

const DELETING_ACTIONS = new Set(['delete', 'remove', 'remove_card']);
const MOVING_ACTIONS = new Set(['move']);
const DANGEROUS_ACTIONS = new Set(['set_permission', 'upload_asset', 'workspace_info']);

export const RANDOM_TEST_ACTIONS: TestActionEntry[] = [
    ...NOTEBOOK_ACTIONS.map((action) => ({ tool: 'notebook' as const, action })),
    ...DOCUMENT_ACTIONS.map((action) => ({ tool: 'document' as const, action })),
    ...BLOCK_ACTIONS.map((action) => ({ tool: 'block' as const, action })),
    ...AV_ACTIONS.map((action) => ({ tool: 'av' as const, action })),
    ...FILE_ACTIONS.map((action) => ({ tool: 'file' as const, action })),
    ...SEARCH_ACTIONS.map((action) => ({ tool: 'search' as const, action })),
    ...TAG_ACTIONS.map((action) => ({ tool: 'tag' as const, action })),
    ...SYSTEM_ACTIONS.map((action) => ({ tool: 'system' as const, action })),
    ...FLASHCARD_ACTIONS.map((action) => ({ tool: 'flashcard' as const, action })),
    ...MASCOT_ACTIONS.map((action) => ({ tool: 'mascot' as const, action })),
];

export function resolveActionState(action: string): PuppyState {
    if (DANGEROUS_ACTIONS.has(action)) return 'dangerous';
    if (DELETING_ACTIONS.has(action)) return 'deleting';
    if (MOVING_ACTIONS.has(action)) return 'moving';
    if (BUILD_ACTIONS.has(action) || EDIT_ACTIONS.has(action)) return 'writing';
    if (READING_ACTIONS.has(action)) return 'reading';
    return 'reading';
}

export function resolveToolVariant(tool: string): ToolVariant {
    return TOOL_VARIANTS.has(tool as ToolVariant) ? (tool as ToolVariant) : 'none';
}

import {
    ACTIONS_BY_CATEGORY,
    type AvAction,
    type BlockAction,
    type DocumentAction,
    type FileAction,
    type FsAction,
    type NotebookAction,
    type ProjectAction,
    type ProvenanceAction,
    type SearchAction,
    type SystemAction,
    type TagAction,
    type TimelineAction,
    type ToolCategory,
} from './config';
import { CHANGELOG_RESOURCE_URI } from './changelog';

export const FS_GUIDANCE = [
    'Use human-readable workspace paths such as /Notebook/Folder/Doc.',
    'Prefer fs for ordinary Markdown reads and writes; use block or av for native structures.',
    'Read before replacing or overwriting, and use the strict write preflight contract.',
];
export const NOTEBOOK_GUIDANCE = [
    'Use notebook IDs for configuration, permission, and root-child reads.',
    'Closed or initializing notebooks may require opening in SiYuan before child documents are available.',
];
export const DOCUMENT_GUIDANCE = [
    'Use lookup to resolve stable IDs and storage paths before advanced document operations.',
    'For create, path is notebook-local; do not include the notebook name or a leading duplicate title heading.',
    'Use get_doc windows or get_outline instead of requesting an unbounded document body.',
];
export const BLOCK_GUIDANCE = [
    'Read the target block before update, replace, move, or attribute changes.',
    'Use append, prepend, or insert for multi-block Markdown; use update for one block.',
    'Strict writes require validateOnly preflight followed by the issued request ID and matching state credential.',
];
export const AV_GUIDANCE = [
    'Discover the AV schema before changing rows, columns, or cells.',
    'Use returned rowID and columnID values; do not infer database identifiers.',
    'After a mutation, reread the affected AV state.',
];
export const FILE_GUIDANCE = [
    'File actions are limited to registered text-only project sources.',
    'Register the exact project root and explicit coreFiles before scanning or reading.',
    'Binary, image, OCR, archive, template, asset, import, and export workflows are outside this MCP surface.',
];
export const PROJECT_GUIDANCE = [
    'Use project.snapshot as the bounded machine-readable project recovery view.',
    'Provide exactly one of cwd, projectId, or projectName.',
];
export const SEARCH_GUIDANCE = [
    'Use knowledge for governed retrieval, fulltext for lexical search, semantic for embedding candidates, and query_sql for bounded read-only SQL.',
    'find_replace is the mutating exception and must follow strict write preflight.',
    'Asset filename, OCR, and asset-content search are intentionally excluded.',
];
export const TAG_GUIDANCE = [
    'List tags before rename or remove, then reread the global tag state after mutation.',
];
export const TIMELINE_GUIDANCE = [
    'Timeline supports listing nodes, creating nodes, and read-only comparisons.',
    'Deletion and rollback actions are intentionally excluded from the MCP surface.',
];
export const SYSTEM_GUIDANCE = [
    'Use bootstrap for connection, permissions, capability, path, and skill-entry discovery.',
    'Use audit_environment for a compact masked environment check and changelog for upgrade impact.',
];
export const EXTENSION_GUIDANCE = [
    'Only the approved native read-only allowlist and approved plugin tools are exposed.',
    'Use extension(action="list", refresh=true) to refresh official MCP discovery.',
];
export const PROVENANCE_GUIDANCE = [
    'Pass the calling Agent session explicitly; shared servers cannot infer concurrent client identity.',
    'Use occurredAt for chronology and stable block references for atom evidence.',
];

export const FS_ACTION_HINTS: Partial<Record<FsAction, string>> = {
    read: 'Returns complete display-block windows with outline and continuation metadata.',
    write: 'Creates a missing document; overwrite of existing content requires strict state validation.',
    replace: 'Use exact old/new text copied from fs.read.',
    rm: 'Requires explicit user confirmation and strict state validation.',
    mv: 'Moves or renames by human-readable paths.',
};
export const NOTEBOOK_ACTION_HINTS: Partial<Record<NotebookAction, string>> = {
    get_permissions: 'Omit notebook or pass notebook="all" for every visible notebook.',
    get_child_docs: 'Returns direct root children for one notebook ID.',
};
export const DOCUMENT_ACTION_HINTS: Partial<Record<DocumentAction, string>> = {
    create: 'Use notebook plus a notebook-local path or parentPath plus title.',
    lookup: 'Resolve one ID, storage path, or human-readable path reference.',
    move: 'Use stable IDs or storage paths returned by lookup.',
    reorder: 'Provide the complete intended direct-child order.',
    get_doc: 'Read complete block windows and continue with nextWindow.',
    get_outline: 'Returns the native heading tree without reading the body.',
};
export const BLOCK_ACTION_HINTS: Partial<Record<BlockAction, string>> = {
    insert: 'Provide nextID, previousID, or parentID.',
    append: 'Append Markdown to a document or block parent.',
    update: 'Replace one block while preserving governed attributes.',
    replace: 'Copy exact old text from get_kramdown.',
    move: 'Provide stable block IDs and a destination selector.',
    batch_kramdown: 'Reads up to 20 blocks while preserving order and per-item errors.',
    set_attrs: 'Use one id plus attrs or an atomic items batch.',
};
export const AV_ACTION_HINTS: Partial<Record<AvAction, string>> = {
    render: 'Use schema-only discovery before widening row output.',
    add_rows: 'Reuse returned rowID values for subsequent cell writes.',
    set_cells: 'Each cell needs the exact rowID, columnID, and matching value type.',
    duplicate: 'Matches SiYuan copy-as-mirror behavior: call the kernel duplicate API, spin the AV block DOM, then commit an insert transaction. previousID overrides the insertion target; otherwise MCP uses blockID or the resolved owning database block.',
};
export const FILE_ACTION_HINTS: Partial<Record<FileAction, string>> = {
    register_project_source: 'Register a portable project identity and the exact current-host root.',
    scan_project_manifest: 'Refresh the bounded A/B/C manifest without returning source content.',
    resolve_project_source: 'Resolve one registered relative path and report status without reading.',
    read_project_source: 'Read bounded redacted UTF-8 text from a manifest-listed path.',
    list_project_sources: 'Lists identities and binding status without exposing roots by default.',
};
export const PROJECT_ACTION_HINTS: Partial<Record<ProjectAction, string>> = {
    snapshot: 'Returns bounded project, workstream, session, and event recovery state.',
};
export const SEARCH_ACTION_HINTS: Partial<Record<SearchAction, string>> = {
    semantic: 'Returns candidates from the configured embedding index; verify source attributes before reuse.',
    knowledge: 'Uses controlled namespace checks before governed semantic retrieval.',
    check_anchor: 'Use candidates=["token"] with candidateKind="name"|"alias" before a governed write, not to locate existing content.',
    query_sql: 'Only SELECT is accepted; add LIMIT and keep output bounded.',
    find_replace: 'Mutates content and requires strict preflight plus exact target scope.',
    criteria_save: 'Overwrites the named saved-search criterion after strict validation.',
    criteria_remove: 'Removes one named saved-search criterion after strict validation.',
};
export const TAG_ACTION_HINTS: Partial<Record<TagAction, string>> = {
    rename: 'Renames a workspace tag label everywhere it appears.',
    remove: 'Removes one global tag label after strict validation.',
};
export const TIMELINE_ACTION_HINTS: Partial<Record<TimelineAction, string>> = {
    list_nodes: 'Use global scope without documentId or document/all scope with documentId.',
    create_node: 'Creates a stable named global or document snapshot node.',
    compare_node: 'Compares one document with a tagged node.',
    compare_recent: 'Reads the newest different native document-history checkpoint.',
};
export const SYSTEM_ACTION_HINTS: Partial<Record<SystemAction, string>> = {
    changelog: 'Read one version or changes since a known previous plugin version.',
    bootstrap: 'Refreshes permissions and returns the effective configured capability surface.',
    audit_environment: 'Returns masked configuration and package counts without reading third-party storage.',
    validate_source_audit: 'Validates a frozen external source-audit handoff.',
};
export const PROVENANCE_ACTION_HINTS: Partial<Record<ProvenanceAction, string>> = {
    register_session: 'Idempotently registers or refreshes one Agent session.',
    record_event: 'Records one knowledgeization event with stable references.',
    list_project_sessions: 'Lists registered sessions for one project.',
    list_atom_events: 'Lists events that reference one atom.',
};
export const EXTENSION_ACTION_HINTS: Partial<Record<string, string>> = {
    list: 'Set refresh=true to reread the official SiYuan MCP registry.',
};

export const TOOL_GUIDANCE_BY_CATEGORY: Record<ToolCategory, string[]> = {
    fs: FS_GUIDANCE, notebook: NOTEBOOK_GUIDANCE, document: DOCUMENT_GUIDANCE,
    block: BLOCK_GUIDANCE, av: AV_GUIDANCE, file: FILE_GUIDANCE,
    project: PROJECT_GUIDANCE, search: SEARCH_GUIDANCE, provenance: PROVENANCE_GUIDANCE,
    tag: TAG_GUIDANCE, timeline: TIMELINE_GUIDANCE, system: SYSTEM_GUIDANCE,
    extension: EXTENSION_GUIDANCE,
};

export const TOOL_ACTION_HINTS: Record<ToolCategory, Partial<Record<string, string>>> = {
    fs: FS_ACTION_HINTS, notebook: NOTEBOOK_ACTION_HINTS, document: DOCUMENT_ACTION_HINTS,
    block: BLOCK_ACTION_HINTS, av: AV_ACTION_HINTS, file: FILE_ACTION_HINTS,
    project: PROJECT_ACTION_HINTS, search: SEARCH_ACTION_HINTS, provenance: PROVENANCE_ACTION_HINTS,
    tag: TAG_ACTION_HINTS, timeline: TIMELINE_ACTION_HINTS, system: SYSTEM_ACTION_HINTS,
    extension: EXTENSION_ACTION_HINTS,
};

export interface HelpExample {
    title: string;
    description?: string;
    mcp: Record<string, unknown>;
}

const EMPTY_EXAMPLES: Partial<Record<string, HelpExample[]>> = {};
export const TOOL_ACTION_EXAMPLES: Record<ToolCategory, Partial<Record<string, HelpExample[]>>> = {
    fs: { read: [{ title: 'Read a document', mcp: { action: 'read', path: '/Notebook/Document' } }] },
    notebook: EMPTY_EXAMPLES,
    document: EMPTY_EXAMPLES,
    block: EMPTY_EXAMPLES,
    av: EMPTY_EXAMPLES,
    file: EMPTY_EXAMPLES,
    project: { snapshot: [{ title: 'Recover project state', mcp: { action: 'snapshot', cwd: '/absolute/project/path' } }] },
    search: EMPTY_EXAMPLES,
    provenance: EMPTY_EXAMPLES,
    tag: EMPTY_EXAMPLES,
    timeline: EMPTY_EXAMPLES,
    system: { get_version: [{ title: 'Get SiYuan version', mcp: { action: 'get_version' } }] },
    extension: { list: [{ title: 'Refresh official tool discovery', mcp: { action: 'list', refresh: true } }] },
};

export { ACTIONS_BY_CATEGORY } from './config';
export const TOOL_OVERVIEW_RESOURCE_URI = 'siyuan://help/tool-overview';
export const DOCUMENT_PATH_RESOURCE_URI = 'siyuan://help/document-path-semantics';
export const EXAMPLES_RESOURCE_URI = 'siyuan://help/examples';
export const AI_LAYOUT_GUIDE_RESOURCE_URI = 'siyuan://help/ai-layout-guide';
export const WRITE_SAFETY_RESOURCE_URI = 'siyuan://help/write-safety';
export const USER_RULES_RESOURCE_URI = 'siyuan://help/user-rules';
export const ACTION_RESOURCE_TEMPLATE_URI = 'siyuan://help/action/{tool}/{action}';
export { CHANGELOG_RESOURCE_URI };

export function getActionHint(tool?: string, action?: string): string | undefined {
    if (!tool || !action || !isKnownToolCategory(tool)) return undefined;
    return TOOL_ACTION_HINTS[tool][action];
}

export function isKnownToolCategory(tool: string): tool is ToolCategory {
    return Object.prototype.hasOwnProperty.call(ACTIONS_BY_CATEGORY, tool);
}

export function isKnownAction(tool: ToolCategory, action: string): boolean {
    return (ACTIONS_BY_CATEGORY[tool] as readonly string[]).includes(action);
}

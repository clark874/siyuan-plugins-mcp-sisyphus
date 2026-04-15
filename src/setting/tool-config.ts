// Re-export the single source of truth in ../mcp/config.
//
// Historical note: an earlier iteration kept a full hand-mirrored copy here
// because it was believed that SiYuan's plugin loader could not resolve shared
// chunks emitted by Vite. That premise no longer holds — analytics/telemetry
// already ship as shared chunks consumed by both entry points. Keeping two
// copies in sync was the single most fragile coupling in the repo (legacy
// maps drifted, default strings diverged), so both entries now import from
// one module.

export {
    TOOL_CATEGORIES,
    NOTEBOOK_ACTIONS,
    DOCUMENT_ACTIONS,
    BLOCK_ACTIONS,
    AV_ACTIONS,
    FILE_ACTIONS,
    SEARCH_ACTIONS,
    TAG_ACTIONS,
    SYSTEM_ACTIONS,
    FLASHCARD_ACTIONS,
    MASCOT_ACTIONS,
    LEGACY_TOOL_TO_ACTION,
    buildDefaultToolConfig,
    normalizeToolConfig,
    isDangerousAction,
} from "../mcp/config";

export type {
    ToolCategory,
    NotebookAction,
    DocumentAction,
    BlockAction,
    AvAction,
    FileAction,
    SearchAction,
    TagAction,
    SystemAction,
    FlashcardAction,
    MascotAction,
    ToolActionMap,
    CategoryToolConfig,
    FileCategoryToolConfig,
    ToolConfig,
} from "../mcp/config";

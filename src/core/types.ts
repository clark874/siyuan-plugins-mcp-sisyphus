import { z } from "zod";

import { AV_ACTIONS, BLOCK_ACTIONS, DOCUMENT_ACTIONS, FILE_ACTIONS, FS_ACTIONS, NOTEBOOK_ACTIONS, PROJECT_ACTIONS, PROVENANCE_ACTIONS, SEARCH_ACTIONS, SYSTEM_ACTIONS, TAG_ACTIONS, TIMELINE_ACTIONS } from "./config";
import type { NotebookConf } from "../types/shared";
import { PROJECT_SOURCE_ACCESSES, PROJECT_SOURCE_COVERAGES, PROJECT_SOURCE_KINDS, PROJECT_SOURCE_ROLES, PROJECT_SOURCE_STATUSES } from "./project-source-contract";
import { PROVENANCE_CAPTURE_METHODS, PROVENANCE_PROVIDERS } from "./provenance";

const NotebookConfSchema: z.ZodType<Partial<NotebookConf>> = z.object({
    name: z.string().optional(),
    closed: z.boolean().optional(),
    refCreateSavePath: z.string().optional(),
    createDocNameTemplate: z.string().optional(),
    dailyNoteSavePath: z.string().optional(),
    dailyNoteTemplatePath: z.string().optional(),
});

const DocumentReferenceSchema = z.object({
    id: z.string().optional(),
    notebook: z.string().optional(),
    path: z.string().optional(),
});

const DocumentPathReferenceSchema = DocumentReferenceSchema.superRefine((value, ctx) => {
    const hasId = typeof value.id === "string";
    const hasPathRef = typeof value.notebook === "string" || typeof value.path === "string";

    if (hasId === hasPathRef) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide either id or notebook + path.",
        });
        return;
    }

    if (hasPathRef && (!value.notebook || !value.path)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Both notebook and path are required when id is not provided.",
        });
    }
});

const DocumentMoveReferenceSchema = z.object({
    fromPaths: z.array(z.string()).optional(),
    toNotebook: z.string().optional(),
    toPath: z.string().optional(),
    fromIDs: z.array(z.string()).optional(),
    toID: z.string().optional(),
}).superRefine((value, ctx) => {
    const hasPathMode = Array.isArray(value.fromPaths) || typeof value.toNotebook === "string" || typeof value.toPath === "string";
    const hasIdMode = Array.isArray(value.fromIDs) || typeof value.toID === "string";

    if (hasPathMode === hasIdMode) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide either fromPaths + toNotebook + toPath or fromIDs + toID.",
        });
        return;
    }

    if (hasPathMode && (!value.fromPaths || !value.toNotebook || !value.toPath)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "fromPaths, toNotebook, and toPath are required for path-based moves.",
        });
    }

    if (hasIdMode && (!value.fromIDs || !value.toID)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "fromIDs and toID are required for ID-based moves.",
        });
    }
});

export const FsActionSchema = z.enum(FS_ACTIONS);
export const NotebookActionSchema = z.enum(NOTEBOOK_ACTIONS);
export const DocumentActionSchema = z.enum(DOCUMENT_ACTIONS);
export const BlockActionSchema = z.enum(BLOCK_ACTIONS);
export const AvActionSchema = z.enum(AV_ACTIONS);
export const FileActionSchema = z.enum(FILE_ACTIONS);
export const ProjectActionSchema = z.enum(PROJECT_ACTIONS);
export const ProvenanceActionSchema = z.enum(PROVENANCE_ACTIONS);

export const ProjectSnapshotSchema = z.object({
    action: z.literal("snapshot"),
    cwd: z.string().min(1).optional().describe("Absolute current working directory supplied by the Agent host"),
    projectId: z.string().min(1).max(256).optional().describe("Exact registered project ID"),
    projectName: z.string().min(1).max(256).optional().describe("Exact normalized project display name"),
    eventLimit: z.number().int().min(1).max(100).optional().describe("Recent event limit, default 10"),
    sessionLimit: z.number().int().min(1).max(100).optional().describe("Registered session limit, default 20"),
    validateSessions: z.boolean().optional().describe("Validate local session records, default true"),
    view: z.enum(["summary", "full"]).optional().describe("Response detail level, default summary; full includes bounded projection and event Kramdown"),
}).superRefine((value, ctx) => {
    const selectors = [value.cwd, value.projectId, value.projectName].filter((item) => typeof item === "string");
    if (selectors.length !== 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide exactly one of cwd, projectId, or projectName." });
    }
});

export const ProvenanceSessionIdentitySchema = z.object({
    provider: z.enum(PROVENANCE_PROVIDERS),
    sessionId: z.string().min(1).max(256),
    hostAlias: z.string().min(1).max(64).optional(),
    captureMethod: z.enum(PROVENANCE_CAPTURE_METHODS),
});

export const ProjectSyncMindmapSchema = z.object({
    action: z.literal('sync_mindmap'),
    projectId: z.string().min(1).max(256).describe('已登记项目的精确标识'),
    autoSync: z.boolean().optional().describe('生成后自动同步；默认 true，false 停止后续自动同步'),
});

const ProvenanceProjectBaseSchema = z.object({
    projectBlockId: z.string().min(1),
    projectId: z.string().min(1).max(256),
});

export const ProvenanceRegisterSessionSchema = ProvenanceProjectBaseSchema.extend({
    action: z.literal("register_session"),
    session: ProvenanceSessionIdentitySchema,
    occurredAt: z.string().datetime().optional(),
});

export const ProvenanceRecordEventSchema = ProvenanceProjectBaseSchema.extend({
    action: z.literal("record_event"),
    eventId: z.string().min(1).max(128),
    operation: z.string().min(1).max(256),
    workstream: z.string().trim().min(1).max(128),
    occurredAt: z.string().datetime().optional(),
    sourceSession: ProvenanceSessionIdentitySchema,
    compileSession: ProvenanceSessionIdentitySchema.optional(),
    targetAtomIds: z.array(z.string().min(1)).min(1).max(500),
    automationId: z.string().min(1).max(256).optional(),
});

export const ProvenanceListProjectSessionsSchema = z.object({
    action: z.literal("list_project_sessions"),
    projectId: z.string().min(1).max(256),
    limit: z.number().int().min(1).max(500).optional(),
    validate: z.boolean().optional(),
});

export const ProvenanceListAtomEventsSchema = z.object({
    action: z.literal("list_atom_events"),
    atomId: z.string().min(1),
    limit: z.number().int().min(1).max(500).optional(),
});

export const ProvenanceResolveSessionLinkSchema = z.object({
    action: z.literal("resolve_session_link"),
    provider: z.enum(PROVENANCE_PROVIDERS),
    sessionId: z.string().min(1).max(256),
    hostAlias: z.string().min(1).max(64).optional(),
});

export const ProvenanceValidateSessionSchema = ProvenanceResolveSessionLinkSchema.extend({
    action: z.literal("validate_session"),
});

export const ProvenanceDiscoverSessionSchema = z.object({
    action: z.literal("discover_session"),
    provider: z.enum(PROVENANCE_PROVIDERS),
    limit: z.number().int().min(1).max(50).optional(),
    activeWindowSeconds: z.number().int().min(1).max(3600).optional(),
});
export const TimelineActionSchema = z.enum(TIMELINE_ACTIONS);

export const FsLsSchema = z.object({
    action: z.literal("ls"),
    path: z.string().describe("Human-readable workspace path, such as /Notebook/Folder or / for notebook roots"),
});

export const FsTreeSchema = z.object({
    action: z.literal("tree"),
    path: z.string().describe("Human-readable workspace path, such as /Notebook/Folder or / for all readable notebooks"),
    maxDepth: z.number().int().min(0).max(20).optional().describe("Max tree depth to return (default 3)"),
});

export const FsReadSchema = z.object({
    action: z.literal("read"),
    path: z.string().describe("Human-readable document path"),
    blockStart: z.number().int().min(0).optional().describe("Zero-based display-block index to start reading from (default 0)"),
    blockLimit: z.number().int().min(1).max(200).optional().describe("Maximum complete display blocks to return (default 50)"),
    tokenBudget: z.number().int().min(1).max(32000).optional().describe("Approximate token budget for the window (default 2000). A single oversized block is still returned whole."),
    includeBlockIds: z.boolean().optional().describe("Include a sidecar blockRefs mapping without adding block IDs to Markdown content (default false)"),
}).passthrough().superRefine((value, ctx) => {
    for (const key of ["page", "pageSize"] as const) {
        if (value[key] !== undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [key],
                message: `${key} character pagination was removed; use blockStart, blockLimit, and tokenBudget.`,
            });
        }
    }
});

export const FsWriteSchema = z.object({
    action: z.literal("write"),
    path: z.string().describe("Human-readable document path"),
    markdown: z.string().describe("Markdown content to create or write. Do not include a leading # Title; a matching create-time H1 is stripped automatically."),
    overwrite: z.boolean().optional().describe("When true, replace an existing document body while keeping the document node and title. This is a full body replacement."),
});

export const FsReplaceEditSchema = z.object({
    old: z.string().min(1).describe("Original text to match exactly. Supports multi-line strings."),
    new: z.string().describe("Replacement text. Supports multi-line strings."),
    replace_all: z.boolean().optional().describe("When true, replace every exact match. Defaults to false."),
});

export const FsReplaceSchema = z.object({
    action: z.literal("replace"),
    path: z.string().describe("Human-readable document path to modify"),
    edit: z.union([
        FsReplaceEditSchema,
        z.array(FsReplaceEditSchema).min(1),
    ]).describe("One replacement edit or an array of edits to apply sequentially inside editable non-complex Markdown blocks without rebuilding the document"),
});

export const FsRmSchema = z.object({
    action: z.literal("rm"),
    path: z.string().describe("Human-readable document path to delete"),
});

export const FsMvSchema = z.object({
    action: z.literal("mv"),
    from: z.string().describe("Human-readable source document path"),
    to: z.string().describe("Human-readable destination document path"),
});

export const FsReorderSchema = z.object({
    action: z.literal("reorder"),
    path: z.string().describe("Human-readable notebook or parent document path"),
    orderedPaths: z.array(z.string()).min(1).describe("Complete ordered list of all visible direct child document paths"),
});

export const FsSearchSchema = z.object({
    action: z.literal("search"),
    path: z.string().describe("Human-readable document or folder path to search within"),
    query: z.string().describe("Text or regular expression to search for"),
    regex: z.boolean().optional().describe("Treat query as a JavaScript regular expression"),
    caseSensitive: z.boolean().optional().describe("Use case-sensitive matching"),
    page: z.number().int().min(1).optional().describe("Page number (1-based), default 1"),
    pageSize: z.number().int().min(1).max(200).optional().describe("Matches per page, default 50"),
});

export const NotebookListSchema = z.object({
    action: z.literal("list"),
});

export const NotebookGetConfSchema = z.object({
    action: z.literal("get_conf"),
    notebook: z.string().describe("Notebook ID"),
});

export const NotebookGetPermissionsSchema = z.object({
    action: z.literal("get_permissions"),
    notebook: z.string().optional().describe('Notebook ID, or "all" to return every notebook permission entry. Omit to return all notebooks.'),
});

export const NotebookGetChildDocsSchema = z.object({
    action: z.literal("get_child_docs"),
    notebook: z.string().describe("Notebook ID"),
    page: z.number().int().positive().optional().describe("Page number (1-based), default 1"),
    pageSize: z.number().int().positive().optional().describe("Rows per page, default 50"),
});

export const DocumentCreateSchema = z.object({
    action: z.literal("create"),
    notebook: z.string().describe("Notebook ID"),
    path: z.string().optional().describe("Human-readable target path, must start with / (e.g., /foo/bar). Parent paths must already exist."),
    parentPath: z.string().optional().describe("Parent human-readable path or storage path ending in .sy for title-based creation, must start with /"),
    title: z.string().optional().describe("Document title when creating under parentPath"),
    markdown: z.string().optional().describe("Markdown content, defaults to empty. Do not include a leading # Title; a matching H1 is stripped automatically."),
    sorts: z.array(z.string()).optional().describe("Compatibility option retained for older callers; title-based creation now uses the reliable path flow"),
    icon: z.string().optional().describe("Optional document icon. Prefer a Unicode hex code string such as '1f4d4' for 📔 instead of a raw emoji character."),
}).superRefine((value, ctx) => {
    const hasPath = typeof value.path === "string";
    const hasTitleMode = typeof value.parentPath === "string" || typeof value.title === "string";

    if (hasPath && hasTitleMode) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide either path, or parentPath + title, not both.",
            path: ["path"],
        });
        return;
    }

    if (!hasPath && (!value.parentPath || !value.title)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide path, or provide both parentPath and title.",
            path: ["path"],
        });
    }
});

const DocumentResolveIncludeSchema = z.enum(["id", "ids", "path", "hpath", "docInfo"]);

export const DocumentLookupSchema = z.object({
    action: z.literal("lookup"),
    id: z.string().optional().describe("Document ID to look up"),
    notebook: z.string().optional().describe("Notebook ID, required with path or hpath"),
    path: z.string().optional().describe("Storage path to look up when notebook is provided, e.g. /20240318112233-abc123.sy. Human-readable paths should use hpath instead."),
    hpath: z.string().optional().describe("Human-readable path to look up when notebook is provided"),
    hPath: z.string().optional().describe("Alias for hpath"),
    include: z.array(DocumentResolveIncludeSchema).optional().describe('Fields to include: "id", "ids", "path", "hpath", "docInfo"'),
}).superRefine((value, ctx) => {
    const hpath = value.hpath ?? value.hPath;
    const sourceCount = [value.id, value.path, hpath].filter((field) => typeof field === "string").length;
    if (sourceCount !== 1) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide exactly one source: id, notebook + path, or notebook + hpath.",
            path: ["id"],
        });
    }
    if (!value.id && !value.notebook) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "notebook is required when resolving path or hpath.",
            path: ["notebook"],
        });
    }
});

export const DocumentRenameSchema = z.object({
    action: z.literal("rename"),
    title: z.string().describe("New document title"),
}).and(DocumentPathReferenceSchema);

export const DocumentMoveSchema = z.object({
    action: z.literal("move"),
}).and(DocumentMoveReferenceSchema);

export const DocumentReorderSchema = z.object({
    action: z.literal("reorder"),
    parentID: z.string().describe("Notebook ID or parent document ID"),
    orderedIDs: z.array(z.string()).min(1).describe("Complete ordered list of all visible direct child document IDs"),
});

export const DocumentGetChildBlocksSchema = z.object({
    action: z.literal("get_child_blocks"),
    id: z.string().describe("Document ID"),
});

export const DocumentGetChildDocsSchema = z.object({
    action: z.literal("get_child_docs"),
    id: z.string().describe("Document ID"),
});

export const DocumentSetAttrSchema = z.object({
    action: z.literal("set_attr"),
    id: z.string().describe("Document ID"),
    attrs: z.object({
        icon: z.string().optional().describe("Icon value. Prefer a Unicode hex code string such as '1f4d4'."),
        cover: z.union([z.string(), z.null()]).optional().describe("Cover source. Use null or empty string to clear the cover."),
    }).describe("Document metadata attributes to set"),
}).superRefine((value, ctx) => {
    if (value.attrs.icon === undefined && value.attrs.cover === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide at least one of attrs.icon or attrs.cover.", path: ["attrs"] });
    }
});

export const DocumentListTreeSchema = z.object({
    action: z.literal("list_tree"),
    notebook: z.string().describe("Notebook ID"),
    path: z.string().describe("Storage path or / for the notebook root"),
    maxDepth: z.number().optional().describe("Max tree depth to return (default 3). Deeper nodes are collapsed to childCount."),
});

export const DocumentSearchDocsSchema = z.object({
    action: z.literal("search_docs"),
    notebook: z.string().describe("Notebook ID"),
    query: z.string().describe("Keyword to search in document titles"),
    path: z.string().optional().describe("Optional storage path to narrow the search scope after permission filtering"),
});

export const DocumentGetDocSchema = z.object({
    action: z.literal("get_doc"),
    id: z.string().describe("Document ID"),
    mode: z.enum(["markdown", "html"]).optional().describe('Return mode: "markdown" (default) or "html"'),
    size: z.number().optional().describe("Optional maximum content size hint"),
    blockStart: z.number().int().min(0).optional().describe("Zero-based display-block index to start reading from in markdown mode (default 0)"),
    blockLimit: z.number().int().min(1).max(200).optional().describe("Maximum complete display blocks to return in markdown mode (default 50)"),
    tokenBudget: z.number().int().min(1).max(32000).optional().describe("Approximate token budget for the markdown window (default 2000). A single oversized block is still returned whole."),
    includeBlockIds: z.boolean().optional().describe("Include a sidecar blockRefs mapping in markdown mode without adding block IDs to content (default false)"),
}).passthrough().superRefine((value, ctx) => {
    for (const key of ["page", "pageSize"] as const) {
        if (value[key] !== undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [key],
                message: `${key} character pagination was removed; use blockStart, blockLimit, and tokenBudget.`,
            });
        }
    }
    if (value.mode !== "html") return;
    for (const key of ["blockStart", "blockLimit", "tokenBudget", "includeBlockIds"] as const) {
        if (value[key] !== undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [key],
                message: `${key} is only supported when mode="markdown".`,
            });
        }
    }
});

export const DocumentGetOutlineSchema = z.object({
    action: z.literal("get_outline"),
    id: z.string().describe("Document ID"),
    preview: z.boolean().optional().describe("Use SiYuan preview-mode outline semantics (default false)"),
});

export const BlockInsertSchema = z.object({
    action: z.literal("insert"),
    dataType: z.enum(["markdown", "dom"]).optional().describe("Data format"),
    data: z.string().optional().describe("Block content"),
    nextID: z.string().optional().describe("Next block ID"),
    previousID: z.string().optional().describe("Previous block ID"),
    parentID: z.string().optional().describe("Parent block or document ID"),
    blocks: z.array(z.object({
        dataType: z.enum(["markdown", "dom"]).describe("Data format"),
        data: z.string().describe("Block content"),
        nextID: z.string().optional().describe("Next block ID"),
        previousID: z.string().optional().describe("Previous block ID"),
        parentID: z.string().optional().describe("Parent block or document ID"),
    })).min(1).optional().describe("Blocks to insert. Item-level anchors override top-level parentID/previousID/nextID."),
}).superRefine((value, ctx) => {
    const batch = Array.isArray(value.blocks);
    if (batch) {
        if (value.dataType || value.data) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide either blocks or single insert data, not both.", path: ["blocks"] });
        }
        value.blocks!.forEach((block, index) => {
            if (block.nextID || block.previousID || block.parentID || value.nextID || value.previousID || value.parentID) return;
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["blocks", index, "previousID"], message: "Provide nextID, previousID, or parentID for each block, or set a top-level parentID/previousID/nextID." });
        });
        return;
    }
    if (!value.dataType) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "dataType is required for single insert.", path: ["dataType"] });
    if (value.data === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "data is required for single insert.", path: ["data"] });
});

export const BlockPrependSchema = z.object({
    action: z.literal("prepend"),
    dataType: z.enum(["markdown", "dom"]).describe("Data format"),
    data: z.string().describe("Block content"),
    parentID: z.string().describe("Parent block or document ID"),
});

export const BlockAppendSchema = z.object({
    action: z.literal("append"),
    dataType: z.enum(["markdown", "dom"]).describe("Data format"),
    data: z.string().describe("Block content"),
    parentID: z.string().describe("Parent block or document ID"),
});

export const BlockUpdateSchema = z.object({
    action: z.literal("update"),
    dataType: z.enum(["markdown", "dom"]).optional().describe("Data format"),
    data: z.string().optional().describe("New block content"),
    id: z.string().optional().describe("Block ID"),
    items: z.array(z.object({
        id: z.string().describe("Block ID"),
        dataType: z.enum(["markdown", "dom"]).describe("Data format"),
        data: z.string().describe("Replacement block content"),
    })).min(1).optional().describe("Blocks to update"),
}).superRefine((value, ctx) => {
    if (Array.isArray(value.items)) {
        if (value.id || value.dataType || value.data !== undefined) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide either items or single update fields, not both.", path: ["items"] });
        }
        return;
    }
    if (!value.id) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "id is required for single update.", path: ["id"] });
    if (!value.dataType) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "dataType is required for single update.", path: ["dataType"] });
    if (value.data === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "data is required for single update.", path: ["data"] });
});

export const BlockReplaceSchema = z.object({
    action: z.literal("replace"),
    id: z.string().describe("Block ID"),
    edit: z.union([
        FsReplaceEditSchema,
        z.array(FsReplaceEditSchema).min(1),
    ]).describe("One replacement edit or an array of edits to apply sequentially within the same block kramdown"),
});

export const BlockMoveSchema = z.object({
    action: z.literal("move"),
    id: z.string().optional().describe("Single block ID"),
    ids: z.array(z.string()).min(1).optional().describe("Multiple block IDs to move as a group. Pass IDs in the desired final order; the tool calls SiYuan's low-level move API from last to first internally to preserve that order."),
    previousID: z.string().optional().describe("Previous block ID"),
    parentID: z.string().optional().describe("New parent block ID"),
}).superRefine((value, ctx) => {
    if ((value.id && value.ids) || (!value.id && !value.ids)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide exactly one of id or ids.",
            path: ["id"],
        });
    }
    if (!value.previousID && !value.parentID) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide previousID, parentID, or both to describe the destination.",
            path: ["previousID"],
        });
    }
});

export const BlockGetKramdownSchema = z.object({
    action: z.literal("get_kramdown"),
    id: z.string().describe("Block ID or document ID"),
});

export const BlockBatchKramdownSchema = z.object({
    action: z.literal("batch_kramdown"),
    ids: z.array(z.string().min(1)).min(1).max(20).describe("Block or document IDs. Results preserve this input order, including duplicate IDs."),
    mode: z.enum(["md", "textmark"]).optional().describe('Kramdown export mode: "md" (default) or "textmark"'),
});

export const BlockGetChildrenSchema = z.object({
    action: z.literal("get_children"),
    id: z.string().describe("Block ID or document ID"),
    page: z.number().int().min(1).optional().describe('Page number (1-based), default 1'),
    pageSize: z.number().int().min(1).max(200).optional().describe('Items per page, default 50'),
});

export const BlockTransferReferencesSchema = z.object({
    action: z.literal("transfer_references"),
    fromID: z.string().describe("Source block ID"),
    toID: z.string().describe("Target block ID"),
    refIDs: z.array(z.string()).optional().describe("Reference block IDs"),
});

const BlockSetAttrsItemSchema = z.object({
    id: z.string().min(1).describe("Block ID"),
    attrs: z.record(z.string(), z.string()).describe("Block attributes"),
});

export const BlockSetAttrsSchema = z.object({
    action: z.literal("set_attrs"),
    id: z.string().min(1).optional().describe("Single block ID"),
    attrs: z.record(z.string(), z.string()).optional().describe("Single-block attributes"),
    items: z.array(BlockSetAttrsItemSchema).min(1).max(100).optional().describe("Atomic batch of block attribute updates"),
}).superRefine((value, ctx) => {
    const hasSingle = typeof value.id === "string" || value.attrs !== undefined;
    const hasBatch = value.items !== undefined;
    if (hasSingle === hasBatch || (hasSingle && (!value.id || !value.attrs))) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide either id + attrs or items, but not both.",
        });
    }
    if (value.items && new Set(value.items.map((item) => item.id)).size !== value.items.length) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["items"],
            message: "items must not contain duplicate block IDs.",
        });
    }
});

export const BlockGetAttrsSchema = z.object({
    action: z.literal("get_attrs"),
    id: z.string().describe("Block ID"),
});

export const BlockInfoSchema = z.object({
    action: z.literal("info"),
    id: z.string().describe("Block ID"),
});

export const BlockBreadcrumbSchema = z.object({
    action: z.literal("breadcrumb"),
    id: z.string().describe("Block ID"),
    excludeTypes: z.array(z.string()).optional().describe("Optional block types to exclude from the breadcrumb"),
});

export const BlockDomSchema = z.object({
    action: z.literal("dom"),
    id: z.string().describe("Block ID"),
});

export const BlockDocsInfoSchema = z.object({
    action: z.literal("docs_info"),
    id: z.string().optional().describe("Single document/block ID"),
    ids: z.array(z.string()).min(1).optional().describe("Document IDs"),
    refCount: z.boolean().optional().describe("When true, include reference counts"),
    av: z.boolean().optional().describe("When true, include AV metadata"),
}).superRefine((value, ctx) => {
    if ((value.id && value.ids) || (!value.id && !value.ids)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide exactly one of id or ids.", path: ["ids"] });
    }
});

const AvValueTypeSchema = z.enum(["text", "number", "date", "checkbox", "select", "multi_select", "relation", "url", "email", "phone", "mAsset"]);

const AvAssetItemSchema = z.object({
    type: z.enum(["image", "file"]).describe("Asset entry type"),
    content: z.string().describe("Asset path stored by SiYuan, e.g. assets/foo.png"),
    name: z.string().optional().describe("Optional display name"),
});

const AvSetCellValueFieldsBaseSchema = z.object({
    valueType: AvValueTypeSchema.describe("Cell value type"),
    text: z.string().optional().describe("Text value for valueType=text"),
    number: z.number().optional().describe("Number value for valueType=number"),
    numberFormat: z.string().optional().describe("Optional number format such as commas, percent, USD, or CNY"),
    date: z.union([z.string(), z.number()]).optional().describe("Date/time value as ISO text or epoch milliseconds for valueType=date"),
    endDate: z.union([z.string(), z.number()]).optional().describe("Optional end date as ISO text or epoch milliseconds for ranged dates"),
    includeTime: z.boolean().optional().describe("When false, store the date without a time component"),
    checked: z.boolean().optional().describe("Checkbox state for valueType=checkbox"),
    option: z.string().optional().describe("Selected option label for valueType=select"),
    options: z.array(z.string()).optional().describe("Selected option labels for valueType=multi_select"),
    relationBlockIDs: z.array(z.string()).optional().describe("Related block IDs for valueType=relation"),
    url: z.string().optional().describe("URL value for valueType=url"),
    email: z.string().optional().describe("Email value for valueType=email"),
    phone: z.string().optional().describe("Phone value for valueType=phone"),
    assets: z.array(AvAssetItemSchema).optional().describe("Asset entries for valueType=mAsset"),
});

const AvSetCellValueFieldsSchema = AvSetCellValueFieldsBaseSchema.superRefine((value, ctx) => {
    const fieldByType: Record<z.infer<typeof AvValueTypeSchema>, keyof typeof value> = {
        text: "text",
        number: "number",
        date: "date",
        checkbox: "checked",
        select: "option",
        multi_select: "options",
        relation: "relationBlockIDs",
        url: "url",
        email: "email",
        phone: "phone",
        mAsset: "assets",
    };

    const expectedField = fieldByType[value.valueType];
    if (value[expectedField] === undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${String(expectedField)} is required when valueType="${value.valueType}".`,
            path: [expectedField],
        });
    }
});

const AvCellUpdateItemSchema = z.object({
    rowID: z.string().describe("Row item ID"),
    columnID: z.string().describe("Column key ID"),
}).and(AvSetCellValueFieldsSchema);

export const AvGetSchema = z.object({
    action: z.literal("get"),
    id: z.string().describe("Attribute view ID"),
    blockID: z.string().optional().describe("Optional database block ID for exact context or fallback permission resolution"),
});

export const AvRenderSchema = z.object({
    action: z.literal("render"),
    id: z.string().optional().describe("Attribute view ID for render/get-style operations; use id here, not avID. Omit only with createIfNotExist=true to let MCP generate one"),
    blockID: z.string().optional().describe("Optional database block ID; required when creating a new AV"),
    viewID: z.string().optional().describe("Optional target view ID"),
    page: z.number().int().min(1).optional().describe("Page number (1-based), default 1"),
    pageSize: z.number().int().optional().describe("Rows per page; default 10. Use query to narrow results before increasing it; -1 keeps the kernel all-rows compatibility mode"),
    query: z.string().optional().describe("Optional row query filter"),
    groupPaging: z.record(z.string(), z.unknown()).optional().describe("Optional group paging map passed through to SiYuan"),
    createIfNotExist: z.boolean().optional().describe("Create the default view only when explicitly true; provide blockID when creating a new AV"),
    ignoreRows: z.boolean().optional().describe("Return view/schema metadata without row values to reduce output size"),
    verbose: z.boolean().optional().describe("Include raw kernel rows in data[] in addition to the compact table; default false"),
});

export const AvGetAttributeViewKeysSchema = z.object({
    action: z.literal("get_attribute_view_keys"),
    id: z.string().describe("Attribute view ID"),
});

export const AvGetAttributeViewFilterSortSchema = z.object({
    action: z.literal("get_attribute_view_filter_sort"),
    id: z.string().describe("Attribute view ID"),
    blockID: z.string().optional().describe("Database block ID (optional)"),
});

export const AvSearchSchema = z.object({
    action: z.literal("search"),
    keyword: z.string().describe("Keyword to search in attribute view names"),
    excludes: z.array(z.string()).optional().describe("Optional AV IDs to exclude"),
});

export const AvRenameSchema = z.object({
    action: z.literal("rename"),
    avID: z.string().describe("Attribute view ID"),
    blockID: z.string().optional().describe("Registered database block ID for explicit database-block context"),
    name: z.string().trim().min(1).max(512).describe("New database name"),
});

export const AvAddRowsSchema = z.object({
    action: z.literal("add_rows"),
    avID: z.string().describe("Attribute view ID"),
    blockIDs: z.array(z.string()).optional().describe("Existing block IDs to add as bound rows"),
    primaryKeyTexts: z.array(z.string()).optional().describe("Plain-text primary key values to add as detached rows"),
    blockID: z.string().optional().describe("Optional database block ID used to pin a specific database-block view context"),
    viewID: z.string().optional().describe("Optional target view ID"),
    groupID: z.string().optional().describe("Optional target group ID"),
    previousID: z.string().optional().describe("Optional previous row item ID"),
    ignoreDefaultFill: z.boolean().optional().describe("When true, skip view/group default value filling"),
}).superRefine((value, ctx) => {
    if ((value.blockIDs?.length ?? 0) === 0 && (value.primaryKeyTexts?.length ?? 0) === 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide at least one blockID or primaryKeyText.",
            path: ["blockIDs"],
        });
    }
});

export const AvRemoveRowsSchema = z.object({
    action: z.literal("remove_rows"),
    avID: z.string().describe("Attribute view ID"),
    blockID: z.string().optional().describe("Registered database block ID for explicit database-block context"),
    srcIDs: z.array(z.string()).min(1).describe("Bound row block/item IDs to remove"),
});

export const AvAddColumnSchema = z.object({
    action: z.literal("add_column"),
    avID: z.string().describe("Attribute view ID"),
    blockID: z.string().optional().describe("Registered database block ID for explicit database-block context"),
    keyID: z.string().optional().describe("Optional new column key ID; MCP generates one when omitted"),
    keyName: z.string().describe("New column name"),
    keyType: z.enum(["text", "number", "date", "select", "mSelect", "url", "email", "phone", "mAsset", "template", "created", "updated", "checkbox", "relation", "rollup", "lineNumber"]).describe("Column type"),
    keyIcon: z.string().optional().describe("Optional column icon"),
    previousKeyID: z.string().optional().describe("Insert after this existing column key ID"),
});

export const AvRemoveColumnSchema = z.object({
    action: z.literal("remove_column"),
    avID: z.string().describe("Attribute view ID"),
    blockID: z.string().optional().describe("Registered database block ID for explicit database-block context"),
    keyID: z.string().optional().describe("Column key ID"),
    columnID: z.string().optional().describe("Alias of keyID"),
    removeRelationDest: z.boolean().optional().describe("Also remove reverse relation metadata when deleting a relation column"),
}).superRefine((value, ctx) => {
    if (!value.keyID && !value.columnID) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide keyID or columnID.",
            path: ['keyID'],
        });
    }
});

export const AvSetCellsSchema = z.object({
    action: z.literal("set_cells"),
    avID: z.string().describe("Attribute view ID"),
    blockID: z.string().optional().describe("Registered database block ID for explicit database-block context"),
    cells: z.array(AvCellUpdateItemSchema).min(1).optional().describe("Cell updates"),
    items: z.array(AvCellUpdateItemSchema).min(1).optional().describe("Alias for cells"),
    rowID: z.string().optional().describe("Single-cell row item ID"),
    columnID: z.string().optional().describe("Single-cell column key ID"),
}).and(AvSetCellValueFieldsBaseSchema.partial()).superRefine((value, ctx) => {
    const cells = value.cells ?? value.items;
    const hasCells = Array.isArray(cells);
    const hasSingle = typeof value.rowID === "string" || typeof value.columnID === "string" || typeof value.valueType === "string";

    if (hasCells && hasSingle) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide either cells/items or single-cell fields, not both.",
            path: ["cells"],
        });
        return;
    }

    if (!hasCells) {
        if (!value.rowID) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "rowID is required for single-cell set_cells calls.", path: ["rowID"] });
        }
        if (!value.columnID) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "columnID is required for single-cell set_cells calls.", path: ["columnID"] });
        }
        if (!value.valueType) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "valueType is required for single-cell set_cells calls.", path: ["valueType"] });
            return;
        }

        const checked = AvSetCellValueFieldsSchema.safeParse(value);
        if (!checked.success) {
            for (const issue of checked.error.issues) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: issue.message,
                    path: issue.path,
                });
            }
        }
    }
});

export const AvDuplicateSchema = z.object({
    action: z.literal("duplicate"),
    avID: z.string().describe("Source attribute view ID"),
    blockID: z.string().optional().describe("Optional source database block ID used as exact context and default insertion target"),
    previousID: z.string().optional().describe("Optional block ID to insert the duplicated mirror database block after"),
});

export const AvGetPrimaryKeyValuesSchema = z.object({
    action: z.literal("get_primary_key_values"),
    avID: z.string().describe("Attribute view ID"),
    keyword: z.string().optional().describe("Optional keyword filter for primary key values"),
    page: z.number().int().min(1).optional().describe("Page number (1-based), default 1"),
    pageSize: z.number().int().min(1).optional().describe("Rows per page, default all"),
});

const ProjectCoreFileSchema = z.object({
    relativePath: z.string().min(1).describe("Project-relative core file path. Absolute paths and parent traversal are rejected."),
    role: z.enum(PROJECT_SOURCE_ROLES).describe("Core file role: source, data, output, manuscript, evidence, or config."),
});

const ProjectExclusionRuleSchema = z.object({
    relativePath: z.string().min(1).describe("Project-relative file or directory prefix to exclude from the manifest."),
    reason: z.string().min(1).max(200).describe("Human-readable reason for excluding this path prefix."),
});

export const FileRegisterProjectSourceSchema = z.object({
    action: z.literal("register_project_source"),
    projectId: z.string().min(3).max(128).describe("Stable portable project identifier. Use the same value across machines."),
    workspaceRoot: z.string().min(1).describe("Absolute local project root. It is stored only in the plugin-controlled host binding."),
    sourceKind: z.enum(PROJECT_SOURCE_KINDS).describe("Source identity kind: git or directory."),
    hubBlockId: z.string().regex(/^\d{14}-[a-z0-9]{7}$/).optional().describe("Stable SiYuan block ID of the project knowledge hub."),
    manifestBlockId: z.string().regex(/^\d{14}-[a-z0-9]{7}$/).optional().describe("Stable SiYuan block ID of the source-manifest note or summary."),
    repository: z.string().min(1).optional().describe("Portable repository identity. Git registrations verify it against remote.origin.url when both are available."),
    coverage: z.enum(PROJECT_SOURCE_COVERAGES).optional().describe("Manifest coverage: tracked, complete, curated, or partial. Defaults to tracked for Git and complete for directories."),
    access: z.enum(PROJECT_SOURCE_ACCESSES).optional().describe("Declared host binding access. 0.9.1 still exposes no project-source content write action."),
    coreFiles: z.array(ProjectCoreFileSchema).max(1000).optional().describe("Explicit A-tier core files and roles. The scanner does not infer research importance from filenames."),
    includePaths: z.array(z.string().min(1)).max(1000).optional().describe("Explicit project-relative roots for curated or partial coverage."),
    exclusions: z.array(ProjectExclusionRuleSchema).max(1000).optional().describe("Additional project-relative exclusions with reasons. Built-in cache and generated directories are excluded separately."),
});

export const FileScanProjectManifestSchema = z.object({
    action: z.literal("scan_project_manifest"),
    projectId: z.string().min(3).max(128).describe("Registered project identifier."),
    maxEntries: z.number().int().min(1).max(50000).optional().describe("Fail-closed manifest entry ceiling, default 20000."),
    maxHashBytes: z.number().int().min(1).max(536870912).optional().describe("Maximum size hashed for each A-tier core file, default 64 MiB. Larger files remain listed with hashStatus=skipped_too_large."),
    maxTotalHashBytes: z.number().int().min(1).max(2147483648).optional().describe("Total A-tier hash-read budget, default 512 MiB. Later files remain listed with hashStatus=skipped_total_budget."),
});

export const FileIdentifyProjectSchema = z.object({
    action: z.literal("identify_project"),
    cwd: z.string().min(1).describe("Absolute current working directory supplied by the Agent host. The server matches it against current-host project bindings without storing or returning the path."),
});

export const FileResolveProjectSourceSchema = z.object({
    action: z.literal("resolve_project_source"),
    projectId: z.string().min(3).max(128).describe("Registered project identifier."),
    relativePath: z.string().min(1).describe("Project-relative path to resolve without reading file content."),
});

export const FileReadProjectSourceSchema = z.object({
    action: z.literal("read_project_source"),
    projectId: z.string().min(3).max(128).describe("Registered project identifier."),
    relativePath: z.string().min(1).describe("Exact project-relative path already listed in the current manifest."),
    offset: z.number().int().min(0).optional().describe("UTF-16 character offset after secret redaction, default 0."),
    limit: z.number().int().min(1).max(20000).optional().describe("Maximum redacted text characters returned, default 8000 and hard maximum 20000."),
});

export const FileListProjectSourcesSchema = z.object({
    action: z.literal("list_project_sources"),
    query: z.string().optional().describe("Optional project ID, repository, or hub/manifest block ID filter."),
    status: z.enum(PROJECT_SOURCE_STATUSES).optional().describe("Optional current-host binding status filter."),
    page: z.number().int().min(1).optional().describe("Page number, default 1."),
    pageSize: z.number().int().min(1).max(100).optional().describe("Projects per page, default 20."),
});

export const SearchActionSchema = z.enum(SEARCH_ACTIONS);

const SearchMethodNameSchema = z.enum(["keyword", "query", "query_syntax", "sql", "regex"]);
const SearchSortNameSchema = z.enum(["relevance", "date", "updated_desc", "updated_asc", "created_desc", "created_asc", "type"]);

export const SearchFulltextSchema = z.object({
    action: z.literal("fulltext"),
    query: z.string().describe("Search query string"),
    method: z.number().optional().describe("Search method: 0=keyword (default), 1=query syntax, 2=SQL, 3=regex"),
    methodName: SearchMethodNameSchema.optional().describe('Semantic alias for method: "keyword" | "query_syntax" | "sql" | "regex". The short alias "query" also maps to query syntax and overrides method when both are provided.'),
    types: z.record(z.string(), z.boolean()).optional().describe("Block type filter. Accepts full names (e.g. {\"heading\": true}) or shortcodes (e.g. {\"h\": true, \"p\": true}). Codes: d=document, h=heading, p=paragraph, l=list, i=listItem, b=blockquote, c=codeBlock, m=mathBlock, t=table, s=superBlock, html=htmlBlock, embed=embedBlock, av=databaseBlock."),
    typeShortcodes: z.array(z.string()).optional().describe("Alternative shorthand type filter as array: [\"h\",\"p\"]. Merged with types if both provided."),
    paths: z.array(z.string()).optional().describe("Restrict search to specific notebook paths"),
    groupBy: z.number().optional().describe("0=no grouping (default), 1=group by document"),
    orderBy: z.number().optional().describe("Legacy numeric sort order: 0=type, 1=created ASC, 2=created DESC, 3=updated ASC, 4=updated DESC, 5=content ASC, 6=content DESC, 7=relevance (default)"),
    sortBy: SearchSortNameSchema.optional().describe('Semantic sort alias: "relevance", "date", "updated_desc", "updated_asc", "created_desc", "created_asc", or "type". Overrides orderBy if both provided.'),
    page: z.number().optional().describe("Page number (1-based), default 1"),
    pageSize: z.number().optional().describe("Results per page, default 32, max 128"),
    parentId: z.string().optional().describe("Post-filter results to blocks whose root_id or parent_id matches this ID, scoping search within a document subtree."),
    hasTags: z.boolean().optional().describe("When true, only return blocks that have tags. When false, only return blocks without tags."),
    stripHtml: z.boolean().optional().describe("Legacy toggle. plainContent is now returned by default; set this when you want to emphasize plain-text-safe downstream parsing while keeping highlighted HTML content."),
});

export const SearchSemanticSchema = z.object({
    action: z.literal("semantic"),
    query: z.string().min(1).describe("Natural-language semantic search query sent to the configured embedding provider"),
    paths: z.array(z.string()).optional().describe("Restrict search to notebook IDs or storage paths"),
    types: z.record(z.string(), z.boolean()).optional().describe("Block type filter. Accepts full names or shortcodes."),
    typeShortcodes: z.array(z.string()).optional().describe("Alternative block type filter using shortcodes such as h, p, c, or av"),
    subTypes: z.record(z.string(), z.boolean()).optional().describe("Optional SiYuan block subtype filter"),
    page: z.number().int().min(1).optional().describe("Page number, default 1"),
    pageSize: z.number().int().min(1).max(128).optional().describe("Results per page, default 32, maximum 128"),
});

export const SearchKnowledgeSchema = z.object({
    action: z.literal("knowledge"),
    query: z.string().min(1).describe("Knowledge query. Exact readable name/alias matches are resolved locally before the configured embedding provider is considered."),
    pageSize: z.number().int().min(1).max(50).optional().describe("Maximum deduplicated knowledge candidates returned, default 10."),
    candidateSize: z.number().int().min(1).max(100).optional().describe("Semantic candidates requested before reference collapse and deduplication, default 30."),
    notebooks: z.array(z.string()).optional().describe("Optional notebook ID allowlist."),
    paths: z.array(z.string()).optional().describe("Optional SiYuan storage-path prefixes."),
    types: z.record(z.string(), z.boolean()).optional().describe("Optional block type filter forwarded to semantic search."),
    subTypes: z.record(z.string(), z.boolean()).optional().describe("Optional block subtype filter forwarded to semantic search."),
    includeRelatedDocuments: z.boolean().optional().describe("Attach documents that reference each candidate, default true."),
    activeScopes: z.array(z.string().min(1)).max(50).optional().describe("Optional custom-anchor-scope values for deterministic resolution when an exact alias maps to multiple readable blocks."),
    namespaceMode: z.enum(["auto", "off"]).optional().describe("Namespace resolution mode. auto (default) probes readable name/alias anchors before semantic search; off is a diagnostic baseline for retrieval evaluation."),
    lexicalFirst: z.boolean().optional().describe("Set false to skip the local lexical pre-check and always use the embedding index; intended for retrieval-evaluation baselines. Default true: when a local keyword full-text block contains every query token, it is returned without data egress."),
});

export const SearchCheckAnchorSchema = z.object({
    action: z.literal("check_anchor"),
    candidates: z.array(z.string().min(1)).min(1).max(10).describe("Candidate name or alias tokens to check. Comma-separated alias strings are split into exact tokens. Send at most 10 tokens per call to keep adjudication output bounded."),
    candidateKind: z.enum(["name", "alias"]).describe("Whether the candidates will be written as canonical names or retrieval aliases."),
    excludeBlockIds: z.array(z.string()).max(100).optional().describe("Existing block IDs being edited; exclude them from collision results."),
    activeScopes: z.array(z.string().min(1)).max(50).optional().describe("Optional active custom-anchor-scope values used to test deterministic scoped resolution."),
});

export const SearchQuerySqlSchema = z.object({
    action: z.literal("query_sql"),
    stmt: z.string().optional().describe("SQL SELECT statement over SiYuan index tables such as blocks, spans, assets, attributes, and refs. Raw SQL is available only when every configured notebook is readable."),
    sql: z.string().optional().describe("Semantic alias for stmt. Overrides stmt when both are provided."),
    maxRows: z.number().int().min(1).max(1000).optional().describe("Maximum rows returned, default 200 and maximum 1000. Use SQL LIMIT/OFFSET to control kernel work."),
}).superRefine((value, ctx) => {
    if (!value.stmt && !value.sql) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide stmt or sql.",
            path: ['stmt'],
        });
    }
});

export const SearchGetBacklinksSchema = z.object({
    action: z.literal("get_backlinks"),
    id: z.string().describe("Block or document ID to find backlinks for"),
    keyword: z.string().optional().describe("Filter backlinks by keyword"),
    refTreeID: z.string().optional().describe("Optional source document tree ID for the kernel backlink query; when omitted, query the global SQL index."),
    scopeRootId: z.string().optional().describe("Alias for refTreeID. Overrides refTreeID when both are provided."),
    mode: z.enum(["links", "mentions", "both"]).optional().describe('Result mode: "links", "mentions", or "both" (default).'),
});

export const SearchRefsSchema = z.object({
    action: z.literal("search_refs"),
    id: z.string().describe("Referenced block or document ID"),
    rootID: z.string().optional().describe("Optional current root document ID"),
    k: z.string().optional().describe("Keyword filter"),
    beforeLen: z.number().int().min(0).optional().describe("Context length before the reference, default 512"),
    isSquareBrackets: z.boolean().optional().describe("Search in square-bracket reference mode"),
    isDatabase: z.boolean().optional().describe("Whether the reference target is a database"),
    reqId: z.string().optional().describe("Optional passthrough request ID"),
});

export const SearchFindReplaceSchema = z.object({
    action: z.literal("find_replace"),
    k: z.string().describe("Find keyword"),
    r: z.string().describe("Replacement text; use empty string to delete matches"),
    ids: z.array(z.string()).min(1).describe("Document or block IDs to mutate"),
    paths: z.array(z.string()).optional().describe("Optional path scope list"),
    types: z.record(z.string(), z.boolean()).optional().describe("Optional block type filter"),
    method: z.number().optional().describe("Search method: 0=keyword, 1=query syntax, 2=SQL, 3=regex"),
    methodName: SearchMethodNameSchema.optional().describe('Semantic alias for method: "keyword" | "query_syntax" | "sql" | "regex". The short alias "query" also maps to query syntax and overrides method when both are provided.'),
    orderBy: z.number().optional().describe("Legacy numeric sort order"),
    sortBy: SearchSortNameSchema.optional().describe('Semantic sort alias that overrides orderBy when both are provided.'),
    groupBy: z.number().optional().describe("Grouping mode"),
    replaceTypes: z.record(z.string(), z.boolean()).optional().describe("Replace target kinds such as text, code, docTitle, blockRef"),
});

export const SearchListInvalidRefsSchema = z.object({
    action: z.literal("list_invalid_refs"),
    page: z.number().int().min(1).optional().describe("Page number (1-based)"),
    pageSize: z.number().int().min(1).max(128).optional().describe("Results per page"),
});

export const SearchCriteriaListSchema = z.object({
    action: z.literal("criteria_list"),
});

export const SearchCriteriaSaveSchema = z.object({
    action: z.literal("criteria_save"),
    name: z.string().min(1).describe("Saved-search name; an existing criterion with the same name is overwritten"),
    obj: z.record(z.string(), z.unknown()).describe("Opaque kernel search-condition object as persisted by SiYuan's search panel; pass it through verbatim, typically copied from criteria_list output"),
});

export const SearchCriteriaRemoveSchema = z.object({
    action: z.literal("criteria_remove"),
    name: z.string().min(1).describe("Saved-search name to remove"),
});

export const TagActionSchema = z.enum(TAG_ACTIONS);

export const TagListSchema = z.object({
    action: z.literal("list"),
    keyword: z.string().optional().describe("Optional keyword used to search/filter tags"),
    query: z.string().optional().describe("Alias for keyword"),
    sort: z.number().optional().describe("Optional tag sort mode"),
    ignoreMaxListHint: z.boolean().optional().describe("Ignore the maximum list hint from SiYuan"),
    app: z.string().optional().describe("Optional app identifier passed through to SiYuan"),
});

export const TagRenameSchema = z.object({
    action: z.literal("rename"),
    oldLabel: z.string().describe("Existing tag label"),
    newLabel: z.string().describe("New tag label"),
});

export const TagRemoveSchema = z.object({
    action: z.literal("remove"),
    label: z.string().describe("Tag label to remove"),
});

export const TimelineListNodesSchema = z.object({
    action: z.literal("list_nodes"),
    scope: z.enum(["global", "document", "all"]).describe("Node scope to list"),
    documentId: z.string().optional().describe("Required for document or all scope"),
    page: z.number().int().min(1).optional().describe("Page number (default 1)"),
    pageSize: z.number().int().min(1).max(100).optional().describe("Nodes per page (default 50)"),
}).superRefine((value, ctx) => {
    if (value.scope !== "global" && !value.documentId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["documentId"], message: "documentId is required for document or all scope." });
    }
});

export const TimelineCreateNodeSchema = z.object({
    action: z.literal("create_node"),
    name: z.string().trim().min(1).describe("Human-readable timeline node name"),
    scope: z.enum(["global", "document"]).describe("Create a workspace-global or document-scoped node"),
    documentId: z.string().optional().describe("Required for document scope"),
}).superRefine((value, ctx) => {
    if (value.scope === "document" && !value.documentId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["documentId"], message: "documentId is required for document scope." });
    }
});

export const TimelineCompareNodeSchema = z.object({
    action: z.literal("compare_node"),
    documentId: z.string().describe("Document ID to compare"),
    tag: z.string().min(1).describe("Timeline tag returned by create_node or list_nodes"),
    page: z.number().int().min(1).optional().describe("Changed-block page number (default 1)"),
    pageSize: z.number().int().min(1).max(100).optional().describe("Blocks per page (default 20)"),
    includeUnchanged: z.boolean().optional().describe("Include unchanged blocks in the paginated result (default false)"),
});

export const TimelineCompareRecentSchema = z.object({
    action: z.literal("compare_recent"),
    documentId: z.string().describe("Document ID to compare with its newest different SiYuan document-history checkpoint"),
    page: z.number().int().min(1).optional().describe("Changed-block page number (default 1)"),
    pageSize: z.number().int().min(1).max(100).optional().describe("Blocks per page (default 20)"),
});

export const SystemActionSchema = z.enum(SYSTEM_ACTIONS);

export const SystemChangelogSchema = z.object({
    action: z.literal("changelog"),
    version: z.string().optional().describe("Exact plugin version to read, e.g. 0.10.0 or v0.10.0"),
    fromVersion: z.string().optional().describe("Previous plugin version; returns entries newer than this version"),
    limit: z.number().int().min(1).max(50).optional().describe("Maximum number of entries to return when version is omitted"),
    includeRaw: z.boolean().optional().describe("Include raw Markdown for each returned changelog entry"),
});

export const SystemGetVersionSchema = z.object({
    action: z.literal("get_version"),
});

export const SystemGetCurrentTimeSchema = z.object({
    action: z.literal("get_current_time"),
});

const SystemFrontendSchema = z.enum(["desktop", "desktop-window", "mobile", "browser-desktop", "browser-mobile"]);

export const SystemAuditEnvironmentSchema = z.object({
    action: z.literal("audit_environment"),
    frontend: SystemFrontendSchema.optional().describe("SiYuan frontend used for plugin compatibility checks; defaults to desktop"),
});

export const SystemBootstrapSchema = z.object({
    action: z.literal("bootstrap"),
});

export const SystemValidateSourceAuditSchema = z.object({
    action: z.literal("validate_source_audit"),
    inventory: z.unknown().describe("Parsed inventory.json value from an external frozen source audit"),
    usageMap: z.unknown().describe("Parsed usage-map.json value from an external frozen source audit"),
    baselinesMarkdown: z.string().min(1).max(1_000_000).describe("Exact baselines.md text containing full Git commits and SHA-256 evidence"),
});

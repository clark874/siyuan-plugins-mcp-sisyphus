import { z } from "zod";

import { AV_ACTIONS, BLOCK_ACTIONS, DOCUMENT_ACTIONS, FILE_ACTIONS, FLASHCARD_ACTIONS, MASCOT_ACTIONS, NOTEBOOK_ACTIONS, SEARCH_ACTIONS, SYSTEM_ACTIONS, TAG_ACTIONS } from "./config";

const NotebookConfSchema = z.object({
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

export const NotebookActionSchema = z.enum(NOTEBOOK_ACTIONS);
export const DocumentActionSchema = z.enum(DOCUMENT_ACTIONS);
export const BlockActionSchema = z.enum(BLOCK_ACTIONS);
export const AvActionSchema = z.enum(AV_ACTIONS);
export const FileActionSchema = z.enum(FILE_ACTIONS);
export const FlashcardActionSchema = z.enum(FLASHCARD_ACTIONS);
export const MascotActionSchema = z.enum(MASCOT_ACTIONS);

export const NotebookListSchema = z.object({
    action: z.literal("list"),
});

export const NotebookCreateSchema = z.object({
    action: z.literal("create"),
    name: z.string().describe("Notebook name"),
    icon: z.string().optional().describe("Optional notebook icon. Prefer a Unicode hex code string such as '1f4d4' for 📔 instead of a raw emoji character."),
});

export const NotebookOpenSchema = z.object({
    action: z.literal("open"),
    notebook: z.string().describe("Notebook ID"),
});

export const NotebookCloseSchema = z.object({
    action: z.literal("close"),
    notebook: z.string().describe("Notebook ID"),
});

export const NotebookRemoveSchema = z.object({
    action: z.literal("remove"),
    notebook: z.string().describe("Notebook ID"),
});

export const NotebookRenameSchema = z.object({
    action: z.literal("rename"),
    notebook: z.string().describe("Notebook ID"),
    name: z.string().describe("New notebook name"),
});

export const NotebookGetConfSchema = z.object({
    action: z.literal("get_conf"),
    notebook: z.string().describe("Notebook ID"),
});

export const NotebookSetConfSchema = z.object({
    action: z.literal("set_conf"),
    notebook: z.string().describe("Notebook ID"),
    conf: NotebookConfSchema.describe("Notebook configuration"),
});

export const NotebookSetIconSchema = z.object({
    action: z.literal("set_icon"),
    notebook: z.string().describe("Notebook ID"),
    icon: z.string().describe("Icon value. Prefer a Unicode hex code string such as '1f4d4' for 📔; raw emoji characters may not render correctly. Custom icon paths are also supported."),
});

export const NotebookGetPermissionsSchema = z.object({
    action: z.literal("get_permissions"),
    notebook: z.string().optional().describe('Notebook ID, or "all" to return every notebook permission entry. Omit to return all notebooks.'),
});

export const NotebookSetPermissionSchema = z.object({
    action: z.literal("set_permission"),
    notebook: z.string().describe("Notebook ID"),
    permission: z.enum(["none", "r", "rw", "rwd"]).describe('Permission level: "none" blocks all access, "r" allows read only, "rw" allows read and write without delete, "rwd" allows read, write, and delete (default for new notebooks)'),
});

export const NotebookGetChildDocsSchema = z.object({
    action: z.literal("get_child_docs"),
    notebook: z.string().describe("Notebook ID"),
});

export const DocumentCreateSchema = z.object({
    action: z.literal("create"),
    notebook: z.string().describe("Notebook ID"),
    path: z.string().describe("Human-readable target path, must start with / (e.g., /foo/bar). Parent paths must already exist."),
    markdown: z.string().describe("Markdown content"),
    icon: z.string().optional().describe("Optional document icon. Prefer a Unicode hex code string such as '1f4d4' for 📔 instead of a raw emoji character."),
});

export const DocumentRenameSchema = z.object({
    action: z.literal("rename"),
    title: z.string().describe("New document title"),
}).and(DocumentPathReferenceSchema);

export const DocumentRemoveSchema = z.object({
    action: z.literal("remove"),
}).and(DocumentPathReferenceSchema);

export const DocumentMoveSchema = z.object({
    action: z.literal("move"),
}).and(DocumentMoveReferenceSchema);

export const DocumentGetPathSchema = z.object({
    action: z.literal("get_path"),
    id: z.string().describe("Document ID"),
});

export const DocumentGetHPathSchema = z.object({
    action: z.literal("get_hpath"),
}).and(DocumentPathReferenceSchema);

export const DocumentGetIdsSchema = z.object({
    action: z.literal("get_ids"),
    path: z.string().describe("Human-readable path (e.g., /foo/bar)"),
    notebook: z.string().describe("Notebook ID"),
});

export const DocumentGetChildBlocksSchema = z.object({
    action: z.literal("get_child_blocks"),
    id: z.string().describe("Document ID"),
});

export const DocumentGetChildDocsSchema = z.object({
    action: z.literal("get_child_docs"),
    id: z.string().describe("Document ID"),
});

export const DocumentSetIconSchema = z.object({
    action: z.literal("set_icon"),
    id: z.string().describe("Document ID"),
    icon: z.string().describe("Icon value. Prefer a Unicode hex code string such as '1f4d4' for 📔; raw emoji characters may not render correctly. Custom icon paths are also supported."),
});

export const DocumentSetCoverSchema = z.object({
    action: z.literal("set_cover"),
    id: z.string().describe("Document ID"),
    source: z.string().describe("Cover image source. Accepts http(s) URLs or SiYuan asset paths like /assets/foo.png."),
});

export const DocumentClearCoverSchema = z.object({
    action: z.literal("clear_cover"),
    id: z.string().describe("Document ID"),
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
    page: z.number().int().min(1).optional().describe('Page number for markdown pagination (1-based)'),
    pageSize: z.number().int().min(1).max(20000).optional().describe('Characters per page for markdown pagination (default 8000)'),
});

export const DocumentCreateDailyNoteSchema = z.object({
    action: z.literal("create_daily_note"),
    notebook: z.string().describe("Notebook ID"),
    app: z.string().optional().describe("Optional app identifier passed through to SiYuan"),
});

export const DocumentDuplicateSchema = z.object({
    action: z.literal("duplicate"),
    id: z.string().describe("Source document ID"),
});

export const DocumentRemoveBatchSchema = z.object({
    action: z.literal("remove_batch"),
    paths: z.array(z.string()).min(1).describe("One or more storage paths to remove in batch"),
});

export const DocumentCreateEmptySchema = z.object({
    action: z.literal("create_empty"),
    notebook: z.string().describe("Notebook ID"),
    path: z.string().describe("Parent human-readable path, must start with /"),
    title: z.string().describe("New document title"),
    markdown: z.string().optional().describe("Optional initial markdown content, defaults to empty"),
    sorts: z.array(z.string()).optional().describe("Optional sorting path segments passed through to SiYuan"),
});

export const DocumentHeadingToDocSchema = z.object({
    action: z.literal("heading_to_doc"),
    headingID: z.string().describe("Heading block ID to convert into a document"),
    targetNotebook: z.string().describe("Target notebook ID"),
    targetPath: z.string().optional().describe("Optional target storage path"),
    previousPath: z.string().optional().describe("Optional previous sibling storage path"),
});

export const DocumentDocToHeadingSchema = z.object({
    action: z.literal("doc_to_heading"),
    srcID: z.string().describe("Source document ID"),
    targetID: z.string().describe("Target document or heading block ID"),
    after: z.boolean().optional().describe("When true, insert after the target heading instead of before it"),
});

export const MascotGetBalanceSchema = z.object({
    action: z.literal("get_balance"),
});

export const MascotShopSchema = z.object({
    action: z.literal("shop"),
});

export const MascotBuySchema = z.object({
    action: z.literal("buy"),
    item_id: z.string().describe("Stable shop item ID returned by mascot(action=\"shop\")"),
});

const FlashcardScopeSchema = z.enum(["all", "deck", "notebook", "tree"]);
const FlashcardFilterSchema = z.enum(["due", "new", "old"]);

export const FlashcardListCardsSchema = z.object({
    action: z.literal("list_cards"),
    scope: FlashcardScopeSchema.describe('Query scope: "all", "deck", "notebook", or "tree"'),
    filter: FlashcardFilterSchema.describe('Filter returned cards: "due", "new", or "old"'),
    deckID: z.string().optional().describe("Deck ID, required when scope=deck"),
    notebook: z.string().optional().describe("Notebook ID, required when scope=notebook"),
    rootID: z.string().optional().describe("Root document/block ID, required when scope=tree"),
}).superRefine((value, ctx) => {
    const hasDeck = typeof value.deckID === "string";
    const hasNotebook = typeof value.notebook === "string";
    const hasRoot = typeof value.rootID === "string";

    if (value.scope === "all" && (hasDeck || hasNotebook || hasRoot)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'scope="all" does not accept deckID, notebook, or rootID.' });
    }
    if (value.scope === "deck" && !hasDeck) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["deckID"], message: 'deckID is required when scope="deck".' });
    }
    if (value.scope === "notebook" && !hasNotebook) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["notebook"], message: 'notebook is required when scope="notebook".' });
    }
    if (value.scope === "tree" && !hasRoot) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["rootID"], message: 'rootID is required when scope="tree".' });
    }
});

export const FlashcardGetDecksSchema = z.object({
    action: z.literal("get_decks"),
});

export const FlashcardReviewCardSchema = z.object({
    action: z.literal("review_card"),
    deckID: z.string().describe("Deck ID"),
    cardID: z.string().describe("Card ID"),
    rating: z.number().describe("Review rating passed through to the kernel"),
    reviewedCards: z.array(z.record(z.string(), z.unknown())).optional().describe("Optional reviewedCards payload passed through to the kernel"),
});

export const FlashcardSkipReviewCardSchema = z.object({
    action: z.literal("skip_review_card"),
    deckID: z.string().describe("Deck ID"),
    cardID: z.string().describe("Card ID"),
});

export const FlashcardAddCardSchema = z.object({
    action: z.literal("add_card"),
    deckID: z.string().describe("Deck ID"),
    blockIDs: z.array(z.string()).min(1).describe("Existing block IDs to add as flashcards"),
});

export const FlashcardRemoveCardSchema = z.object({
    action: z.literal("remove_card"),
    deckID: z.string().describe("Deck ID"),
    blockIDs: z.array(z.string()).min(1).describe("Existing block IDs to remove from flashcards"),
});

export const FlashcardGetCardsSchema = z.object({
    action: z.literal("get_cards"),
    deckID: z.string().describe("Deck ID (use empty string to query across all decks)"),
    page: z.number().int().min(1).optional().describe("Page number (1-based), default 1"),
    pageSize: z.number().int().min(1).max(512).optional().describe("Cards per page, default 32"),
});

export const BlockInsertSchema = z.object({
    action: z.literal("insert"),
    dataType: z.enum(["markdown", "dom"]).describe("Data format"),
    data: z.string().describe("Block content"),
    nextID: z.string().optional().describe("Next block ID"),
    previousID: z.string().optional().describe("Previous block ID"),
    parentID: z.string().optional().describe("Parent block or document ID"),
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
    dataType: z.enum(["markdown", "dom"]).describe("Data format"),
    data: z.string().describe("New block content"),
    id: z.string().describe("Block ID"),
});

export const BlockDeleteSchema = z.object({
    action: z.literal("delete"),
    id: z.string().describe("Block ID"),
});

export const BlockMoveSchema = z.object({
    action: z.literal("move"),
    id: z.string().describe("Block ID"),
    previousID: z.string().optional().describe("Previous block ID"),
    parentID: z.string().optional().describe("New parent block ID"),
}).superRefine((value, ctx) => {
    if (!value.previousID && !value.parentID) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide previousID, parentID, or both to describe the destination.",
            path: ["previousID"],
        });
    }
});

export const BlockFoldSchema = z.object({
    action: z.literal("fold"),
    id: z.string().describe("Foldable block ID"),
});

export const BlockUnfoldSchema = z.object({
    action: z.literal("unfold"),
    id: z.string().describe("Foldable block ID"),
});

export const BlockGetKramdownSchema = z.object({
    action: z.literal("get_kramdown"),
    id: z.string().describe("Block ID or document ID"),
});

export const BlockGetChildrenSchema = z.object({
    action: z.literal("get_children"),
    id: z.string().describe("Block ID or document ID"),
    page: z.number().int().min(1).optional().describe('Page number (1-based), default 1'),
    pageSize: z.number().int().min(1).max(200).optional().describe('Items per page, default 50'),
});

export const BlockTransferRefSchema = z.object({
    action: z.literal("transfer_ref"),
    fromID: z.string().describe("Source block ID"),
    toID: z.string().describe("Target block ID"),
    refIDs: z.array(z.string()).optional().describe("Reference block IDs"),
});

export const BlockSetAttrsSchema = z.object({
    action: z.literal("set_attrs"),
    id: z.string().describe("Block ID"),
    attrs: z.record(z.string(), z.string()).describe("Block attributes"),
});

export const BlockGetAttrsSchema = z.object({
    action: z.literal("get_attrs"),
    id: z.string().describe("Block ID"),
});

export const BlockExistsSchema = z.object({
    action: z.literal("exists"),
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

export const BlockRecentUpdatedSchema = z.object({
    action: z.literal("recent_updated"),
    count: z.number().optional().describe("Maximum number of recent readable blocks to return after permission filtering"),
});

export const BlockWordCountSchema = z.object({
    action: z.literal("word_count"),
    ids: z.array(z.string()).describe("One or more block IDs"),
});

const BlockBatchInsertItemSchema = z.object({
    dataType: z.enum(["markdown", "dom"]).describe("Data format"),
    data: z.string().describe("Block content"),
    nextID: z.string().optional().describe("Next block ID"),
    previousID: z.string().optional().describe("Previous block ID"),
    parentID: z.string().optional().describe("Parent block or document ID"),
});

const BlockBatchUpdateItemSchema = z.object({
    id: z.string().describe("Block ID"),
    dataType: z.enum(["markdown", "dom"]).describe("Data format"),
    data: z.string().describe("Replacement block content"),
});

export const BlockBatchInsertSchema = z.object({
    action: z.literal("batch_insert"),
    blocks: z.array(BlockBatchInsertItemSchema).min(1).describe("Blocks to insert"),
});

export const BlockBatchUpdateSchema = z.object({
    action: z.literal("batch_update"),
    blocks: z.array(BlockBatchUpdateItemSchema).min(1).describe("Blocks to update"),
});

export const BlockAppendDailyNoteSchema = z.object({
    action: z.literal("append_daily_note"),
    notebook: z.string().describe("Notebook ID"),
    dataType: z.enum(["markdown", "dom"]).describe("Data format"),
    data: z.string().describe("Block content"),
});

export const BlockPrependDailyNoteSchema = z.object({
    action: z.literal("prepend_daily_note"),
    notebook: z.string().describe("Notebook ID"),
    dataType: z.enum(["markdown", "dom"]).describe("Data format"),
    data: z.string().describe("Block content"),
});

export const BlockDocInfoSchema = z.object({
    action: z.literal("doc_info"),
    id: z.string().describe("Block or document ID"),
});

export const BlockDocsInfoSchema = z.object({
    action: z.literal("docs_info"),
    ids: z.array(z.string()).min(1).describe("Document IDs"),
    refCount: z.boolean().optional().describe("When true, include reference counts"),
    av: z.boolean().optional().describe("When true, include AV metadata"),
});

const AvValueTypeSchema = z.enum(["text", "number", "date", "checkbox", "select", "multi_select", "relation", "url", "email", "phone", "mAsset"]);

const AvAssetItemSchema = z.object({
    type: z.enum(["image", "file"]).describe("Asset entry type"),
    content: z.string().describe("Asset path stored by SiYuan, e.g. assets/foo.png"),
    name: z.string().optional().describe("Optional display name"),
});

const AvSetCellValueFieldsSchema = z.object({
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
}).superRefine((value, ctx) => {
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
});

export const AvRenderAttributeViewSchema = z.object({
    action: z.literal("render_attribute_view"),
    id: z.string().describe("Attribute view ID"),
    blockID: z.string().optional().describe("Optional database block ID"),
    viewID: z.string().optional().describe("Optional target view ID"),
    page: z.number().int().min(1).optional().describe("Page number (1-based), default 1"),
    pageSize: z.number().int().optional().describe("Rows per page; use -1 or omit for kernel default"),
    query: z.string().optional().describe("Optional row query filter"),
    groupPaging: z.record(z.string(), z.unknown()).optional().describe("Optional group paging map passed through to SiYuan"),
    createIfNotExist: z.boolean().optional().describe("Create the default view if none exists; defaults to true"),
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

export const AvAddRowsSchema = z.object({
    action: z.literal("add_rows"),
    avID: z.string().describe("Attribute view ID"),
    blockIDs: z.array(z.string()).describe("Existing block IDs to add as rows"),
    blockID: z.string().optional().describe("Optional database block ID"),
    viewID: z.string().optional().describe("Optional target view ID"),
    groupID: z.string().optional().describe("Optional target group ID"),
    previousID: z.string().optional().describe("Optional previous row item ID"),
    ignoreDefaultFill: z.boolean().optional().describe("When true, skip view/group default value filling"),
});

export const AvRemoveRowsSchema = z.object({
    action: z.literal("remove_rows"),
    avID: z.string().describe("Attribute view ID"),
    srcIDs: z.array(z.string()).min(1).describe("Bound row block/item IDs to remove"),
});

export const AvAddColumnSchema = z.object({
    action: z.literal("add_column"),
    avID: z.string().describe("Attribute view ID"),
    keyID: z.string().optional().describe("Optional new column key ID; MCP generates one when omitted"),
    keyName: z.string().describe("New column name"),
    keyType: z.enum(["text", "number", "date", "select", "mSelect", "url", "email", "phone", "mAsset", "template", "created", "updated", "checkbox", "relation", "rollup", "lineNumber"]).describe("Column type"),
    keyIcon: z.string().optional().describe("Optional column icon"),
    previousKeyID: z.string().optional().describe("Insert after this existing column key ID"),
});

export const AvRemoveColumnSchema = z.object({
    action: z.literal("remove_column"),
    avID: z.string().describe("Attribute view ID"),
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

export const AvSetCellSchema = z.object({
    action: z.literal("set_cell"),
    avID: z.string().describe("Attribute view ID"),
    rowID: z.string().describe("Row item ID"),
    columnID: z.string().describe("Column key ID"),
}).and(AvSetCellValueFieldsSchema);

export const AvBatchSetCellsSchema = z.object({
    action: z.literal("batch_set_cells"),
    avID: z.string().describe("Attribute view ID"),
    items: z.array(AvCellUpdateItemSchema).min(1).describe("Batch cell updates"),
});

export const AvDuplicateBlockSchema = z.object({
    action: z.literal("duplicate_block"),
    avID: z.string().describe("Source attribute view ID"),
    previousID: z.string().optional().describe("Optional block ID to insert the duplicated database block after, overriding the default source-block insertion target"),
});

export const AvGetPrimaryKeyValuesSchema = z.object({
    action: z.literal("get_primary_key_values"),
    avID: z.string().describe("Attribute view ID"),
    keyword: z.string().optional().describe("Optional keyword filter for primary key values"),
    page: z.number().int().min(1).optional().describe("Page number (1-based), default 1"),
    pageSize: z.number().int().min(1).optional().describe("Rows per page, default all"),
});

export const FileUploadAssetSchema = z.object({
    action: z.literal("upload_asset"),
    assetsDirPath: z.string().describe("Asset directory path (e.g., /assets/)"),
    localFilePath: z.string().describe("Local file path to read and upload into the assets directory"),
    confirmLargeFile: z.boolean().optional().describe("Set to true only after the user explicitly confirms uploading a file larger than the configured safety threshold."),
});

export const FileRenderTemplateSchema = z.object({
    action: z.literal("render_template"),
    id: z.string().describe("Document ID for template context"),
    path: z.string().describe("Template file path inside the SiYuan workspace; arbitrary local filesystem paths are not supported"),
});

export const FileRenderSprigSchema = z.object({
    action: z.literal("render_sprig"),
    template: z.string().describe("Sprig template content"),
});

export const FileExportMdSchema = z.object({
    action: z.literal("export_md"),
    id: z.string().describe("Document ID to export"),
});

export const FileExportResourcesSchema = z.object({
    action: z.literal("export_resources"),
    paths: z.array(z.string()).describe("Paths to export"),
    name: z.string().optional().describe("Export file name"),
    outputPath: z.string().optional().describe("Optional local absolute or relative filesystem path to save the exported ZIP"),
});

export const FileListUnusedAssetsSchema = z.object({
    action: z.literal("list_unused_assets"),
});

export const FileGetDocAssetsSchema = z.object({
    action: z.literal("get_doc_assets"),
    id: z.string().describe("Document ID"),
});

export const FileGetDocImageAssetsSchema = z.object({
    action: z.literal("get_doc_image_assets"),
    id: z.string().describe("Document ID"),
});

export const FileGetImageOCRTextSchema = z.object({
    action: z.literal("get_image_ocr_text"),
    path: z.string().optional().describe("Asset path; omit to receive an empty OCR text payload"),
});

export const FileRemoveUnusedAssetsSchema = z.object({
    action: z.literal("remove_unused_assets"),
});

export const FileRenameAssetSchema = z.object({
    action: z.literal("rename_asset"),
    oldPath: z.string().describe("Existing asset path"),
    newName: z.string().describe("New asset file name"),
});

export const FileDeleteAssetSchema = z.object({
    action: z.literal("delete_asset"),
    path: z.string().describe("Asset path to delete"),
});

export const FileSetImageAlphaSchema = z.object({
    action: z.literal("set_image_alpha"),
    path: z.string().describe("Asset path to update"),
    alpha: z.number().describe("Alpha value passed through to SiYuan"),
});

export const SearchActionSchema = z.enum(SEARCH_ACTIONS);

export const SearchFulltextSchema = z.object({
    action: z.literal("fulltext"),
    query: z.string().describe("Search query string"),
    method: z.number().optional().describe("Search method: 0=keyword (default), 1=query syntax, 2=SQL, 3=regex"),
    types: z.record(z.string(), z.boolean()).optional().describe("Block type filter. Accepts full names (e.g. {\"heading\": true}) or shortcodes (e.g. {\"h\": true, \"p\": true}). Codes: d=document, h=heading, p=paragraph, l=list, i=listItem, b=blockquote, c=codeBlock, m=mathBlock, t=table, s=superBlock, html=htmlBlock, embed=embedBlock, av=databaseBlock."),
    typeShortcodes: z.array(z.string()).optional().describe("Alternative shorthand type filter as array: [\"h\",\"p\"]. Merged with types if both provided."),
    paths: z.array(z.string()).optional().describe("Restrict search to specific notebook paths"),
    groupBy: z.number().optional().describe("0=no grouping (default), 1=group by document"),
    orderBy: z.number().optional().describe("Sort order: 0=type, 1=created ASC, 2=created DESC, 3=updated ASC, 4=updated DESC, 5=content ASC, 6=content DESC, 7=relevance (default)"),
    sortBy: z.string().optional().describe("Named sort alias: \"relevance\", \"date\", \"updated_desc\", \"updated_asc\", \"created_desc\", \"created_asc\", \"type\". Overrides orderBy if both provided."),
    page: z.number().optional().describe("Page number (1-based), default 1"),
    pageSize: z.number().optional().describe("Results per page, default 32, max 128"),
    parentId: z.string().optional().describe("Post-filter results to blocks whose root_id or parent_id matches this ID, scoping search within a document subtree."),
    hasTags: z.boolean().optional().describe("When true, only return blocks that have tags. When false, only return blocks without tags."),
    stripHtml: z.boolean().optional().describe("When true, preserves highlighted HTML while adding plain-text fields for easier downstream parsing"),
});

export const SearchQuerySqlSchema = z.object({
    action: z.literal("query_sql"),
    stmt: z.string().describe("SQL SELECT statement to execute against the blocks/spans/assets tables; returned rows are permission-filtered"),
});

export const SearchTagSchema = z.object({
    action: z.literal("search_tag"),
    k: z.string().describe("Tag keyword to search for"),
});

export const SearchGetBacklinksSchema = z.object({
    action: z.literal("get_backlinks"),
    id: z.string().describe("Block or document ID to find backlinks for"),
    keyword: z.string().optional().describe("Filter backlinks by keyword"),
    refTreeID: z.string().optional().describe("Optional document tree ID to narrow backlink scope"),
});

export const SearchGetBackmentionsSchema = z.object({
    action: z.literal("get_backmentions"),
    id: z.string().describe("Block or document ID to find backmentions for"),
    keyword: z.string().optional().describe("Filter backmentions by keyword"),
    refTreeID: z.string().optional().describe("Optional document tree ID to narrow backmention scope"),
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
    orderBy: z.number().optional().describe("Sort order"),
    groupBy: z.number().optional().describe("Grouping mode"),
    replaceTypes: z.record(z.string(), z.boolean()).optional().describe("Replace target kinds such as text, code, docTitle, blockRef"),
});

export const SearchAssetsSchema = z.object({
    action: z.literal("search_assets"),
    k: z.string().describe("Asset filename keyword"),
    exts: z.array(z.string()).optional().describe("Optional extension filters"),
});

export const SearchGetAssetContentSchema = z.object({
    action: z.literal("get_asset_content"),
    id: z.string().describe("Asset content ID"),
    query: z.string().describe("Matched query text"),
    queryMethod: z.number().optional().describe("Query method: 0=keyword, 1=query syntax, 2=SQL, 3=regex"),
});

export const SearchFulltextAssetContentSchema = z.object({
    action: z.literal("fulltext_asset_content"),
    query: z.string().describe("Search query string"),
    types: z.record(z.string(), z.boolean()).optional().describe("Asset type filter"),
    method: z.number().optional().describe("Search method: 0=keyword, 1=query syntax, 2=SQL, 3=regex"),
    orderBy: z.number().optional().describe("Sort order: 0=relevance DESC, 1=relevance ASC, 2=updated ASC, 3=updated DESC"),
    page: z.number().int().min(1).optional().describe("Page number (1-based)"),
    pageSize: z.number().int().min(1).max(128).optional().describe("Results per page"),
});

export const SearchListInvalidRefsSchema = z.object({
    action: z.literal("list_invalid_refs"),
    page: z.number().int().min(1).optional().describe("Page number (1-based)"),
    pageSize: z.number().int().min(1).max(128).optional().describe("Results per page"),
});

export const TagActionSchema = z.enum(TAG_ACTIONS);

export const TagListSchema = z.object({
    action: z.literal("list"),
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

export const SystemActionSchema = z.enum(SYSTEM_ACTIONS);

export const SystemWorkspaceInfoSchema = z.object({
    action: z.literal("workspace_info"),
});

export const SystemNetworkSchema = z.object({
    action: z.literal("network"),
});

export const SystemChangelogSchema = z.object({
    action: z.literal("changelog"),
});

export const SystemConfSchema = z.object({
    action: z.literal("conf"),
    mode: z.enum(["summary", "get"]).optional().describe('Read mode: "summary" returns a navigable overview, "get" reads a specific key path'),
    keyPath: z.string().optional().describe('Dot/bracket path to a specific config field, e.g. "conf.appearance.mode" or "conf.langs[0]"'),
    maxDepth: z.number().int().min(0).max(5).optional().describe('Maximum object traversal depth for summary/get responses'),
    maxItems: z.number().int().min(1).max(100).optional().describe('Maximum keys/items to include per level'),
});

export const SystemSysFontsSchema = z.object({
    action: z.literal("sys_fonts"),
    mode: z.enum(["summary", "list"]).optional().describe('Read mode: "summary" returns counts and samples, "list" returns paginated items'),
    offset: z.number().int().min(0).optional().describe('Pagination offset for list mode'),
    limit: z.number().int().min(1).max(200).optional().describe('Pagination size for list mode'),
    query: z.string().optional().describe('Optional keyword filter for font names'),
});

export const SystemBootProgressSchema = z.object({
    action: z.literal("boot_progress"),
});

export const SystemPushMsgSchema = z.object({
    action: z.literal("push_msg"),
    msg: z.string().describe("Message content"),
    timeout: z.number().optional().describe("Display timeout in milliseconds"),
});

export const SystemPushErrMsgSchema = z.object({
    action: z.literal("push_err_msg"),
    msg: z.string().describe("Error message content"),
    timeout: z.number().optional().describe("Display timeout in milliseconds"),
});

export const SystemGetVersionSchema = z.object({
    action: z.literal("get_version"),
});

export const SystemGetCurrentTimeSchema = z.object({
    action: z.literal("get_current_time"),
});

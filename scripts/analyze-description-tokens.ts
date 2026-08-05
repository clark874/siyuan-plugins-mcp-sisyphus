/**
 * 分析 MCP 工具描述的 token 数量
 * 用于统计各级别披露（description）的 token 数量
 */

// 工具基础描述（来自各个工具文件）
const toolBaseDescriptions: Record<string, string> = {
  notebook: '📚 Grouped notebook operations.',
  document: '📝 Grouped document operations.',
  block: '🧱 Grouped block operations.',
  av: '🗃️ Grouped attribute-view (database) operations.',
  file: '📁 Grouped file and asset operations.',
  search: '🔍 Grouped search and query operations.',
  tag: '🏷️ Grouped tag operations.',
  timeline: '🕓 Grouped document timeline, snapshot diff, and rollback operations.',
  system: '🖥️ Grouped system and notification operations.',
  mascot: '🐾 Grouped mascot balance and care operations. Every successful MCP tool call earns 1 coin for the mascot.',
};

// 各工具的操作列表（基础操作）
const toolBasicActions: Record<string, string[]> = {
  notebook: ['list', 'create', 'open', 'close', 'rename', 'get_conf', 'get_child_docs'],
  document: ['create', 'resolve', 'rename', 'get_child_blocks', 'get_child_docs', 'search_docs', 'get_doc'],
  block: ['insert', 'prepend', 'append', 'update', 'get_kramdown', 'get_children', 'set_attrs', 'get_attrs', 'exists', 'info'],
  av: ['get', 'search', 'get_primary_key_values'],
  file: ['export_md', 'upload_asset'],
  search: ['fulltext', 'query_sql', 'search_tag', 'get_backlinks', 'get_backmentions'],
  tag: ['list', 'rename'],
  timeline: ['list_nodes', 'create_node', 'compare_node'],
  system: ['get_version', 'get_current_time', 'conf', 'boot_progress'],
  mascot: ['get_balance', 'shop', 'buy'],
};

// 各工具的操作列表（高级操作）
const toolAdvancedActions: Record<string, string[]> = {
  notebook: ['remove', 'set_conf', 'set_icon', 'get_permissions', 'set_permission'],
  document: ['remove', 'move', 'set_icon', 'set_cover', 'clear_cover', 'list_tree', 'create_daily_note'],
  block: ['delete', 'move', 'fold', 'unfold', 'transfer_ref', 'breadcrumb', 'dom', 'recent_updated', 'word_count'],
  av: ['add_rows', 'remove_rows', 'add_column', 'remove_column', 'set_cells', 'duplicate_block'],
  file: ['render_template', 'render_sprig', 'export_resources'],
  search: [],
  tag: ['remove'],
  timeline: ['delete_node', 'rollback_document', 'rollback_block'],
  system: ['workspace_info', 'network', 'changelog', 'sys_fonts', 'push_msg', 'push_err_msg'],
  mascot: [],
};

// Guidance 文本（每个工具的前2条最重要的）
const toolGuidance: Record<string, string[]> = {
  notebook: [
    'Use notebook IDs for open, close, rename, get_conf, and set_conf.',
    'notebook(action="get_permissions") supports notebook="all" (or omission) for all notebooks, and a specific notebook ID for one notebook.',
  ],
  document: [
    'document(action="create") uses a human-readable target path such as /Inbox/Weekly Note.',
    'Other document actions that use notebook + path expect storage paths returned by document(action="resolve", id=..., include=["path"]).',
  ],
  block: [
    'block(action="prepend") or block(action="append") with a document ID targets the document start or end.',
    'block(action="update") is best for single-block replacement. Multi-line markdown may be truncated to the first line by SiYuan; use append/prepend/insert when you need multiple blocks, tables, or longer multi-line content.',
  ],
  av: [
    'AV actions operate on real SiYuan attribute views (database blocks), not Markdown tables.',
    'The current MCP AV tool supports operating on existing AVs and duplicating database blocks, but it does not create a brand-new AV from scratch.',
  ],
  file: [
    'file(action="upload_asset") reads a local file path and uploads that file into SiYuan assets. Because it reads the local filesystem, it requires explicit user confirmation before execution.',
    'If the file is larger than the configured large-upload threshold (10 MB by default), MCP must stop and ask the user for explicit confirmation before retrying with confirmLargeFile=true.',
  ],
  search: [
    'All search actions are read-only and do not modify any data.',
    'search(action="query_sql") only accepts SELECT statements; mutation queries will be rejected, and returned rows are filtered by notebook permission.',
  ],
  tag: [
    'Tag actions operate across the whole workspace rather than a single notebook.',
    'There is no direct create action for tags; tags are created by writing #标签# into block markdown content.',
  ],
  timeline: [
    'timeline manages named document and global snapshot nodes, compares one document against a node, and can restore historical content.',
    'compare_node creates an untagged current-state workspace snapshot before calculating the document diff.',
  ],
  system: [
    'All system actions in this tool are read-only.',
    'system(action="workspace_info") exposes the workspace path and is high-risk; it is disabled by default.',
  ],
  mascot: [
    'mascot actions operate on the cat\'s spendable balance.',
    'Every successful MCP tool call earns 1 coin for the cat, so the fastest way to earn balance is simply to keep using SiYuan MCP tools.',
  ],
};

// 简单的 token 估算函数（按空格和标点分割）
function estimateTokens(text: string): number {
  // 英文大致按 1 token ≈ 0.75 个单词，中文大致 1 字 ≈ 1.5 tokens
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(words.length * 1.0 + chineseChars * 1.5 + otherChars * 0.3);
}

// 构建层级描述（模仿 buildTieredDescription 函数）
function buildTieredDescription(tool: string): string {
  const baseDesc = toolBaseDescriptions[tool];
  const basicActions = toolBasicActions[tool] || [];
  const advancedActions = toolAdvancedActions[tool] || [];
  const guidance = toolGuidance[tool] || [];

  const parts: string[] = [
    `${baseDesc} Use the "action" field to select the operation.`,
  ];

  if (basicActions.length > 0) {
    parts.push(`Common actions: ${basicActions.join(', ')}.`);
  }

  if (advancedActions.length > 0) {
    parts.push(`Additional actions: ${advancedActions.join(', ')}. Read siyuan://help/action/${tool}/{action} for details, or call action="help" if resources are unavailable.`);
  }

  // 包含前2条 guidance
  if (guidance.length > 0) {
    parts.push(guidance.slice(0, 2).join(' '));
  }

  return parts.join('\n\n');
}

// 统计各工具的 action hints 文本
const actionHintsText: Record<string, string> = {
  notebook: `remove: This action requires explicit user confirmation.
set_icon: Use a notebook ID + icon. Prefer a Unicode hex code string such as "1f4d4" for 📔; raw emoji characters may not render correctly.
get_permissions: Omit notebook or pass notebook="all" to return all notebook permissions. Pass a specific notebook ID to return one notebook only.
get_child_docs: Use a notebook ID. Returns direct child documents at the notebook root, retries short initialization windows, and distinguishes notebook-not-found / closed-or-initializing failures.`,
  document: `create: Use notebook + path + markdown, where path is human-readable.
rename: Use either id + title or notebook + path + title.
remove: Use either id or notebook + path. This action requires explicit user confirmation.
move: Use either fromIDs + toID or fromPaths + toNotebook + toPath. For path-based moves, toPath must be the storage path of an existing destination document. This action requires explicit user confirmation.
resolve: Use exactly one source: id, notebook + path, or notebook + hpath. include selects id/ids/path/hpath/docInfo. Right after create, a short retry may still be needed while SiYuan indexing catches up.
get_child_blocks: Use a document ID. Returns direct child blocks only.
get_child_docs: Use a document ID. Returns direct child documents only.
set_icon: Use a document ID + icon. Prefer a Unicode hex code string such as "1f4d4" for 📔; raw emoji characters may not render correctly.
set_cover: Use a document ID + source, where source is either an http(s) URL or a SiYuan asset path like /assets/foo.png. MCP stores it in the "title-img" attribute.
clear_cover: Use a document ID to clear the document cover by resetting the "title-img" attribute.
list_tree: Use notebook + path, where path is a storage path such as / or /20240318112233-abc123.sy.
search_docs: Use notebook + query, and optionally path as a storage-path scope. Search is title-based in SiYuan; MCP then filters by notebook permission and optional storage path.
get_doc: Use a document ID. mode="markdown" returns clean Markdown content and supports page/pageSize for long documents; mode="html" uses the current focus view. For structured reading, prefer get_child_blocks.
create_daily_note: Use a notebook ID and optionally pass app for downstream SiYuan event routing. When the user asks for a diary, journal entry, daily log, or today's note in a notebook, prefer this action over manually creating a path and then appending content.`,
  block: `insert: nextID inserts BEFORE that block; previousID inserts AFTER that block. Provide at least one of nextID, previousID, or parentID. Returns a slim success object with the created block ID. Use #标签# syntax in markdown when you want SiYuan to register a real tag.
prepend: parentID can be either a document ID or block ID; behavior differs. Returns a slim success object with the created block ID. Use #标签# syntax in markdown when you want SiYuan to register a real tag.
append: parentID can be either a document ID or block ID; behavior differs. Returns a slim success object with the created block ID. Prefer append when you need to add multi-line markdown, tables, or multiple new blocks. Use #标签# syntax in markdown when you want SiYuan to register a real tag.
update: Use dataType + data + id to replace block content. Returns a slim success object instead of raw DOM operations. block(action="update") is best for single-block replacement; multi-line markdown may be truncated to the first line by SiYuan, so use append/prepend/insert when you need multiple blocks or tables. If the content should create tags, write them as #标签#.
set_attrs: Use attrs to write block attributes such as custom metadata. To mark a flashcard, set {"custom-riff-decks":"<deck-id>"} on the question block, commonly an h2 heading.
delete: This action requires explicit user confirmation.
move: Provide id plus previousID, parentID, or both to describe the destination. On success, MCP returns a structured success object instead of SiYuan's raw null. This action requires explicit user confirmation.
fold: Use a foldable block ID.
unfold: Use a foldable block ID.
get_children: Accepts both document IDs and block IDs. Returns direct child blocks. Use page/pageSize to paginate when there are many children.
exists: Returns a boolean existence check for a block ID.
info: Returns root document positioning metadata for a block.
breadcrumb: Optional excludeTypes removes matching block types from the breadcrumb.
dom: Returns rendered DOM, useful for preview-style consumers.
recent_updated: Returns recent updates across the workspace, then MCP filters unreadable notebooks and applies count when provided. documents is the primary user-facing summary; items remains the raw block stream.
word_count: Provide one or more block IDs to receive aggregate stat data.`,
  av: `get: Use an attribute view ID. Returns the full AV payload after permission checks.
search: Searches AV/database definitions by keyword and post-filters unreadable results. Unresolvable matches remain discoverable in unresolvedResults, alongside raw result counts and filtering reasons.
add_rows: Use avID + blockIDs to add existing blocks as rows. MCP now polls briefly after insertion and only reports success when each source blockID resolves to exactly one writable rowID. Optional blockID/viewID/groupID/previousID refine the insertion target.
remove_rows: Use avID + srcIDs to remove rows from the AV.
add_column: Use avID + keyName + keyType, and optionally keyID. MCP generates keyID automatically when omitted. Supported keyType values match the 16 SiYuan addable column types, including keyType="mSelect", keyType="mAsset", and keyType="lineNumber".
remove_column: Use avID + keyID. removeRelationDest only matters for relation columns.
set_cells: Use avID plus either top-level rowID + columnID + valueType for one cell or cells[] for multiple cells. Each cell requires rowID + columnID + valueType and the matching typed field. MCP rejects cell value IDs and source block IDs, and suggests the matching row item ID when it can. valueType="mAsset" accepts assets[].
duplicate_block: MCP first calls the kernel duplicate API, then inserts the duplicated NodeAttributeView block into the document tree. By default it inserts after the source database block; provide previousID to override the insertion target.
get_primary_key_values: Returns the AV name plus primary-key rows, with optional keyword/page/pageSize filtering.`,
  file: `upload_asset: Use assetsDirPath + localFilePath to read a local file and upload it into SiYuan assets. This action reads the local filesystem and requires explicit user confirmation. Files larger than the configured large-upload threshold (10 MB by default) must be stopped, confirmed by the user, and retried with confirmLargeFile=true.
render_template: Use id + path, where path points to a template file inside the SiYuan workspace. Local filesystem paths outside the workspace are rejected by the kernel.
export_resources: Provide one or more existing resource paths. Asset paths like assets/foo.txt are normalized to /data/assets/foo.txt before export. Set outputPath to also copy the exported ZIP to a local filesystem path. Using outputPath is high-risk and requires explicit user confirmation.`,
  search: `fulltext: Pass a query string. Supports keyword, query syntax, SQL, and regex modes via the method parameter. Set stripHtml=true to add plain-text fields alongside highlighted HTML content.
query_sql: Execute a SELECT statement. Common tables: blocks, spans, assets. Always use LIMIT to control result size. MCP returns rows plus metadata such as rowCount and possible permission-filtering info.
search_tag: Returns all tags matching the given keyword prefix.
get_backlinks: Returns documents/blocks that contain a reference ((ref)) to the given block ID. Partial permission-filtered results include machine-readable metadata.
get_backmentions: Returns documents/blocks that mention the name of the given block (text mention, not ref link). Partial permission-filtered results include machine-readable metadata.`,
  tag: `list: Optional sort, ignoreMaxListHint, and app are passed through to SiYuan.
rename: Renames a workspace tag label everywhere it appears.
remove: Deletes a workspace tag label. This action requires explicit user confirmation.`,
  timeline: `list_nodes: Lists global or document timeline nodes with pagination.
create_node: Creates a named global or document node and returns its stable tag.
compare_node: Returns paginated block changes and opaque changeKey values.
delete_node: Removes only the protective tag; dangerous and disabled by default.
rollback_document: Restores one document file; dangerous and disabled by default.
rollback_block: Restores one still-matching block change; dangerous and disabled by default.`,
  system: `workspace_info: Returns workspace path metadata and current SiYuan version. High-risk: leaks the absolute workspace path; disabled by default and requires explicit user confirmation.
network: Returns masked proxy information only.
changelog: Returns show/html fields for the current version changelog when available.
conf: Defaults to a navigable summary. Use mode="get" with keyPath to read one config field or subtree at a time, e.g. conf.appearance.mode or conf.langs[0].
sys_fonts: Defaults to a summary. Use mode="list" with offset/limit/query to page through font names.
boot_progress: Returns progress plus human-readable details.
push_msg: Show a notification in the SiYuan UI. Optional timeout is in milliseconds.
push_err_msg: Show an error notification in the SiYuan UI. Optional timeout is in milliseconds.
get_version: Returns the current SiYuan version as {version}.
get_current_time: Returns the current system time as {currentTime} epoch milliseconds and {iso} ISO 8601 text.`,
  mascot: `get_balance: Returns the cat's current balance and lifetime earned count. Each successful MCP tool call adds 1 coin and increments the lifetime count.
shop: Returns the current mascot shop inventory including stable item IDs, labels, cost, type, and emoji.
buy: Buys one shop item by item_id and deducts its configured cost from balance.`,
};

// 主分析函数
function analyzeTokens() {
  console.log('='.repeat(80));
  console.log('MCP 工具描述 Token 数量分析报告');
  console.log('='.repeat(80));
  console.log();

  const tools = Object.keys(toolBaseDescriptions);
  
  // 各级别统计
  let totalBaseTokens = 0;
  let totalTieredTokens = 0;
  let totalHintsTokens = 0;
  
  const results: Array<{
    tool: string;
    baseTokens: number;
    tieredTokens: number;
    hintsTokens: number;
    actionCount: number;
  }> = [];

  for (const tool of tools) {
    // 1. 基础描述
    const baseDesc = toolBaseDescriptions[tool];
    const baseTokens = estimateTokens(baseDesc);
    
    // 2. 层级描述（buildTieredDescription 输出）
    const tieredDesc = buildTieredDescription(tool);
    const tieredTokens = estimateTokens(tieredDesc);
    
    // 3. Action Hints
    const hintsText = actionHintsText[tool] || '';
    const hintsTokens = estimateTokens(hintsText);
    
    const basicCount = toolBasicActions[tool]?.length || 0;
    const advancedCount = toolAdvancedActions[tool]?.length || 0;
    
    results.push({
      tool,
      baseTokens,
      tieredTokens,
      hintsTokens,
      actionCount: basicCount + advancedCount,
    });
    
    totalBaseTokens += baseTokens;
    totalTieredTokens += tieredTokens;
    totalHintsTokens += hintsTokens;
  }

  // 打印详细表格
  console.log('📊 各工具 Token 数量详情');
  console.log('-'.repeat(80));
  console.log('工具名称        | 基础描述 | 层级描述 | Action Hints | 操作数量 | 层级/基础');
  console.log('-'.repeat(80));
  
  for (const r of results) {
    const ratio = (r.tieredTokens / r.baseTokens).toFixed(1);
    console.log(
      `${r.tool.padEnd(15)} | ${r.baseTokens.toString().padStart(8)} | ${r.tieredTokens.toString().padStart(8)} | ${r.hintsTokens.toString().padStart(12)} | ${r.actionCount.toString().padStart(8)} | ${ratio.padStart(8)}x`
    );
  }
  
  console.log('-'.repeat(80));
  console.log(
    `${'合计'.padEnd(15)} | ${totalBaseTokens.toString().padStart(8)} | ${totalTieredTokens.toString().padStart(8)} | ${totalHintsTokens.toString().padStart(12)} |`
  );
  console.log();

  // 打印各级别汇总
  console.log('📈 各级别披露统计');
  console.log('-'.repeat(80));
  console.log(`Level 1 - 基础描述 (Base):          ${totalBaseTokens.toString().padStart(6)} tokens`);
  console.log(`Level 2 - 层级描述 (Tiered):        ${totalTieredTokens.toString().padStart(6)} tokens (+${totalTieredTokens - totalBaseTokens})`);
  console.log(`Level 3 - Action Hints:             ${totalHintsTokens.toString().padStart(6)} tokens`);
  console.log(`Level 4 - 完整 InputSchema:         (包含所有属性描述，估算约 ${Math.round(totalTieredTokens * 2.5)} tokens)`);
  console.log();
  
  // 打印示例
  console.log('📝 披露层级示例 (以 notebook 工具为例)');
  console.log('-'.repeat(80));
  console.log('【Level 1 - 基础描述】');
  console.log(toolBaseDescriptions.notebook);
  console.log();
  console.log('【Level 2 - 层级描述 (实际披露给 LLM 的描述)】');
  console.log(buildTieredDescription('notebook'));
  console.log();
  console.log('【Level 3 - Action Hints (action="help" 时返回)】');
  console.log(actionHintsText.notebook.split('\n').slice(0, 3).join('\n'));
  console.log('...');
  console.log();
  
  // 计算平均
  const avgBase = Math.round(totalBaseTokens / tools.length);
  const avgTiered = Math.round(totalTieredTokens / tools.length);
  console.log('📊 平均值统计');
  console.log('-'.repeat(80));
  console.log(`每个工具平均基础描述: ${avgBase} tokens`);
  console.log(`每个工具平均层级描述: ${avgTiered} tokens`);
  console.log(`层级描述是基础描述的 ${(avgTiered / avgBase).toFixed(1)} 倍`);
  console.log();
  
  // 总工具描述估算
  console.log('🔢 MCP Server 总描述估算');
  console.log('-'.repeat(80));
  // 9个聚合工具
  const totalToolsDescription = totalTieredTokens;
  console.log(`9个聚合工具的总描述: ~${totalToolsDescription} tokens`);
  console.log(`加上 InputSchema 属性描述后: ~${Math.round(totalToolsDescription * 2.5)} tokens`);
  console.log();
  console.log('='.repeat(80));
}

// 运行分析
analyzeTokens();

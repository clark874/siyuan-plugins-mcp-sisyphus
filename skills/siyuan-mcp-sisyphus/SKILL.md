---
name: siyuan-mcp-sisyphus
description: Operate SiYuan notes via 8 aggregated MCP tools (notebook/document/block/file/search/tag/system/mascot). Covers path semantics, permissions, block editing, search, tags, export, and mascot actions.
---

# SiYuan MCP Sisyphus

8 aggregated MCP tools for SiYuan note operations. Each tool takes an `action` parameter. Full parameter schemas are in the tool descriptions; use `action="help"` on any tool for detailed guidance.

## Recommended Workflow

1. **Explore**: `notebook(action="list")`, `system(action="get_version")`
2. **Locate**: `document(action="get_path" | "get_hpath" | "get_ids")`
3. **Write**: `document(action="create" | "rename" | "move")`, `block(action="append" | "update" | ...)`
4. **Verify**: `document(action="get_child_blocks")` or `block(action="get_children")`

## Getting Help

- Call any tool with `action="help"` to get its actions, required fields, hints, and examples.
- MCP resources are also available if your client supports them:
  - `siyuan://help/tool-overview` — all tools, enabled actions, and guidance
  - `siyuan://help/document-path-semantics` — path type details with examples
  - `siyuan://help/examples` — minimal call examples for common actions
  - `siyuan://help/ai-layout-guide` — layout and block-type decision rules
  - `siyuan://help/action/{tool}/{action}` — per-action parameter shapes

## Disabled-by-Default Actions

These actions return `{error: {type: "action_disabled"}}` unless enabled in SiYuan plugin settings.

| Tool | Action |
|------|--------|
| notebook | `remove` |
| notebook | `set_permission` |
| document | `remove` |
| block | `delete` |

## Permission System

Four levels per notebook: `rwd` (read/write/delete), `rw` (read/write), `r` (read only), `none` (all blocked).

Check with `notebook(action="get_permissions")`. Change with `notebook(action="set_permission")`.

## Dangerous Actions (Require User Confirmation)

Before calling any of these, describe the action and wait for explicit user agreement:

- `notebook(action="remove")` — if enabled
- `document(action="remove")` — if enabled
- `document(action="move")`
- `block(action="delete")` — if enabled
- `block(action="move")`
- `file(action="upload_asset")` — reads local filesystem
- `file(action="export_resources", outputPath=...)` — writes to local filesystem

## Quick Reference

### Path semantics

| Type | Used by | Example |
|------|---------|---------|
| **Human-readable** | `document.create`, `document.get_ids` | `/Inbox/Weekly Note` |
| **Storage path** | `document.rename`, `document.remove`, `document.move`, `document.get_hpath` (with notebook+path) | `/20240318112233-abc123.sy` |

Safe workflow: `document(action="get_path", id=...)` first, then reuse the returned storage path.

### Tag creation

No direct `tag.create` — write `#标签#` into block markdown. Hierarchical: `#项目/阶段#`.

### Flashcard marking

`block(action="set_attrs", id=..., attrs={"custom-riff-decks":"<deck-id>"})`. Use h2 as question, following blocks as answer.

## AV / Database Pitfalls

When operating SiYuan attribute views (`av`), prefer this workflow:

1. Create columns with `av(action="add_column")`
2. Create source docs/blocks with `document(action="create")`
3. Bind existing blocks as rows with `av(action="add_rows")`
4. Fetch the AV with `av(action="get")`
5. Fill cells with `av(action="set_cell")` or `av(action="batch_set_cells")`

### Important distinctions

- `add_rows` does **not** create brand-new database rows from scratch; it binds **existing block IDs** into the database. Always create the source document/block first, then pass its `blockID` via `blockIDs`.
- AV row identity is not the same as the source block identity:
  - `block.id`: original document/block ID
  - `blockID`: the row binding ID (`itemID`) inside the database
  - `id`: the cell value ID, not the row ID
- For cell updates, use the AV row item ID stored in `value.blockID`, **not** `value.id` and **not** the bound source `block.id`.

### Parameter gotchas

- `av(action="add_rows")` requires `blockIDs`.
- `av(action="set_cell")` and `av(action="batch_set_cells")` use `columnID`, **not** `keyID`.
- Even if `av(action="get")` returns column metadata under a field named `key`, write operations still require `columnID`.

### Practical notes

- After `add_rows`, prefer the returned `rows[{ blockID, rowID }]` mapping directly; MCP only reports success after it can observe those writable `rowID`s.
- If you need to re-read manually, call `av(action="get")` to map each row binding back to its source block:
  - inspect `keyValues[].values[].block.id` for the bound source block
  - inspect `keyValues[].values[].blockID` for the writable row item ID
- `set_cell` / `batch_set_cells` reject cell `value.id` and source `block.id`, and return a suggested writable `rowID` when MCP can detect the mismatch.
- Date values should use ISO strings, for example `2026-04-06T00:00:00+08:00`.

### Minimal examples

```ts
// 1) create a source document/block first
document(action="create", notebook="xxx", path="/记账/行1", markdown="内容")

// 2) bind existing blocks into the AV as rows
av(action="add_rows", avID="...", blockIDs=["行1-blockID", "行2-blockID"])

// 3) set a single cell with row itemId + columnID
av(action="set_cell", rowID="itemId", columnID="...", valueType="text", text="xxx")

// 4) batch update cells with columnID
av(action="batch_set_cells", items=[
  { rowID: "itemId", columnID: "...", valueType: "text", text: "xxx" }
])
```

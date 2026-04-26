---
name: siyuan-mcp-sisyphus
description: Operate SiYuan notes through SiYuan Sisyphus MCP or CLI. Covers 10 aggregated tools (notebook/document/block/av/search/file/tag/system/flashcard/mascot), path semantics, permissions, block editing, search, databases, flashcards, export, and mascot actions.
---

# SiYuan MCP Sisyphus

SiYuan Sisyphus exposes 10 aggregated tools for SiYuan note operations. The same tool/action implementation is available through:

- MCP calls: `block(action="append", ...)`
- CLI commands: `siyuan-sisyphus block append ...` or `siyuan block append ...`

Each tool takes an `action` parameter in MCP mode. In CLI mode the action is the second positional command and flags are mapped from schema fields.

## Version Awareness

- Plugin / MCP server version lives in root `package.json` and `plugin.json`.
- Standalone CLI version lives in `cli/package.json` and can differ from the plugin version.
- Do not infer CLI capabilities only from the plugin version; check the installed CLI with `siyuan-sisyphus --version` when CLI-specific behavior matters.
- Both entrypoints share the same core tool handlers, but CLI has its own parser, renderer, config file, and npm release cycle.

## Recommended Workflow

1. **Choose entrypoint**: MCP for AI-client tool calls; CLI for shell/script use.
2. **Explore**: `notebook(action="list")`, `system(action="get_version")`, or `siyuan notebook list`.
3. **Locate**: `document(action="get_path" | "get_hpath" | "get_ids")`.
4. **Write**: `document(action="create" | "rename" | "move")`, `block(action="append" | "update" | ...)`.
5. **Verify**: `document(action="get_child_blocks")` or `block(action="get_children")`.

## Getting Help

- Call any tool with `action="help"` to get its actions, required fields, hints, and examples.
- In CLI mode, use `siyuan-sisyphus list`, `siyuan-sisyphus list <tool>`, and `siyuan-sisyphus help <tool> <action>`.
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
| document | `remove` |
| block | `delete` |

## Permission System

Four levels per notebook: `rwd` (read/write/delete), `rw` (read/write), `r` (read only), `none` (all blocked).

Check with `notebook(action="get_permissions")`. Change with `notebook(action="set_permission")`.

CLI reads the same plugin UI configuration and notebook permissions through the SiYuan API. Disabled tools/actions are hidden from CLI `list`/`help` and cannot be executed.

## Dangerous Actions (Require User Confirmation)

Before calling any of these, describe the action and wait for explicit user agreement:

- `notebook(action="remove")` — if enabled
- `document(action="remove")` — if enabled
- `document(action="move")`
- `block(action="delete")` — if enabled
- `block(action="move")`
- `search(action="find_replace")`
- `file(action="upload_asset")` — reads local filesystem
- `file(action="export_resources", outputPath=...)` — writes to local filesystem
- `file(action="remove_unused_assets")`
- `file(action="delete_asset")`
- `notebook(action="set_permission")`

In CLI mode, user-entered commands are treated as confirmation; do not add extra interactive confirmation unless explicitly requested.

## Tool Set

| Tool | Main use |
|------|----------|
| `notebook` | notebook list/create/open/permission operations |
| `document` | document create/rename/move/tree/path operations |
| `block` | block insert/update/delete/attrs/children operations |
| `av` | SiYuan database / attribute-view rows, columns, and cells |
| `search` | fulltext, SQL, refs, backlinks, assets, find/replace |
| `file` | assets, export, templates, OCR, unused assets |
| `tag` | list/rename/remove tags |
| `system` | version, time, config summary, fonts, notifications |
| `flashcard` | decks, due cards, review, create/add/remove cards |
| `mascot` | mascot balance, shop, and buy actions |

## CLI Notes

- Package name: `siyuan-sisyphus`.
- Binaries: `siyuan-sisyphus` and `siyuan`.
- Config path: `~/.siyuan-sisyphus/config.json`; legacy `~/.siyuan-mcp/config.json` may be read as fallback.
- Config priority: CLI flags (`--url`, `--token`, `--profile`) > environment (`SIYUAN_API_URL`, `SIYUAN_TOKEN`) > active profile > defaults.
- Complex values can use JSON flags such as `--attrs-json '{"custom-x":"y"}'`.
- Field names may be passed as kebab/camel/snake where supported, for example `--parent-id` maps to `parentID`.

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
2. Create source docs/blocks with `document(action="create")`, or prepare detached primary-key text values
3. Bind existing blocks as rows with `av(action="add_rows", blockIDs=[...])`, or create detached rows with `primaryKeyTexts`
4. Fetch the AV with `av(action="get")`
5. Fill cells with `av(action="set_cell")` or `av(action="batch_set_cells")`

### Important distinctions

- `add_rows` can bind existing block IDs via `blockIDs`. Current versions also support detached rows through `primaryKeyTexts`.
- AV row identity is not the same as the source block identity:
  - `block.id`: original document/block ID
  - `blockID`: the row binding ID (`itemID`) inside the database
  - `id`: the cell value ID, not the row ID
- For cell updates, use the AV row item ID stored in `value.blockID`, **not** `value.id` and **not** the bound source `block.id`.

### Parameter gotchas

- `av(action="add_rows")` requires either `blockIDs` or `primaryKeyTexts`.
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

// 2b) or create detached rows from primary-key text
av(action="add_rows", avID="...", primaryKeyTexts=["行1", "行2"])

// 3) set a single cell with row itemId + columnID
av(action="set_cell", rowID="itemId", columnID="...", valueType="text", text="xxx")

// 4) batch update cells with columnID
av(action="batch_set_cells", items=[
  { rowID: "itemId", columnID: "...", valueType: "text", text: "xxx" }
])
```

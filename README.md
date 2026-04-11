# SiYuan MCP Sisyphus

[English](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/README.md) | [中文](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/README_zh_CN.md)

> **Latest:** `v0.2.4` — Removed built-in data snapshot sidebar (duplicates SiYuan's native feature). Use "Main Menu → Data History → Data Snapshots" instead. See full history in [CHANGELOG.md](./CHANGELOG.md).

> Recommended pairing: use this plugin together with [AI CLI Bridge for SiYuan](https://github.com/yangtaihong59/siyuan-plugins-ai-cli-bridge) to embed OpenCode, Claude Code, and other AI CLI tools directly in the SiYuan sidebar.

This is an MCP server plugin that **connects SiYuan Note to AI agents**. Once installed, any MCP-capable agent can treat SiYuan as a callable toolset: read notes, search documents, edit block content, work with databases, and export resources.

If MCP is new to you, here is the simple version:

- **SiYuan** stores your notes and data
- **This plugin** exposes SiYuan as an MCP server
- **Your agent / MCP client** starts that server and calls its tools
- **MCP** is the protocol that lets agents talk to external tools in a standard way

In other words, the plugin does one simple thing: **make SiYuan safely visible and callable from your agent**.

## Features

- Aggregates common SiYuan capabilities into 10 grouped tools, reducing the chance that an agent picks the wrong tool
- Covers notebooks, documents, blocks, databases, assets, search, tags, flashcards, and system capabilities across 90 actions
- Provides a four-state permission model: `none` / `r` / `rw` / `rwd`, making notebook-level access control easier
- Follows a progressive disclosure design to reduce token usage

It currently exposes 10 aggregated tools:

- `notebook`
- `document`
- `block`
- `av`
- `file`
- `search`
- `tag`
- `system`
- `flashcard`
- `mascot`

Each tool uses a required `action` field instead of exposing dozens of endpoint-shaped tool names.

## Quick Start

### 1. Install the plugin

#### From SiYuan Marketplace

1. Open SiYuan Note
2. Go to `Settings -> Marketplace`
3. Search for `SiYuan MCP`
4. Install and enable the plugin

#### From source

```bash
git clone https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus.git
cd siyuan-plugins-mcp-sisyphus
pnpm install
pnpm run build
pnpm run make-link
```

### 2. Connect your agent

The plugin supports two connection modes. Use HTTP when your MCP client supports HTTP transport. Use `stdio` when the client is on the same machine as SiYuan or can access the plugin files through a mounted/shared path. For Docker / LAN deployments, the key point is: **the client runs `mcp-server.cjs`, and `mcp-server.cjs` talks to the Docker-hosted SiYuan instance through the SiYuan API port `6806`**.

---

#### Option A: HTTP mode

In HTTP mode, the plugin hosts an HTTP MCP server inside SiYuan. You only need to expose that server port to your MCP client. If your agent and SiYuan run on the same machine, that is often already reachable as-is.

**Step 1: Start the HTTP server**

1. Open `Plugin → siyuan-plugins-mcp-sisyphus → Settings → 🌐 Connection Config`
2. Default is `Host: 127.0.0.1`, `Port: 36806`
   - Change Host to `0.0.0.0` if your agent runs in WSL or another remote machine
3. Keep `Require Bearer token` enabled — a random token is already generated
4. Click `Start`. Status changes to `Running`.
5. Check `Auto-start with SiYuan` so you never have to start it manually again

**Step 2: Fill in the client config**

The settings panel includes three ready-to-copy snippets: `HTTP Connection`, `mcp-remote Bridge`, and `stdio Connection`.

It is suitable for Cline, Cherry Studio, Cursor, Windsurf, **Claude Code**, and other clients with native HTTP MCP support:

  ```json
  {
    “mcpServers”: {
      “siyuan”: {
        “type”: “http”,
        “url”: “http://127.0.0.1:36806/mcp”,
        “headers”: { “Authorization”: “Bearer <copy token from settings>” }
      }
    }
  }
  ```

> **WSL / cross-machine:** set Host to `0.0.0.0` and replace `127.0.0.1` in the client config with your Windows host IP (usually `192.168.x.x`). When binding to a non-loopback address, **always** keep token auth enabled — otherwise anyone on the same network can access your workspace.

---

#### Option B: stdio mode (same machine / mounted path / Docker)

Follow the documented `stdio` configuration. `6806` is the SiYuan API port, not an MCP port; do not point your MCP client directly at `http://<siyuan-host>:6806`. Instead, run `mcp-server.cjs` locally and let it connect through `SIYUAN_API_URL`.

```json
{
  “mcpServers”: {
    “siyuan”: {
      “command”: “node”,
      “args”: [“/your/siyuan/workspace/data/plugins/siyuan-plugins-mcp-sisyphus/mcp-server.cjs”],
      “env”: {
        “SIYUAN_API_URL”: “http://127.0.0.1:6806”,
        “SIYUAN_TOKEN”: “xxxxxx”
      }
    }
  }
}
```

- The settings example auto-fills the current SiYuan workspace path when available
- If your AI agent and SiYuan run on the same machine, the path is usually already directly accessible
- For LAN or container setups, the client must satisfy both conditions:
  - It can run `mcp-server.cjs` on the client machine, either by copying `dist/mcp-server.cjs` locally or by accessing the plugin file through a shared mount/path
  - It can reach the SiYuan API exposed by the Docker host, for example by setting `SIYUAN_API_URL` to `http://192.168.x.x:6806`
- If SiYuan API auth is disabled, omit `SIYUAN_TOKEN`
- `stdio` supports only one client at a time

> **Docker note:** SiYuan running in Docker cannot start the plugin's local HTTP MCP server from the Studio / browser frontend. Docker deployments should use the `stdio` setup above: run `mcp-server.cjs` on the client machine and connect it to the SiYuan API with `SIYUAN_API_URL=http://<Docker-host-IP>:6806`. When exposing `6806`, keep the SiYuan API token enabled and preferably restrict access to trusted devices with a firewall.

---

#### Option C: `mcp-remote` bridge

If your client only supports `stdio` but you still want to reach the HTTP server above, use `mcp-remote`:

```json
{
  "mcpServers": {
    "siyuan": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://127.0.0.1:36806/mcp",
        "--header",
        "Authorization: Bearer <token>"
      ]
    }
  }
}
```

---

### 3. What to try first

Start with low-risk, read-only requests to confirm the connection:

- “Show me the current SiYuan version.”
- “List my notebooks.”
- “Find documents with `Weekly` in the title.”

Corresponding tool calls: `system(action=”get_version”)`, `notebook(action=”list”)`, `document(action=”search_docs”, ...)`

### 4. Natural-language examples

- “List all my notebooks.”
- “Find documents with `Weekly` in the title.”
- “Append a todo to the end of this document: send weekly report tomorrow.”
- “Show backlinks for this block.”

If you are manually debugging MCP, the action tables and JSON-oriented sections below are still there.

---

### 5. Data Snapshots

The plugin no longer provides a separate data-repo snapshot manager because SiYuan already includes this capability.

Use SiYuan's built-in snapshot tool instead:

1. Open SiYuan's main menu
2. Go to `Data History -> Data Snapshots`
3. Create, compare, and restore snapshots from the official SiYuan interface

## Troubleshooting

### My agent cannot see the tools

- **HTTP mode**: confirm the settings panel shows `Running`; double-check the URL and token
- **stdio mode**: verify the path points to `mcp-server.cjs`; restart the client after config changes

### The server connects, but calls fail

- **HTTP mode**: the SiYuan API token is forwarded automatically by the plugin — no manual config needed. Check that SiYuan itself is running normally.
- **stdio mode**: check `SIYUAN_API_URL` (default `http://127.0.0.1:6806`) and `SIYUAN_TOKEN`
- Check whether the target notebook permission is set to `r` or `none`

### Why does the agent ask for confirmation?

That is expected. High-risk actions such as delete, move, local file upload, or permission changes are intentionally confirmation-gated.

## Tool Overview

- `notebook`: notebook-level operations
- `document`: create, move, query, and traverse documents
- `block`: block editing, attributes, folding, moving
- `av`: attribute view / database operations
- `file`: uploads, exports, template rendering
- `search`: full-text, SQL, backlinks, tag search
- `tag`: tag management
- `system`: version, time, notifications, config summary
- `flashcard`: review and deck operations
- `mascot`: balance, shop, and purchases

## Permission Model

- `rwd`: full read/write/delete access
- `rw`: read/write access, but delete actions are rejected
- `r`: read access only; all write and delete actions are rejected
- `none`: no read, write, or delete access
- `notebook(action="set_permission")` takes effect immediately for later `notebook`, `document`, and `block` calls
- For AI regression runs, preheat all 10 tools early so permission prompts do not interrupt the middle of a test

## High-Risk Actions

The server instructions require explicit user confirmation before these actions are called:

- `notebook(action="remove")`
- `notebook(action="set_permission")`
- `document(action="remove")`
- `document(action="move")`
- `block(action="delete")`
- `block(action="move")`
- `file(action="upload_asset")`
- `tag(action="remove")`
- `flashcard(action="remove_card")`

If your client shows MCP instructions, the model should ask for confirmation before executing them. This is an instruction-layer safety rule, not a server-side modal dialog guarantee.

In the default fallback config, `document(action="move")` and `block(action="move")` are still exposed. They are not safe to call without confirmation just because they are enabled.

Also note:

- `file(action="upload_asset")` on files larger than the configured threshold (`10 MB` by default) must stop the current operation and ask the user before retrying with `confirmLargeFile=true`.
- `document(action="move", fromPaths + toNotebook + toPath)` expects `toPath` to be the storage path of an existing destination document.
- `block(action="move")` returns a structured success object from MCP, even though the underlying SiYuan API may return `null`.

## MCP Client Configuration

OpenClaw / mcporter users can follow [SKILL.md](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/skills/siyuan-mcp-sisyphus/SKILL.md).

Detailed API ↔ MCP mapping: [API_MCP_MAPPING.md](./API_MCP_MAPPING.md)

## Design: Progressive Disclosure

The MCP tool layer is built around **progressive disclosure** — revealing complexity only when needed, rather than flooding the AI with everything upfront.

### Three layers

**① Tool description (what LLMs see first)**

Each tool's description leads with high-frequency **common actions** and their required fields. Low-frequency or high-risk **advanced actions** are listed by name only, with a pointer to on-demand documentation:

```
Common actions: list, create, rename, get_doc ...  (required fields shown)
Additional actions: remove, move, list_tree ...     → read siyuan://help/action/{tool}/{action}
```

This way `listTools()` returns concise, actionable information instead of a wall of 87 actions.

**② Help layer (on demand)**

- Per-action detail — parameters, semantics, caveats — lives in the `siyuan://help/action/{tool}/{action}` resource, fetched only when needed
- Call any tool with `action: "help"` to get a structured breakdown of all its actions, tiers, and hints inline (fallback for clients without resource support)

**③ Response layer (large results auto-summarise)**

Big result sets are capped and annotated with drill-down hints rather than returned in full:

| Scenario | Behaviour |
|----------|-----------|
| `search.fulltext` > 20 blocks | Truncated + `page`/`pageSize` pagination hint |
| `search.query_sql` > 50 rows | Truncated + `LIMIT`/`OFFSET` hint |
| `block.get_children` > 50 children | Truncated + `query_sql` filter hint |
| `document.list_tree` deep nodes | Collapsed to `childCount` beyond `maxDepth` (default 3) |
| `document.get_doc` > 8 000 chars | Truncated + `get_child_blocks` block-by-block hint |

**Design goals:** reduce first-call cognitive load; preserve full capability (all advanced actions remain usable); maintain backward compatibility with existing configs and tool names.

## Tool Model

### `notebook`

| Action | Description |
|--------|-------------|
| `list` | List all notebooks |
| `create` | Create a new notebook (supports `icon`, prefer Unicode hex strings like `1f4d4`) |
| `open` / `close` | Open or close a notebook |
| `rename` | Rename a notebook |
| `get_conf` / `set_conf` | Get or set notebook configuration |
| `set_icon` | Set notebook icon; prefer Unicode hex strings like `1f4d4` over raw emoji characters |
| `get_permissions` | List all notebook permission levels |
| `set_permission` | Change notebook MCP permission (`none` / `r` / `rw` / `rwd`) |
| `get_child_docs` | Get direct child documents at notebook root with retry-aware notebook-state handling |

### `document`

| Action | Description |
|--------|-------------|
| `create` | Create a document with markdown (supports `icon`, prefer Unicode hex strings like `1f4d4`) |
| `rename` | Rename a document by ID or storage path |
| `remove` | Remove a document by ID or storage path |
| `move` | Move documents by ID or storage path |
| `set_icon` | Set document or folder icon; prefer Unicode hex strings like `1f4d4` over raw emoji characters |
| `set_cover` | Set the document cover image, preferably from an `http(s)` URL and secondarily from a `/assets/...` path |
| `clear_cover` | Clear the document cover image |
| `get_path` | Get storage path by document ID |
| `get_hpath` | Get human-readable path by ID or storage path |
| `get_ids` | Get document IDs by human-readable path |
| `get_child_blocks` | Get direct child blocks of a document |
| `get_child_docs` | Get direct child documents of a document |
| `list_tree` | List the nested document tree under a notebook path |
| `search_docs` | Search documents by title keyword, then optionally narrow by storage path |
| `get_doc` | Get document content and metadata by ID (`markdown` returns clean Markdown; `html` returns the focus-view HTML payload) |
| `create_daily_note` | Create or return today’s daily note for a notebook |

Path semantics: `create` and `get_ids` use human-readable paths (e.g., `/Inbox/Weekly Note`). `rename`, `remove`, `move`, `get_hpath`, `list_tree`, and `search_docs.path` use storage paths returned by `get_path`. Use `get_ids` when you need to resolve a human-readable path to a document ID. Right after `create`, `get_ids` may briefly lag because it depends on SiYuan indexing.

Cover semantics: `set_cover` and `clear_cover` are semantic wrappers around the document root block's `title-img` attribute. Prefer passing a direct image URL to `set_cover`; only upload into `/assets/...` first when the user explicitly wants the image stored in SiYuan. To inspect the raw stored value, use `block(action="get_attrs", id=docId)`.

### `block`

| Action | Description |
|--------|-------------|
| `insert` / `prepend` / `append` | Insert a block at position, start, or end and return a slim success payload |
| `update` | Update block content and return a slim success payload |
| `delete` | Delete a block |
| `move` | Move a block to a new position |
| `fold` / `unfold` | Fold or unfold a foldable block |
| `get_kramdown` | Get block content in kramdown format |
| `get_children` | Get direct child blocks |
| `transfer_ref` | Transfer block references |
| `set_attrs` / `get_attrs` | Set or get block attributes, including custom metadata such as `custom-riff-decks` for flashcards |
| `exists` | Check whether a block exists |
| `info` | Get root document metadata for a block |
| `breadcrumb` | Get breadcrumb path for a block |
| `dom` | Get rendered DOM for a block |
| `recent_updated` | List recent updates with document-first summaries, filtered by notebook permission and optional `count` |
| `word_count` | Get word-count statistics for blocks |

### `av`

| Action | Description |
|--------|-------------|
| `get` | Get one attribute view (database) by `id` after permission checks |
| `search` | Search attribute views by keyword and post-filter unreadable or unresolved results |
| `add_rows` | Bind existing blocks into a database as rows and return writable `rowID` mappings when resolved |
| `remove_rows` | Remove bound rows from an attribute view |
| `add_column` | Add a supported database column such as `text`, `number`, `mSelect`, `mAsset`, or `lineNumber` |
| `remove_column` | Remove one column from an attribute view |
| `set_cell` | Update one database cell with a strongly typed payload; use the AV row item ID stored in `value.blockID` |
| `batch_set_cells` | Update multiple cells in one call and reject source block IDs or value IDs when they are not writable row IDs |
| `duplicate_block` | Duplicate the underlying database block and insert the duplicate into the document tree near the source block |
| `get_primary_key_values` | List primary-key rows for an attribute view, with optional keyword and pagination filters |

AV notes: this tool operates on real SiYuan attribute views rather than Markdown tables. MCP can bind existing blocks as rows, but it does not create a brand-new database from scratch. For writes, distinguish three identities carefully: `block.id` is the bound source block ID, `blockID` is the writable AV row item ID, and `id` is only the cell value ID.

### `file`

| Action | Description |
|--------|-------------|
| `upload_asset` | Read a local file path and upload that file asset (requires confirmation; files larger than the configured threshold, `10 MB` by default, must stop and ask the user before retrying with `confirmLargeFile=true`) |
| `render_template` | Render a template with document context |
| `render_sprig` | Render a Sprig template |
| `export_md` | Export document as Markdown |
| `export_resources` | Export resources as ZIP, accepting `assets/...`, normalizing to `data/assets/...`, and optionally copying to local `outputPath` (requires confirmation when writing locally) |

### `system`

| Action | Description |
|--------|-------------|
| `push_msg` / `push_err_msg` | Push notification or error message |
| `get_version` / `get_current_time` | Get SiYuan version or current time (`get_current_time` also returns ISO text) |
| `workspace_info` | Get SiYuan workspace metadata. High risk: exposes the absolute workspace path; disabled by default |
| `network` | Get masked network proxy information |
| `changelog` | Get the current version changelog when available |
| `conf` | Get masked system configuration with summary-first progressive reading |
| `sys_fonts` | List available system fonts with summary-first paginated reading |
| `boot_progress` | Get current boot progress details |

### `flashcard`

| Action | Description |
|--------|-------------|
| `list_cards` | List due flashcards across all decks, one deck, one notebook, or one tree, and optionally filter returned cards to `due` / `new` / `old` |
| `get_decks` | List available flashcard decks for discovering `deckID` values |
| `review_card` | Submit one flashcard review result with `deckID`, `cardID`, and `rating` |
| `skip_review_card` | Skip the current flashcard in the review flow |
| `add_card` | Add existing blocks into a flashcard deck |
| `remove_card` | Remove existing blocks from a flashcard deck (requires confirmation) |

Flashcard notes: `list_cards` always reads from the kernel due-card APIs and MCP filters `cards[*].state` for `new` / `old`. Flashcard marking still belongs to `block(action="set_attrs", attrs={"custom-riff-decks":"<deck-id>"})`.

### `mascot`

| Action | Description |
|--------|-------------|
| `get_balance` | Get the mascot's current spendable balance |
| `shop` | List the mascot shop inventory with stable item IDs, labels, cost, type, and emoji |
| `buy` | Buy one mascot shop item by `item_id` and spend from the current balance |

Every successful MCP tool call earns the mascot 1 coin, so the fastest way to earn balance is simply to keep using SiYuan MCP tools. `mascot(action="get_balance")` also returns the lifetime earned count.

### `search`

| Action | Description |
|--------|-------------|
| `fulltext` | Full-text search across blocks, with optional `stripHtml=true` to add plain-text fields |
| `query_sql` | Execute read-only SQL (SELECT / WITH only) and return permission-filtered `rows` plus metadata |
| `search_tag` | Search tags by keyword |
| `get_backlinks` | Find documents/blocks that reference a block, with partial-result metadata when filtered |
| `get_backmentions` | Find documents/blocks that mention a block name, with partial-result metadata when filtered |

### `tag`

| Action | Description |
|--------|-------------|
| `list` | List workspace tags |
| `rename` | Rename a tag label |
| `remove` | Remove a tag label |


## Tool Toggles

In SiYuan, open `Settings -> Plugins -> SiYuan MCP sisyphus`.

- Each aggregated tool has a top-level enable switch
- Each action can still be enabled or disabled individually
- The default fallback config exposes move actions but not delete-style actions
- Existing old-style configs are migrated automatically into the new format

## Development

Live smoke test against a local SiYuan instance:

```bash
pnpm run build
node scripts/live_mcp_smoke.cjs
```

```text
siyuan-plugins-mcp-sisyphus/
├── src/
│   ├── api/           # SiYuan API wrappers
│   ├── mcp/           # MCP server implementation
│   │   ├── tools/     # Aggregated tool handlers
│   │   ├── config.ts  # Tool config and migration helpers
│   │   ├── server.ts  # Main server
│   │   └── types.ts   # Action-level validation
│   └── index.ts       # Plugin entry point
├── public/i18n/       # Internationalization
└── package.json
```

## License

MIT

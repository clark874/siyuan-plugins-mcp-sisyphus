---
name: siyuan-sisyphus-system-cli
description: SiYuan system operations, permissions, and CLI usage. Covers version/time queries, notebook permissions, CLI configuration, flags, and dangerous action semantics. Use when the agent needs system info or uses the siyuan-sisyphus CLI.
---

# SiYuan Sisyphus — System, Permissions, and CLI

## System Operations

All system actions are read-only except where noted.

```python
# SiYuan version
system(action="get_version")

# Current time (epoch ms + ISO 8601)
system(action="get_current_time")

# Configuration summary (masked, navigable)
system(action="conf", mode="summary")

# Read specific config field
system(action="conf", mode="get", keyPath="conf.appearance.mode")
system(action="conf", mode="get", keyPath="conf.langs[0]")

# Send UI notification
system(action="notify", msg="Hello from AI", level="info", timeout=5000)

# Network proxy info (masked)
system(action="network")
```

**`workspace_info` is disabled by default** because it exposes the absolute workspace path. If enabled, it requires explicit user confirmation.

## Permissions

Four levels per notebook:

| Level | Meaning |
|-------|---------|
| `rwd` | Read / Write / Delete |
| `rw` | Read / Write |
| `r` | Read only (default for unconfigured notebooks in CLI) |
| `none` | All blocked |

```python
# Check all notebook permissions
notebook(action="get_permissions")

# Check specific notebook
notebook(action="get_permissions", notebook="notebook-id")

# Set permission (requires explicit user confirmation)
notebook(action="set_permission", notebook="notebook-id", permission="rw")
```

## CLI Installation and Binaries

```bash
npm i -g siyuan-sisyphus
# Provides two commands: siyuan-sisyphus and siyuan
```

## CLI Configuration

Config file: `~/.siyuan-sisyphus/config.json` (permissions 0600). Legacy `~/.siyuan-mcp/config.json` may be read as fallback.

Priority (highest to lowest):
1. CLI flags (`--url`, `--token`, `--profile`)
2. Environment variables (`SIYUAN_API_URL`, `SIYUAN_TOKEN`)
3. Active profile in config file
4. Defaults (`http://127.0.0.1:6806`)

## Common CLI Patterns

```bash
# List notebooks
siyuan notebook list

# Create document
siyuan document create --notebook "notebook-id" --path "/Folder/Doc" --markdown "# Title"

# Append content
siyuan block append --parent-id "doc-id" --data-type markdown --data "## Section"

# Search
siyuan search fulltext --query "keyword"

# SQL query
siyuan search query-sql --stmt "SELECT * FROM blocks LIMIT 5"

# Use JSON for complex values
siyuan block set-attrs --id "block-id" --attrs-json '{"custom-key":"value"}'
```

## CLI Flag Rules

- Kebab / camel / snake accepted: `--parent-id`, `--parentID`, `--parent_id`
- Boolean: `--flag` / `--no-flag`
- Complex objects: `--<key>-json '<json>'`

## CLI vs MCP Differences

| Aspect | MCP | CLI |
|--------|-----|-----|
| Dangerous actions | Require user confirmation in chat | No extra confirmation (command = confirmation) |
| Config source | SiYuan plugin settings | `~/.siyuan-sisyphus/config.json` |
| Disabled actions | Hidden from tool list | Hidden from `list` / `help` |
| Output | Structured JSON | Human-readable / `--json` for compact JSON |

## Dangerous Actions Checklist

Before calling any of these in MCP mode, clearly describe the action and wait for explicit user confirmation:

| Tool | Action | Why dangerous |
|------|--------|---------------|
| `notebook` | `remove` | Deletes notebook |
| `notebook` | `set_permission` | Changes access control |
| `document` | `remove` | Deletes document |
| `document` | `move` | Moves documents |
| `block` | `delete` | Deletes blocks |
| `block` | `move` | Moves blocks |
| `search` | `find_replace` | Bulk content replacement |
| `file` | `upload_asset` | Reads local filesystem |
| `file` | `export_resources` with `outputPath` | Writes to local filesystem |
| `file` | `remove_unused_assets` | Deletes assets |
| `file` | `delete_asset` | Deletes specific asset |
| `tag` | `remove` | Deletes tag label |
| `flashcard` | `remove_card` | Removes cards from deck |
| `system` | `workspace_info` | Exposes absolute workspace path (disabled by default) |
| `fs` | `rm` | Deletes document by path |
| `fs` | `mv` | Moves/renames document by path |

Flow: State "I will do X. Proceed?" and only call the tool after the user explicitly agrees.

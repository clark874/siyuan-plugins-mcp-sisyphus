# siyuan-sisyphus

[English](./README.md) | [中文](./README_zh_CN.md)

> ⚠️ **Prerequisite: This CLI requires the `siyuan-plugins-mcp-sisyphus` plugin from this repo.** Install and enable the plugin in SiYuan first, and configure permissions in the plugin settings panel, before the CLI can work.

Direct command-line control for [SiYuan Note](https://b3log.org/siyuan). Think of it like `obsidian-cli` but for SiYuan — every MCP tool (block, document, notebook, av, search, tag, file, system, flashcard, mascot) is exposed as a subcommand you can call directly from a shell.

The published npm package is `siyuan-sisyphus`. It installs the primary command `siyuan-sisyphus`, and also provides the shorter alias `siyuan`.

```bash
siyuan-sisyphus notebook list
siyuan-sisyphus document create --notebook 20240318... --path "/Inbox/Test" --markdown "# Hello"
siyuan-sisyphus block append --parent-id 20240318abc --data-type markdown --data "- item"
siyuan-sisyphus search fulltext --query "keyword" --page-size 10 --json | jq '.data[].hPath'
```

## Requirements

- Node.js 18+
- A running SiYuan instance reachable over HTTP (local or remote)
- The SiYuan API token (`SiYuan > Settings > About > API token`)

## Install

```bash
# Global install; this installs both `siyuan-sisyphus` and `siyuan`
npm i -g siyuan-sisyphus

# Or run once without installing
npx -p siyuan-sisyphus siyuan-sisyphus --help
```

## Quick start

```bash
siyuan-sisyphus init
# …answer the two prompts (API URL + token). This writes ~/.siyuan-sisyphus/config.json (0600).

siyuan-sisyphus notebook list  # verify connectivity
siyuan-sisyphus list           # see all available tools
siyuan-sisyphus list block     # see all actions for a tool
siyuan-sisyphus help block append
```

## Command shape

```
siyuan-sisyphus <tool> <action> [--flag value ...]   Execute any MCP tool-action
siyuan-sisyphus list [tool]                          List tools or a tool's actions
siyuan-sisyphus help <tool> [action]                 Detailed help for a tool or action
siyuan-sisyphus init                                 Interactive config setup
siyuan-sisyphus --help | -h                          Top-level help
siyuan-sisyphus --version | -v                       Print version
```

### Flag conventions

- **Kebab, camel, or snake**: `--parent-id`, `--parentID`, `--parentId`, and `--item_id` all map to the schema field they spell.
- **Action names**: `set_open_state` or `set-open-state` — either form works.
- **Booleans**: `--opened` (true), `--opened=false`, or `--no-opened` (false).
- **Arrays**: repeat the flag (`--ids a --ids b`), use comma-separated (`--ids a,b`), or pass exact JSON with `--<key>-json '["a","b"]'`.
- **Complex objects**: use a JSON sidecar flag such as `--assets-json '[{...}]'`.
- **`-json` precedence**: if both plain flags and `--<key>-json` are provided, the JSON sidecar wins.

### Global flags

| Flag | Purpose |
|---|---|
| `--config <file>` | Load config from `<file>` instead of `~/.siyuan-sisyphus/config.json` |
| `--url <url>` | Override SiYuan API URL |
| `--token <token>` | Override SiYuan API token |
| `--json` | Emit compact single-line JSON (for scripting with `jq`, etc.) |
| `--debug` | Include stack traces and ignored-flag warnings |

## Examples

```bash
# Notebooks
siyuan-sisyphus notebook list
siyuan-sisyphus notebook create --name "Work" --icon 1f4d4

# Documents
siyuan-sisyphus document create --notebook 20240318... --path "/Inbox/Daily" --markdown "# Today"
siyuan-sisyphus document list-tree --notebook 20240318... --max-depth 2
siyuan-sisyphus document get-doc --id 20240318xyz --mode markdown

# Blocks
siyuan-sisyphus block info --id 20240318xyz
siyuan-sisyphus block append --parent-id 20240318abc --data-type markdown --data "- new item"
siyuan-sisyphus block get-kramdown --id 20240318xyz

# Search
siyuan-sisyphus search fulltext --query "TODO" --page-size 20
siyuan-sisyphus search query-sql --stmt "SELECT id, content FROM blocks WHERE type='h' LIMIT 5"

# Piping to jq
siyuan-sisyphus notebook list --json | jq '.[] | select(.closed==false) | .name'
siyuan-sisyphus document search-docs --notebook <id> --query "proposal" --json | jq '.data[].hPath'
```

## Configuration

Precedence: **CLI flag > environment variable > config file > default**.

### Environment variables

| Variable | Purpose |
|---|---|
| `SIYUAN_API_URL` | SiYuan base URL (default `http://127.0.0.1:6806`) |
| `SIYUAN_TOKEN` | SiYuan API token |

### Config file shape (`~/.siyuan-sisyphus/config.json`)

```json
{
  "apiUrl": "http://127.0.0.1:6806",
  "token": "<siyuan-token>"
}
```

## Relation to the SiYuan plugin

The CLI and the SiYuan plugin (`siyuan-plugins-mcp-sisyphus`) share the same tool-handler code under the hood, but the two entry points are independent:

- The **plugin** runs an MCP server inside SiYuan and talks to AI clients over stdio/HTTP (configured in the plugin's settings panel).
- The **CLI** connects to SiYuan over the HTTP API and executes one operation per invocation — no server, no long-running process.

If you already used the older config path `~/.siyuan-mcp/config.json`, the CLI still reads it as a fallback until you create a new config under `~/.siyuan-sisyphus/config.json`.

If the plugin has notebook-level permissions configured, the CLI respects them (it reads the same `/data/storage/petal/...` configuration through the API). Any action disabled in the plugin UI is still runnable from the CLI — the CLI user is assumed to have full control over what they type.

## License

MIT © Taihong Yang

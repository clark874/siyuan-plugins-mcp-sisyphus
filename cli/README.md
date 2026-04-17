# siyuan

Direct command-line control for [SiYuan Note](https://b3log.org/siyuan). Think of it like `obsidian-cli` but for SiYuan — every MCP tool (block, document, notebook, av, search, tag, file, system, flashcard, mascot) is exposed as a subcommand you can call directly from a shell.

```bash
siyuan notebook list
siyuan document create --notebook 20240318... --path "/Inbox/Test" --markdown "# Hello"
siyuan block append --parent-id 20240318abc --data-type markdown --data "- item"
siyuan search fulltext --query "keyword" --page-size 10 --json | jq '.data[].hPath'
```

## Requirements

- Node.js 18+
- A running SiYuan instance reachable over HTTP (local or remote)
- The SiYuan API token (`SiYuan > Settings > About > API token`)

## Install

```bash
# Global install; this installs the `siyuan` command
npm i -g siyuan-mcp

# Or run once without installing
npx -p siyuan-mcp siyuan --help
```

## Quick start

```bash
siyuan init
# …answer the two prompts (API URL + token). This writes ~/.siyuan-mcp/config.json (0600).

siyuan notebook list        # verify connectivity
siyuan list                  # see all available tools
siyuan list block            # see all actions for a tool
siyuan help block append     # see the flags for a specific action
```

## Command shape

```
siyuan <tool> <action> [--flag value ...]   Execute any MCP tool-action
siyuan list [tool]                           List tools or a tool's actions
siyuan help <tool> [action]                  Detailed help for a tool or action
siyuan init                                  Interactive config setup
siyuan --help | -h                           Top-level help
siyuan --version | -v                        Print version
```

### Flag conventions

- **Kebab or camel**: `--parent-id`, `--parentID`, and `--parentId` all map to the same property.
- **Action names**: `set_open_state` or `set-open-state` — either form works.
- **Booleans**: `--opened` (true), `--opened=false`, or `--no-opened` (false).
- **Arrays**: repeat the flag (`--ids a --ids b`) or use comma-separated (`--ids a,b`).
- **Complex objects** (e.g. `av set_cell --assets [...]`): use a JSON sidecar flag `--<key>-json '[{...}]'`.

### Global flags

| Flag | Purpose |
|---|---|
| `--config <file>` | Load config from `<file>` instead of `~/.siyuan-mcp/config.json` |
| `--url <url>` | Override SiYuan API URL |
| `--token <token>` | Override SiYuan API token |
| `--json` | Emit compact single-line JSON (for scripting with `jq`, etc.) |
| `--debug` | Include stack traces and ignored-flag warnings |

## Examples

```bash
# Notebooks
siyuan notebook list
siyuan notebook create --name "Work" --icon 1f4d4

# Documents
siyuan document create --notebook 20240318... --path "/Inbox/Daily" --markdown "# Today"
siyuan document list-tree --notebook 20240318... --max-depth 2
siyuan document get-doc --id 20240318xyz --mode markdown

# Blocks
siyuan block info --id 20240318xyz
siyuan block append --parent-id 20240318abc --data-type markdown --data "- new item"
siyuan block get-kramdown --id 20240318xyz

# Search
siyuan search fulltext --query "TODO" --page-size 20
siyuan search query-sql --stmt "SELECT id, content FROM blocks WHERE type='h' LIMIT 5"

# Piping to jq
siyuan notebook list --json | jq '.[] | select(.closed==false) | .name'
siyuan document search-docs --notebook <id> --query "proposal" --json | jq '.data[].hPath'
```

## Configuration

Precedence: **CLI flag > environment variable > config file > default**.

### Environment variables

| Variable | Purpose |
|---|---|
| `SIYUAN_API_URL` | SiYuan base URL (default `http://127.0.0.1:6806`) |
| `SIYUAN_TOKEN` | SiYuan API token |

### Config file shape (`~/.siyuan-mcp/config.json`)

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

If the plugin has notebook-level permissions configured, the CLI respects them (it reads the same `/data/storage/petal/...` configuration through the API). Any action disabled in the plugin UI is still runnable from the CLI — the CLI user is assumed to have full control over what they type.

## License

MIT © Taihong Yang

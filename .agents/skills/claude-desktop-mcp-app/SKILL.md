---
name: claude-desktop-mcp-app
description: Configure, repair, and verify MCP servers and MCP Apps in Claude Desktop on macOS. Use when adding an HTTP or Streamable HTTP MCP endpoint to Claude Desktop through mcp-remote, locating the active claude_desktop_config.json, preserving existing MCP configuration, diagnosing a server that is not running, or checking whether an MCP App renders interactively in Claude Code or Cowork.
---

# Configure Claude Desktop MCP Apps

Configure the active Claude Desktop installation safely, then verify the transport, tools, and interactive MCP App separately. Treat a connected server and a rendered MCP App as two different success criteria.

## Gather connection details

Obtain:

- MCP endpoint URL, such as `http://127.0.0.1:36806/mcp`
- Server name to place under `mcpServers`
- Authentication requirements, if any
- At least one read-only tool call for verification
- An MCP App resource or tool that returns `text/html;profile=mcp-app`

Confirm the MCP service is already running before editing Claude. Do not expose tokens in terminal output, screenshots, logs, or the final response.

## Locate the active Claude configuration

Prefer Claude Desktop's **Settings → Developer → Edit Config** action because it targets the configuration used by that installation.

When inspecting from the terminal, search before assuming the directory name:

```bash
find "$HOME/Library/Application Support" -maxdepth 2 \
  -name claude_desktop_config.json -print
```

Common locations include:

- `~/Library/Application Support/Claude/claude_desktop_config.json`
- `~/Library/Application Support/Claude-3p/claude_desktop_config.json`

The Sisyphus setup observed `Claude-3p`; do not blindly write to the more familiar `Claude` directory. If multiple files exist, correlate the path with **Edit Config**, the running app, or its Developer settings.

## Merge the MCP server entry

Read and parse the existing JSON first. Preserve unrelated top-level keys and existing `mcpServers`. Create a recoverable backup before changing a live user configuration. Request permission before writing outside the current workspace.

For a local Streamable HTTP Sisyphus server, merge this entry:

```json
{
  "mcpServers": {
    "siyuan-sisyphus": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@latest",
        "http://127.0.0.1:36806/mcp"
      ]
    }
  }
}
```

Use the snippet as a merge fragment, not as a replacement for the whole file. Validate the final file as JSON after editing.

Use `mcp-remote@latest` while testing a newly implemented protocol if necessary. Pin a verified version later when reproducibility matters. If Claude reports that `npx` cannot be launched, resolve `npx` in an interactive shell and use its absolute path because GUI applications may inherit a narrower `PATH`.

## Restart and verify the connection

Fully quit Claude Desktop and reopen it; closing a window may leave the process running. Open **Settings → Developer** and check that the configured server reports `running`.

If it does not run, inspect Claude's MCP logs and check, in order:

1. The selected configuration file is the active one.
2. The JSON is valid and the server key is under `mcpServers`.
3. `npx` is executable from Claude's environment.
4. `mcp-remote` can reach the endpoint.
5. The SiYuan plugin and its MCP HTTP service are running on the configured port.
6. Required authentication headers or tokens are present without being logged.

Do not treat `running` as proof that an MCP App can render.

## Verify tools and the MCP App separately

First invoke a harmless, read-only MCP tool. This establishes that discovery and tool calls work independently of the UI extension.

Then ask Claude to open a known MCP App, such as the Sisyphus flashcard app. Check both host modes when relevant:

- Claude Code may successfully call the MCP tool but present only text or a plain table.
- Claude Cowork can render the MCP App as an interactive iframe when the returned resource and MIME type are supported.

For Sisyphus, useful application resources include:

- Flashcard: `ui://siyuan-sisyphus/flashcard`
- Timeline: `ui://siyuan-sisyphus/timeline`
- Mascot shop: `ui://siyuan-sisyphus/shop`

A successful end-to-end result requires all of the following:

1. Developer settings show the MCP server as `running`.
2. A read-only Sisyphus tool call returns valid data.
3. Cowork displays the chosen app as interactive UI rather than only serialized text.
4. No test action mutates notes, reviews cards, or buys an item unless the user explicitly requested it.

## Report the result

State the active configuration path, server status, tool-call result, host mode used for the App test, and whether interactive rendering succeeded. Redact credentials and avoid reproducing unrelated contents from the user's Claude configuration.

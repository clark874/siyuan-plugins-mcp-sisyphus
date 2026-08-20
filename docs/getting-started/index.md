# Getting Started

This section explains how to install the plugin, choose a transport mode, and debug common connection problems.

When to read this page: you are setting up the plugin, connecting an MCP client, or deciding between HTTP and stdio.

Related pages:

- [Deployment](./deployment.md)
- [HTTPS](./https.md)
- [Troubleshooting](./troubleshooting.md)
- [Common Tasks](../reference/common-tasks.md)

## Reading Order

1. [Deployment](./deployment.md)
2. [HTTPS](./https.md) if you need TLS
3. [Troubleshooting](./troubleshooting.md) if the client cannot connect

## Single External Gateway

Register only `http://127.0.0.1:36806/mcp` in an external Agent. SiYuan's built-in `http://127.0.0.1:6806/mcp` is the official extension bus used on demand by Sisyphus `extension`; do not register both endpoints side by side. Hand another local Agent the pinned `agent-kit/START-HERE.md`, then require a successful `system(action="bootstrap")` call before treating installation as complete.

## What This Section Covers

- Installation from marketplace or source
- HTTP, stdio, and `mcp-remote` bridge choices
- Environment variables and default ports
- Docker, WSL, and LAN scenarios
- Quick checks when tools are not visible or calls fail

## Scenario Skills And MCP Prompts

After connecting, MCP clients can discover scenario guidance through standard resources:

- `siyuan://skills/index` routes a task to the narrowest relevant skill.
- `siyuan://skills/{name}` returns the selected workflow and safety guide.

These resources are served by MCP and require no client-side installation. The server also exposes matching prompts with an optional `task` argument. Prompts are explicit, user-invoked workflow starters; clients should not assume that they run automatically.

If an agent supports installable `SKILL.md` packages, the npm CLI can install an equivalent local bundle:

```bash
# Existing default: CLI command conventions
siyuan-sisyphus skill install

# MCP tool-call conventions
siyuan-sisyphus skill install --bundle mcp

# Install both bundles
siyuan-sisyphus skill install --bundle all
```

`skill list` and `skill read` accept the same `--bundle cli|mcp|all` selector. Skills define task flow, path semantics, and safety rules; they do not replace action schemas. For exact current parameters, read `siyuan://help/action/{tool}/{action}` or call the tool's `help` action.

To install only the twelve MCP workflow skills through the public `skills` installer, use the curated subdirectory instead of the repository root:

```bash
npx -y skills add https://github.com/clark874/siyuan-plugins-mcp-sisyphus/tree/main/skills/siyuan-mcp --skill '*' -g -a codex -y
```

This command installs workflow instructions only. It does not install the SiYuan plugin, register `http://127.0.0.1:36806/mcp`, or configure bearer authentication. A reachable and authenticated Sisyphus MCP server remains required; validate the connection with `system(action="bootstrap")`.

## MCP 2026-07-28 And Legacy Clients

- `stdio` accepts both protocol eras automatically.
- HTTP routes 2026-07-28 requests to a stateless per-request handler and keeps stateful `mcp-session-id` sessions for legacy clients.
- Modern dangerous actions request confirmation through MCP multi-round-trip elicitation before dispatch. A modern client must advertise elicitation support to execute them.
- Browser requests with an `Origin` header are checked against localhost plus `SIYUAN_MCP_ALLOWED_ORIGINS` (comma-separated hostnames).
- The internal official-SiYuan MCP client uses automatic version negotiation.

SEP-2640 is a draft extension and is enabled by default for both HTTP and stdio transports, publishing all bundled workflow skills. For the built-in HTTP server, it can be toggled under Connection Config → HTTP/HTTPS Connection → Skills over MCP. Standalone servers can set `SIYUAN_MCP_SKILLS_EXTENSION=false` to disable it. This advertises `io.modelcontextprotocol/skills` and enables `skills/list`, `skills/get`, and all bundled `skill://` resources. The regular `siyuan://skills/*` resources continue to work whether the extension is enabled or not.

The repository's validated Codex wrapper lives at `agent-plugin/siyuan-sisyphus`. Its MCP config points only to `http://127.0.0.1:36806/mcp`; add client-side bearer authentication if your server requires `SIYUAN_MCP_TOKEN`. Generic local installation starts at `agent-kit/START-HERE.md`.

## Next Steps

After setup, try the [Common Tasks](../reference/common-tasks.md) page for quick MCP/CLI examples.

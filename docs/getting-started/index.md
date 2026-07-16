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

## Next Steps

After setup, try the [Common Tasks](../reference/common-tasks.md) page for quick MCP/CLI examples.

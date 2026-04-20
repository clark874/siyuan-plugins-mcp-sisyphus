# Modules

This page groups the core modules by responsibility.

When to read this page: you need to know which file area owns transport, tools, config, or API behavior.

## Core Areas

- `src/index.ts`
  - Plugin lifecycle
  - Settings UI mounting
  - Embedded HTTP launcher wiring

- `src/mcp/server.ts`
  - MCP server creation
  - tool/resource handlers
  - server instructions

- `src/mcp/tool-registry.ts`
  - Maps each aggregated tool category to list and call handlers

- `src/mcp/tool-lifecycle.ts`
  - Wraps tool execution with analytics, telemetry, and mascot events

- `src/mcp/permissions.ts`
  - Notebook-level permission reads and checks
  - Persists data via the SiYuan API-backed plugin storage path

- `src/api/*`
  - Thin SiYuan HTTP API wrappers

- `src/cli/*`
  - Standalone CLI parsing, dispatch, rendering, and config resolution

# Setup

This page covers local prerequisites and the current repo layout.

When to read this page: you are onboarding to the codebase.

## Prerequisites

- Node.js 20.x or higher
- `pnpm`
- Local SiYuan installation for testing

## Install

```bash
git clone https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus.git
cd siyuan-plugins-mcp-sisyphus
pnpm install
```

## Project Layout

- `src/index.ts`: plugin entry
- `src/core/server.ts`: MCP server entry
- `src/tools/`: tool implementations
- `src/cli/`: CLI entry and dispatch
- `src/api/`: SiYuan API wrappers
- `tests/`: unit, integration, smoke tests

# SiYuan Sisyphus MCP & CLI Docs

SiYuan Sisyphus MCP & CLI exposes SiYuan capabilities in two forms:

- A SiYuan plugin with an embedded MCP server
- A standalone CLI: `siyuan-sisyphus`

## Choose Your Path

### I want to use it with an AI client

Start here:

- [Getting Started](./getting-started/index.md)
- Then verify with a read-only call from [Common Tasks](./reference/common-tasks.md)

Use this path if you are connecting Claude Desktop, Codex, Cherry Studio, Cursor, Cline, or another MCP client.

### I want to use the CLI directly

Start here:

- [Getting Started](./getting-started/index.md)
- [Common Tasks](./reference/common-tasks.md)

Use this path if you want one-shot terminal commands such as `siyuan notebook list`.

### I want to contribute to the project

Start here:

- [Architecture](./architecture/index.md)
- [Development](./development/index.md)

Use this path if you need to change tool handlers, API wrappers, build targets, or docs.

## Recommended Reading Order

1. [Getting Started](./getting-started/index.md)
2. [Reference](./reference/index.md)
3. [Architecture](./architecture/index.md)
4. [Development](./development/index.md)

## What This Project Contains

- 16 aggregated tools with action-level routing
- Notebook-level permission control: `none`, `r`, `rw`, `rwd`
- HTTP and stdio transport modes
- A shared implementation used by both MCP and CLI entrypoints

## Related Pages

- [Project README](/README.md)
- [中文文档](/zh/)
- [Architecture Notes](/insights.md)

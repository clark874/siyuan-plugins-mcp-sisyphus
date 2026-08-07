---
name: siyuan-mcp-sisyphus
description: Top-level skill for operating SiYuan Note through Sisyphus MCP. Use to select a workflow bundle, choose among the aggregated tools, and apply shared path, pagination, permission, and confirmation rules.
---

# Operate SiYuan with Sisyphus MCP

Select the narrowest workflow bundle:

- Read, browse, search, SQL, backlinks, or references: `siyuan-mcp-read-discover`.
- Create, edit, replace, or format rich SiYuan content: `siyuan-mcp-write-format`.
- Attribute views, assets, extraction, upload, or export: `siyuan-mcp-data-files`.
- Tags, flashcards, timelines, permissions, system actions, or safety: `siyuan-mcp-organize-safety`.

Prefer `fs` for human-readable workspace paths. Use `document` and `block` for IDs, storage paths, metadata, and block-granular work. Use `av` for real databases.

Read `/AGENTS.md` through `fs` before workspace-aware tasks when it exists. Read before writing, paginate until complete, and verify mutations by stable ID or path. Obtain explicit approval before deletes, moves, bulk replacement, permission changes, local upload/export, rollback, or sensitive disclosure. For unfamiliar parameters, read `siyuan://help/action/{tool}/{action}` or call the tool with `action="help"`.

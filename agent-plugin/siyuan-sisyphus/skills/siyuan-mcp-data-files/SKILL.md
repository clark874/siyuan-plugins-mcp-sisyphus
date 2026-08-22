---
name: siyuan-mcp-data-files
description: Database and file workflow for SiYuan MCP. Use for attribute views, columns, rows, cells, assets, uploads, OCR, templates, Markdown export, document extraction, and resource export.
compatibility: "Requires a reachable SiYuan Sisyphus MCP server; installing this Skill alone does not register the endpoint or configure authentication."
---

# Work with SiYuan Databases and Files

For attribute views, inspect the AV and view before changing rows or cells. Keep AV, view, row, column, and block IDs distinct; preserve each column's declared value type and re-render after mutation.

File uploads and local exports are the explicit remote-safety exception because they may access the machine running the server. Confirm exact local paths and scope first. Stop for large-upload confirmation when requested, use a task-specific output directory, and list exact targets before asset deletion or cleanup.

For registered project sources, prefer `file.read_project_source` when the target is a manifest-listed safe UTF-8 text file. Treat `listed`, `readable`, `contentRead`, and `revisionVerified` as separate claims. The action hides absolute paths, redacts returned text, and returns no content for binary, sensitive, oversized, unlisted, or stale-bound files. Use path resolution only when a client with existing local-workspace authority genuinely needs the absolute path.

For detailed action sequences, read `skill://siyuan-mcp-database/SKILL.md` and `skill://siyuan-mcp-file-export/SKILL.md`. If the experimental Skills extension is disabled, use the stable resources `siyuan://skills/siyuan-mcp-database` and `siyuan://skills/siyuan-mcp-file-export` instead.

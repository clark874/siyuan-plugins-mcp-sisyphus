---
name: siyuan-mcp-data-files
description: Database and project-source workflow for SiYuan MCP. Use for attribute views, columns, rows, cells, registered project manifests, and controlled UTF-8 source reading.
compatibility: "Requires a reachable SiYuan Sisyphus MCP server; installing this Skill alone does not register the endpoint or configure authentication."
---

# Work with SiYuan Databases and Project Sources

For attribute views, inspect the AV and view before changing rows or cells. Keep AV, view, row, column, and block IDs distinct; preserve each column's declared value type and re-render after mutation.

Project-source actions may access the machine running the server. Register an exact project root, scan a bounded manifest, then read only listed safe UTF-8 text. Confirm before registration or absolute-path disclosure; do not treat a listed file as content already verified.

For registered project sources, prefer `file.read_project_source` when the target is a manifest-listed safe UTF-8 text file. Treat `listed`, `readable`, `contentRead`, and `revisionVerified` as separate claims. The action hides absolute paths, redacts returned text, and returns no content for binary, sensitive, oversized, unlisted, or stale-bound files. Use path resolution only when a client with existing local-workspace authority genuinely needs the absolute path.

For detailed action sequences, read `skill://siyuan-mcp-database/SKILL.md` and `skill://siyuan-mcp-project-source/SKILL.md`. If the experimental Skills extension is disabled, use the stable resources `siyuan://skills/siyuan-mcp-database` and `siyuan://skills/siyuan-mcp-project-source` instead.

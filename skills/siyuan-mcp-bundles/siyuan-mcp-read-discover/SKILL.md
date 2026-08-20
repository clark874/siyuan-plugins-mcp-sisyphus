---
name: siyuan-mcp-read-discover
description: Read and discovery workflow for SiYuan MCP. Use for notebook trees, paths, blocks, fulltext search, read-only SQL, backlinks, references, assets, and scoped find-replace preparation.
compatibility: "Requires a reachable SiYuan Sisyphus MCP server; installing this Skill alone does not register the endpoint or configure authentication."
---

# Read and Discover SiYuan

Start with `fs(action="ls"|"tree"|"read"|"search")` and human-readable workspace paths. When the path is unknown, use `search(action="fulltext")`; use `query_sql` only for read-only `SELECT` statements with an explicit `LIMIT`. Use document or block reads when stable IDs, storage paths, metadata, backlinks, or exact block structure are required.

Treat workspace paths, notebook-local hpaths, and `.sy` storage paths as distinct. Never derive a storage path from a title; resolve it first. Continue document windows and list/search pages until the needed evidence is complete.

Before `find_replace`, search and read every target, show exact old/new text and IDs, and obtain approval. Verify recent writes by ID or path because search indexing can lag.

For the full scenario guides, read `skill://siyuan-mcp-browse-read/SKILL.md` and `skill://siyuan-mcp-search-query/SKILL.md`. If the experimental Skills extension is disabled, use the stable resources `siyuan://skills/siyuan-mcp-browse-read` and `siyuan://skills/siyuan-mcp-search-query` instead.

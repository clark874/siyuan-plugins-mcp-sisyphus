---
name: siyuan-mcp-write-format
description: Writing and formatting workflow for SiYuan MCP. Use for document creation, block append/insert/update/replace, metadata, daily notes, Markdown tables, math, diagrams, super blocks, embeds, and verified edits.
compatibility: "Requires a reachable SiYuan Sisyphus MCP server; installing this Skill alone does not register the endpoint or configure authentication."
---

# Write and Format SiYuan Content

Read the target first, choose the highest-level action that preserves intent, perform one bounded change, then read it again. Use `fs(action="write")` for convenient path-based documents; use document and block actions for IDs, attributes, daily notes, or block-granular edits. Use `block(action="replace")` for a small exact replacement and `update` only when replacing the whole block.

Write rich content as SiYuan Markdown. Use an attribute view for real database behavior rather than a Markdown table. Do not invent unsupported markup. Resolve the exact target and obtain approval before rename, move, delete, or broad replacement.

For detailed examples, read `skill://siyuan-mcp-create-edit/SKILL.md` and `skill://siyuan-mcp-markup-guide/SKILL.md`. If the experimental Skills extension is disabled, use the stable resources `siyuan://skills/siyuan-mcp-create-edit` and `siyuan://skills/siyuan-mcp-markup-guide` instead.

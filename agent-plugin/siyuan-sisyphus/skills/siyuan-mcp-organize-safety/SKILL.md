---
name: siyuan-mcp-organize-safety
description: Organization and safety workflow for SiYuan MCP. Use for tags, flashcard decks and reviews, timeline snapshots and rollback, notebook permissions, system information, troubleshooting, and dangerous-operation confirmation.
compatibility: "Requires a reachable SiYuan Sisyphus MCP server; installing this Skill alone does not register the endpoint or configure authentication."
---

# Organize SiYuan Safely

Create tags by writing `#tag#` in Markdown. Create cards through flashcard actions so riff registration and block metadata stay consistent. For timelines, resolve and read the document, list nodes, keep the returned tag, and compare before rollback.

Treat a diagnostic or read request as non-authorization to mutate. State the exact target and consequence, then obtain approval before deletion, move, removal, rollback, permission change, workspace-path disclosure, or sync side effects. Respect `rwd`, `rw`, `r`, and `none` notebook permissions and never bypass a disabled action.

For detailed workflows, read `skill://siyuan-mcp-tag-flashcard/SKILL.md`, `skill://siyuan-mcp-timeline/SKILL.md`, and `skill://siyuan-mcp-system-safety/SKILL.md`. If the experimental Skills extension is disabled, use the matching stable `siyuan://skills/{name}` resources instead.

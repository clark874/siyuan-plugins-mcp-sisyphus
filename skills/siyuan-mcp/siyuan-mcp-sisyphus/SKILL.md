---
name: siyuan-mcp-sisyphus
description: Top-level skill for operating SiYuan Note through the Sisyphus MCP server. Use to choose an aggregated tool, discover action resources, route complex tasks to a scenario skill, and apply permissions and safety rules.
---

# SiYuan Sisyphus with MCP

Use the narrowest scenario skill that matches the task. For unfamiliar fields, inspect `siyuan://help/tool-overview` and the relevant `siyuan://help/action/{tool}/{action}` resource before calling an action; live action help is the parameter-level source of truth.

## Scenario routing

| Scenario | Skill |
| --- | --- |
| Browse notebooks, documents, paths, IDs, and blocks | `siyuan-mcp-browse-read` |
| Create documents or edit blocks | `siyuan-mcp-create-edit` |
| Fulltext, SQL, backlinks, references, and replacement | `siyuan-mcp-search-query` |
| Attribute views, columns, rows, and cells | `siyuan-mcp-database` |
| Assets, extraction, and exports | `siyuan-mcp-file-export` |
| Tags, decks, cards, and review | `siyuan-mcp-tag-flashcard` |
| Permissions, system information, and dangerous operations | `siyuan-mcp-system-safety` |
| Rich Markdown, math, diagrams, and SiYuan markup | `siyuan-mcp-markup-guide` |

## Tool choice

Prefer `fs` for ordinary human-readable workspace paths. Use `document` or `block` for IDs, storage paths, metadata, or block-granular changes. Use `av` for real databases rather than Markdown tables. Low-complexity `feedback` and `mascot` actions need no separate scenario skill.

```text
system(action="get_version")
```
```text
notebook(action="list")
```
```text
fs(action="tree", path="/Notebook", maxDepth=3)
```
```text
fs(action="read", path="/Notebook/Folder/Doc", blockStart=0, blockLimit=50, tokenBudget=2000)
```

## Shared invariants

- Read `/AGENTS.md` through `fs` before workspace-aware tasks when it exists.
- A workspace path such as `/Notebook/Folder/Doc`, an hpath such as `/Folder/Doc`, and a storage path such as `/20260712123000-abc123.sy` are different values.
- Read before writing; after a mutation, read the affected object again.
- For document reads, continue with `nextWindow` or explicit `blockStart`/`blockLimit`/`tokenBudget`; for list and search results, use their page parameters.
- Missing results may be caused by notebook permissions or indexing delay.
- Obtain explicit approval before deletes, moves, bulk replacement, permission changes, local upload/export, or sensitive workspace disclosure.

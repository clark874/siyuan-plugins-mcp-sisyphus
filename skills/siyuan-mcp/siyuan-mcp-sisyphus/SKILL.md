---
name: siyuan-mcp-sisyphus
description: Top-level skill for operating SiYuan Note through the Sisyphus MCP server. Use to choose an aggregated tool, discover action resources, route complex tasks to a scenario skill, and apply permissions and safety rules.
compatibility: "Requires a reachable SiYuan Sisyphus MCP server already registered in the client; installing this Skill alone does not configure the MCP endpoint or bearer token."
---

# SiYuan Sisyphus with MCP

Use Sisyphus as the only MCP gateway registered in the external client: `http://127.0.0.1:36806/mcp`. SiYuan's built-in `http://127.0.0.1:6806/mcp` is an internal extension bus that Sisyphus may bridge through `extension`; do not register it as a second SiYuan MCP in the same client.

Start every newly connected session with one read-only bootstrap call:

```text
system(action="bootstrap")
```

Use the returned notebooks, capability flags, path guide, and `nextCalls` as the live source of truth. `operation.readOnly=true` describes only the bootstrap action; the connection may still expose mutations according to notebook permissions and enabled actions. If `toolConfiguration.current=false`, treat capability data as fallback metadata rather than a health check.

Use the narrowest scenario skill that matches the task. For unfamiliar fields, inspect `siyuan://help/tool-overview` and the relevant `siyuan://help/action/{tool}/{action}` resource before calling an action; live action help is the parameter-level source of truth.

## Scenario routing

| Scenario | Skill |
| --- | --- |
| Browse notebooks, documents, paths, IDs, and blocks | `siyuan-mcp-browse-read` |
| Create documents or edit blocks | `siyuan-mcp-create-edit` |
| Fulltext, SQL, backlinks, references, and replacement | `siyuan-mcp-search-query` |
| Capture web sources, deduplicate them, and merge knowledge with provenance | `siyuan-mcp-knowledge-ingest` |
| Compile a complete local research-project package into traceable atoms and internal semantic relations | `siyuan-mcp-project-knowledge-compile` |
| Explicitly invoke Start, Handoff, Knowledge, or Close for a registered project's shared multi-Agent progress memory | `siyuan-mcp-project-coordinator` |
| Compile and govern named knowledge atoms, aliases, hubs, and safe renames | `siyuan-mcp-knowledge-governance` |
| Close verified project-to-public-method reuse relations across projects | `siyuan-mcp-cross-project-relation-closure` |
| Attribute views, columns, rows, and cells | `siyuan-mcp-database` |
| Assets, extraction, and exports | `siyuan-mcp-file-export` |
| Tags, decks, cards, and review | `siyuan-mcp-tag-flashcard` |
| Timeline nodes, snapshot comparison, and rollback | `siyuan-mcp-timeline` |
| Permissions, system information, and dangerous operations | `siyuan-mcp-system-safety` |
| Rich Markdown, math, diagrams, and SiYuan markup | `siyuan-mcp-markup-guide` |

## Tool choice

Prefer `fs` for ordinary human-readable workspace paths. Use `document` or `block` for IDs, storage paths, metadata, or block-granular changes. Use `av` for real databases rather than Markdown tables. Use `timeline` for named snapshots, document diffs, and rollback. Use `provenance` after project knowledgeization to register source and compile Agent sessions and to answer project-session history queries. Low-complexity `feedback` and `mascot` actions need no separate scenario skill.

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
- When strict safe writes are enabled, inspect the action schema. Guarded mutations expose an expected-hash field: call `validateOnly=true`, then execute once with the returned `preconditionField` credential and a fresh UUIDv7 `requestId`. Additive request-id-only actions expose no expected-hash field: skip preflight and execute once with only a fresh `requestId`; their optional `validateOnly` response issues no credential and is not a failure.
- For document reads, continue with `nextWindow` or explicit `blockStart`/`blockLimit`/`tokenBudget`; for list and search results, use their page parameters.
- Missing results may be caused by notebook permissions or indexing delay.
- Obtain explicit approval before deletes, moves, bulk replacement, permission changes, local upload/export, or sensitive workspace disclosure.

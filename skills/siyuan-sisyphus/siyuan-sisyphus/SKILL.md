---
name: siyuan-sisyphus
description: CLI-only top-level skill for operating SiYuan Note through siyuan-sisyphus. Use to choose a scenario workflow, discover live command help, handle paths and IDs, paginate results, and apply safety rules.
compatibility: "Requires the maintained siyuan-sisyphus CLI to be installed and configured for the target SiYuan workspace."
---

# SiYuan Sisyphus with the CLI

## Resolve the CLI entry first

Before the first SiYuan CLI call in every new session, verify that the local command is available:

```bash
command -v siyuan-sisyphus
siyuan-sisyphus --version
```

If the command is missing, resolve a locally installed or user-provided maintained CLI entry before continuing. Do not use `npx` as an implicit fallback. A public npm package may lag the locally maintained plugin and silently omit custom actions or safety contracts.

After resolving the entry, start with the read-only live bootstrap:

```bash
siyuan-sisyphus system bootstrap --json
```

Use Sisyphus as the only MCP gateway registered in the external client: `http://127.0.0.1:36806/mcp`. SiYuan's built-in `http://127.0.0.1:6806/mcp` is an internal extension bus that Sisyphus may bridge through `extension`; do not register it as a second SiYuan MCP in the same client.

Start every newly connected session with one read-only bootstrap call:

```bash
siyuan-sisyphus system bootstrap --json
```

Use the returned notebooks, capability flags, path guide, and `nextCalls` as the live source of truth. `operation.readOnly=true` describes only the bootstrap action; the connection may still expose mutations according to notebook permissions and enabled actions. If `toolConfiguration.current=false`, treat capability data as fallback metadata rather than a health check.

Use the narrowest scenario skill that matches the task. For unfamiliar fields, inspect `siyuan-sisyphus list` and `siyuan-sisyphus help <tool> <action>` before calling an action; live action help is the parameter-level source of truth.

## Scenario routing

| Scenario | Skill |
| --- | --- |
| Browse notebooks, documents, paths, IDs, and blocks | `siyuan-sisyphus-browse-read` |
| Create documents or edit blocks | `siyuan-sisyphus-create-edit` |
| Fulltext, SQL, backlinks, references, and replacement | `siyuan-sisyphus-search-query` |
| Capture web sources, deduplicate them, and merge knowledge with provenance | `siyuan-sisyphus-knowledge-ingest` |
| Compile a complete local research-project package into traceable atoms and internal semantic relations | `siyuan-sisyphus-project-knowledge-compile` |
| Explicitly invoke Start or Close for a registered project's shared multi-Agent progress memory | `siyuan-sisyphus-project-coordinator` |
| Compile and govern named knowledge atoms, aliases, hubs, and safe renames | `siyuan-sisyphus-knowledge-governance` |
| Close verified project-to-public-method reuse relations across projects | `siyuan-sisyphus-cross-project-relation-closure` |
| Attribute views, columns, rows, and cells | `siyuan-sisyphus-database` |
| Assets, extraction, and exports | `siyuan-sisyphus-file-export` |
| Tags, decks, cards, and review | `siyuan-sisyphus-tag-flashcard` |
| Timeline nodes, snapshot comparison, and rollback | `siyuan-sisyphus-timeline` |
| Permissions, system information, and dangerous operations | `siyuan-sisyphus-system-cli` |
| Rich Markdown, math, diagrams, and SiYuan markup | `siyuan-markup-guide` |

## Tool choice

Prefer `fs` for ordinary human-readable workspace paths. Use `document` or `block` for IDs, storage paths, metadata, or block-granular changes. Use `av` for real databases rather than Markdown tables. Use `timeline` for named snapshots, document diffs, and rollback. Use `provenance` after project knowledgeization to register source and compile Agent sessions and to answer project-session history queries. Low-complexity `feedback` and `mascot` actions need no separate scenario skill.

```bash
siyuan-sisyphus fs tree --path '/Notebook' --max-depth '3' --json
```
```bash
siyuan-sisyphus fs read --path '/Notebook/Folder/Doc' --block-start '0' --block-limit '50' --token-budget '2000' --json
```

## Shared invariants

- Read `/AGENTS.md` through `fs` before workspace-aware tasks when it exists.
- A workspace path such as `/Notebook/Folder/Doc`, an hpath such as `/Folder/Doc`, and a storage path such as `/20260712123000-abc123.sy` are different values.
- Read before writing; after a mutation, read the affected object again.
- When strict safe writes are enabled, inspect the action schema. Guarded mutations expose an expected-hash field: call `validateOnly=true`, then execute once with the returned `preconditionField` credential and a fresh UUIDv7 `requestId`. Additive request-id-only actions expose no expected-hash field: skip preflight and execute once with only a fresh `requestId`; their optional `validateOnly` response issues no credential and is not a failure.
- For document reads, continue with `nextWindow` or explicit `blockStart`/`blockLimit`/`tokenBudget`; for list and search results, use their page parameters.
- Missing results may be caused by notebook permissions or indexing delay.
- Obtain explicit approval before deletes, moves, bulk replacement, permission changes, local upload/export, or sensitive workspace disclosure.

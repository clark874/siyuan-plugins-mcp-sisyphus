---
name: siyuan-sisyphus
description: CLI-only top-level skill for operating SiYuan Note through siyuan-sisyphus. Use to choose a scenario workflow, discover live command help, handle paths and IDs, paginate results, and apply safety rules.
---

# SiYuan Sisyphus with the CLI

Use the narrowest scenario skill that matches the task. For unfamiliar fields, inspect `siyuan-sisyphus list` and `siyuan-sisyphus help <tool> <action>` before calling an action; live action help is the parameter-level source of truth.

## Scenario routing

| Scenario | Skill |
| --- | --- |
| Browse notebooks, documents, paths, IDs, and blocks | `siyuan-sisyphus-browse-read` |
| Create documents or edit blocks | `siyuan-sisyphus-create-edit` |
| Fulltext, SQL, backlinks, references, and replacement | `siyuan-sisyphus-search-query` |
| Attribute views, columns, rows, and cells | `siyuan-sisyphus-database` |
| Assets, extraction, and exports | `siyuan-sisyphus-file-export` |
| Tags, decks, cards, and review | `siyuan-sisyphus-tag-flashcard` |
| Permissions, system information, and dangerous operations | `siyuan-sisyphus-system-cli` |
| Rich Markdown, math, diagrams, and SiYuan markup | `siyuan-markup-guide` |

## Tool choice

Prefer `fs` for ordinary human-readable workspace paths. Use `document` or `block` for IDs, storage paths, metadata, or block-granular changes. Use `av` for real databases rather than Markdown tables. Low-complexity `feedback` and `mascot` actions need no separate scenario skill.

```bash
siyuan-sisyphus system get-version --json
```
```bash
siyuan-sisyphus notebook list --json
```
```bash
siyuan-sisyphus fs tree --path '/Notebook' --max-depth '3' --json
```
```bash
siyuan-sisyphus fs read --path '/Notebook/Folder/Doc' --page '1' --page-size '8000' --json
```

## Shared invariants

- Read `/AGENTS.md` through `fs` before workspace-aware tasks when it exists.
- A workspace path such as `/Notebook/Folder/Doc`, an hpath such as `/Folder/Doc`, and a storage path such as `/20260712123000-abc123.sy` are different values.
- Read before writing; after a mutation, read the affected object again.
- Use explicit pagination for repeatable automation.
- Missing results may be caused by notebook permissions or indexing delay.
- Obtain explicit approval before deletes, moves, bulk replacement, permission changes, local upload/export, or sensitive workspace disclosure.

---
name: siyuan-sisyphus-create-edit
description: CLI-only playbook for bounded, ordinary SiYuan document and block edits with siyuan-sisyphus. Use for path-based creation, append/insert/update, metadata, daily notes, and verified edits. Use knowledge-governance for name/alias or cross-reference governance, and database for AV cells.
compatibility: "Requires the maintained siyuan-sisyphus CLI to be installed and configured for the target SiYuan workspace."
---

# Create and Edit SiYuan Content with the CLI

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

Read the target first, choose the highest-level action that preserves intent, perform one bounded change, then read it again.

## Create documents

Use a workspace path for convenient path-based creation:

```bash
siyuan-sisyphus fs write --path '/Notebook/Project/Notes' --markdown '# Notes

Initial content.' --json
```

Use a notebook ID plus notebook-local hpath when low-level control is needed:

```bash
siyuan-sisyphus document create --notebook '<notebook-id>' --path '/Project/Notes' --markdown '# Notes' --json
```

Do not include the notebook name in the low-level hpath.

## Edit blocks

```bash
siyuan-sisyphus block append --parent-id '<doc-id>' --data-type 'markdown' --data '## New section

Paragraph.' --json
```
```bash
siyuan-sisyphus block insert --previous-id '<block-id>' --data-type 'markdown' --data 'Inserted paragraph.' --json
```
```bash
siyuan-sisyphus block update --id '<block-id>' --data-type 'markdown' --data 'Replacement block content.' --json
```

Use block `update` only when replacing the whole block is intended. Prefer a scoped replacement for a small textual change:

```bash
siyuan-sisyphus block replace --id '<block-id>' --edit-json '{"old":"draft","new":"final"}' --json
```

## Metadata and daily notes

```bash
siyuan-sisyphus block set-attrs --id '<block-id>' --attrs-json '{"custom-source":"agent"}' --json
```
```bash
siyuan-sisyphus document create-daily-note --notebook '<notebook-id>' --json
```

Before rename, move, delete, or broad replacement, resolve the exact target, show the affected scope, and obtain approval. After every mutation, read by stable ID when possible. Use `siyuan-sisyphus help block append` when any parameter is uncertain.

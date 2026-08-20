---
name: siyuan-mcp-create-edit
description: MCP playbook for bounded, ordinary SiYuan document and block edits. Use for path-based creation, append/insert/update, metadata, daily notes, and verified edits. Use knowledge-governance for name/alias or cross-reference governance, and database for AV cells.
compatibility: "Requires a reachable SiYuan Sisyphus MCP server already registered in the client; installing this Skill alone does not configure the MCP endpoint or bearer token."
---

# Create and Edit SiYuan Content with MCP

Read the target first, choose the highest-level action that preserves intent, perform one bounded change, then read it again.

## Create documents

Use a workspace path for convenient path-based creation:

```text
fs(action="write", path="/Notebook/Project/Notes", markdown="# Notes\n\nInitial content.")
```

Use a notebook ID plus notebook-local hpath when low-level control is needed:

```text
document(action="create", notebook="<notebook-id>", path="/Project/Notes", markdown="# Notes")
```

Do not include the notebook name in the low-level hpath.

## Edit blocks

```text
block(action="append", parentID="<doc-id>", dataType="markdown", data="## New section\n\nParagraph.")
```
```text
block(action="insert", previousID="<block-id>", dataType="markdown", data="Inserted paragraph.")
```
```text
block(action="update", id="<block-id>", dataType="markdown", data="Replacement block content.")
```

Use block `update` only when replacing the whole block is intended. Prefer a scoped replacement for a small textual change:

```text
block(action="replace", id="<block-id>", edit={"old":"draft","new":"final"})
```

## Metadata and daily notes

```text
block(action="set_attrs", id="<block-id>", attrs={"custom-source":"agent"})
```
```text
document(action="create_daily_note", notebook="<notebook-id>")
```

Before rename, move, delete, or broad replacement, resolve the exact target, show the affected scope, and obtain approval. After every mutation, read by stable ID when possible. Use `siyuan://help/action/block/append` when any parameter is uncertain.

---
name: siyuan-sisyphus-create-edit
description: CLI-only playbook for creating and editing SiYuan documents and blocks with `siyuan-sisyphus`. Use for document creation, path writes, appending, prepending, inserting, updating, exact replacements, metadata, daily notes, and move/rename safety.
---

# SiYuan Sisyphus CLI - Create and Edit

Prefer `fs` for path-based document writes and replacements. Use `document` when you need document IDs or metadata. Use `block` for precise block-level changes.

## Create Documents

Simple path-based creation:

```bash
siyuan-sisyphus fs write --path "/NotebookName/Folder/New Doc" --markdown "# Title

Content."
```

Overwrite an existing document body while keeping the document node and title:

```bash
siyuan-sisyphus fs write --path "/NotebookName/Folder/New Doc" --markdown "# New Body" --overwrite
```

Create through the document tool when you need the returned ID:

```bash
siyuan-sisyphus document create --notebook "<notebook-id>" --path "/Folder/New Doc" --markdown "# Title" --json
```

For child documents, `document create --path` is a notebook-local hpath. It starts at the notebook root, does not include the notebook name, and must not be a `.sy` storage path. This differs from `fs write`, whose path is a workspace path that includes the notebook name.

```bash
# Workspace path, preferred for ordinary document writes.
siyuan-sisyphus fs write --path "/NotebookName/Folder/Parent/New Child" --markdown "# New Child"

# Notebook-local hpath, preferred when you need the returned document ID.
siyuan-sisyphus document create --notebook "<notebook-id>" --path "/Folder/Parent/New Child" --markdown "# New Child" --json
```

`parent-path + title` is supported when the parent is known separately:

```bash
# Human-readable parent hpath inside the notebook.
siyuan-sisyphus document create --notebook "<notebook-id>" --parent-path "/Folder/Parent" --title "New Child" --markdown "# New Child" --json

# Storage parent path returned by document lookup.
siyuan-sisyphus document create --notebook "<notebook-id>" --parent-path "/20240318112233-abc123.sy" --title "New Child" --json
```

If create reports a duplicate-name error, verify the intended child before retrying:

```bash
siyuan-sisyphus document lookup --notebook "<notebook-id>" --hpath "/Folder/Parent/New Child" --include-json '["id","path","hpath"]' --json
siyuan-sisyphus document get-child-docs --id "<parent-doc-id>" --json
```

Do not pass `/NotebookName/Folder/...` to `document create --path`; use `/Folder/...` there. Do not pass `/20240318112233-abc123.sy` to `document create --path`; only `--parent-path` accepts a storage parent path.

## Append or Prepend Content

Append to the end of a document:

```bash
siyuan-sisyphus block append --parent-id "<doc-id>" --data-type markdown --data "## New Section

Paragraph."
```

Prepend to the start:

```bash
siyuan-sisyphus block prepend --parent-id "<doc-id>" --data-type markdown --data "# Front Matter"
```

`--parent-id` can be a document ID or block ID. With a document ID, append/prepend targets the document end/start. With a block ID, it targets that block's child list.

## Insert at a Position

Insert before a block:

```bash
siyuan-sisyphus block insert --next-id "<block-id>" --data-type markdown --data "Inserted before this block"
```

Insert after a block:

```bash
siyuan-sisyphus block insert --previous-id "<block-id>" --data-type markdown --data "Inserted after this block"
```

Batch inserts use JSON:

```bash
siyuan-sisyphus block insert --blocks-json '[{"previousID":"<block-id>","dataType":"markdown","data":"First"},{"previousID":"<block-id>","dataType":"markdown","data":"Second"}]'
```

## Update or Replace

Use `block update` for one short block:

```bash
siyuan-sisyphus block update --id "<block-id>" --data-type markdown --data "Updated paragraph"
```

For multi-line content, prefer `append`, `prepend`, or `insert`. SiYuan may truncate multi-line markdown when updating a single block.

Exact replacement inside one block:

```bash
siyuan-sisyphus block replace --id "<block-id>" --edit-json '{"old":"old text","new":"new text"}'
siyuan-sisyphus block replace --id "<block-id>" --edit-json '{"old":"foo","new":"bar","replace_all":true}'
```

Exact replacement inside a document by path:

```bash
siyuan-sisyphus fs replace --path "/Notebook/Doc" --edit-json '{"old":"old text","new":"new text"}'
```

## Metadata and Attributes

Document icon and cover:

```bash
siyuan-sisyphus document set-attr --id "<doc-id>" --attrs-json '{"icon":"1f4d4","cover":"https://example.com/image.png"}'
siyuan-sisyphus document set-attr --id "<doc-id>" --attrs-json '{"cover":null}'
```

Block attributes:

```bash
siyuan-sisyphus block set-attrs --id "<block-id>" --attrs-json '{"custom-source":"agent"}'
siyuan-sisyphus block get-attrs --id "<block-id>" --json
```

## Daily Notes

When the user asks for a diary, journal entry, daily log, or today's note:

```bash
siyuan-sisyphus document create-daily-note --notebook "<notebook-id>" --json
siyuan-sisyphus block add-to-daily-note --notebook "<notebook-id>" --position append --data-type markdown --data "Daily entry"
```

## Rename, Move, Delete

Rename by ID is straightforward:

```bash
siyuan-sisyphus document rename --id "<doc-id>" --title "New Title"
```

Path-based low-level rename may require a storage path. Resolve first:

```bash
siyuan-sisyphus document lookup --id "<doc-id>" --include-json '["path"]' --json
siyuan-sisyphus document rename --notebook "<notebook-id>" --path "/20240318112233-abc123.sy" --title "New Title"
```

Moving or deleting user content is high risk. Get explicit approval first:

```bash
siyuan-sisyphus fs mv --from "/Notebook/Old" --to "/Notebook/New"
siyuan-sisyphus document move --from-ids "<doc-id>" --to-id "<target-doc-id>"
siyuan-sisyphus block delete --id "<block-id>"
```

## Editing Checklist

1. Read the target first with `fs read`, `document get-doc`, or `block get-kramdown`.
2. Prefer exact replacements over broad operations.
3. Use JSON flags for structured fields.
4. Verify the result with a read command.
5. Avoid destructive commands unless the user approved the exact target.

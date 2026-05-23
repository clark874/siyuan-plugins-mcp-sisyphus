---
name: siyuan-sisyphus-browse-read
description: CLI-only playbook for browsing and reading SiYuan notes with `siyuan-sisyphus`. Use when an agent needs notebooks, document trees, human-readable paths, IDs, block content, storage paths, search-assisted discovery, or read-only inspection.
---

# SiYuan Sisyphus CLI - Browse and Read

Prefer `fs` for normal browsing because it uses human-readable paths. Use `document` or `block` only when you need IDs, storage paths, metadata, or block-level reads.

## Start With Notebooks

```bash
siyuan-sisyphus notebook list
siyuan-sisyphus notebook list --json
siyuan-sisyphus notebook get-permissions
```

Use notebook names in `fs` paths:

```bash
siyuan-sisyphus fs ls --path "/"
siyuan-sisyphus fs ls --path "/NotebookName"
```

## Browse Trees

```bash
siyuan-sisyphus fs tree --path "/NotebookName" --max-depth 3
siyuan-sisyphus fs tree --path "/NotebookName/Folder" --max-depth 5 --json
```

If you need low-level tree metadata:

```bash
siyuan-sisyphus document list-tree --notebook "<notebook-id>" --path "/" --max-depth 3 --json
siyuan-sisyphus document get-child-docs --id "<doc-id>" --json
```

## Read Documents

```bash
siyuan-sisyphus fs read --path "/NotebookName/Folder/Doc"
siyuan-sisyphus fs read --path "/NotebookName/Folder/Doc" --page 2 --page-size 8000 --json
```

Read by ID when the path is unknown:

```bash
siyuan-sisyphus document get-doc --id "<doc-id>" --mode markdown
siyuan-sisyphus document get-child-blocks --id "<doc-id>" --json
```

Read a single block:

```bash
siyuan-sisyphus block get-kramdown --id "<block-id>"
siyuan-sisyphus block info --id "<block-id>" --json
siyuan-sisyphus block get-children --id "<block-id>" --page 1 --page-size 50 --json
```

## Locate Content

Use `fs search` when a human-readable subtree is enough:

```bash
siyuan-sisyphus fs search --path "/NotebookName" --query "keyword" --page 1 --page-size 20 --json
```

Use fulltext search for global or structured filtering:

```bash
siyuan-sisyphus search fulltext --query "keyword" --page-size 20 --json
siyuan-sisyphus search fulltext --query "keyword" --parent-id "<doc-id>" --json
siyuan-sisyphus search fulltext --query "keyword" --type-shortcodes h,p --json
```

## Resolve Paths and IDs

There are three path forms that look similar but are not interchangeable:

| Path type | Used by | Example |
| --- | --- | --- |
| Workspace human-readable path | `fs` commands | `/NotebookName/Folder/Doc` |
| Notebook-local human-readable hpath | `document create --path`, `document lookup --hpath`, `document create --parent-path` | `/Folder/Doc` |
| Storage path | Some low-level document operations, and `document create --parent-path` when returned by lookup | `/20240318112233-abc123.sy` |

Safe lookup patterns:

```bash
siyuan-sisyphus document lookup --notebook "<notebook-id>" --hpath "/Folder/Doc" --include-json '["id","path","hpath"]' --json
siyuan-sisyphus document lookup --id "<doc-id>" --include-json '["path","hpath"]' --json
```

Do not pass a workspace path such as `/NotebookName/Folder/Doc` to `document create --path`; use the notebook-local hpath `/Folder/Doc`. Do not pass a storage path such as `/20240318112233-abc123.sy` to `document create --path`; only `--parent-path` accepts a storage parent path. For rename, remove, move, or storage-path lookup, resolve first, then use the returned storage path.

## Reading Strategy

1. List notebooks or start from a known `/Notebook/...` path.
2. Use `fs tree` or `fs search` to narrow the target.
3. Use `fs read` for content.
4. Use `document lookup` when an ID or storage path is needed.
5. Use `block get-kramdown` or `document get-child-blocks` only for block-level edits or precise references.

## Pitfalls

- New or edited content may take a moment to appear in search. Read by path or ID when freshness matters.
- Always use `--json` before piping output into another command.
- Add explicit `--page` and `--page-size` in scripts.
- Permission filtering can hide notebooks or results; check `notebook get-permissions` before assuming content is missing.

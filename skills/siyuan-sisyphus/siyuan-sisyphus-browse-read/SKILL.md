---
name: siyuan-sisyphus-browse-read
description: Browse and read SiYuan notes. Covers listing notebooks, document trees, reading content, and the critical path semantics (human-readable vs storage paths). Use when the agent needs to explore or read SiYuan note content.
---

# SiYuan Sisyphus — Browse and Read

**Core strategy**: For ordinary browse/read workflows, prefer `fs` because it uses human-readable paths and hides storage paths / block IDs. Only drop down to `document` or `block` tools when you need block-level IDs or low-level metadata.

## List Notebooks

```python
# List all readable notebooks
notebook(action="list")

# Check notebook permissions
notebook(action="get_permissions", notebook="all")
```

## List Document Tree

```python
# List direct children of a path
fs(action="ls", path="/NotebookName")
fs(action="ls", path="/NotebookName/Folder")

# Recursive tree (default maxDepth=3)
fs(action="tree", path="/NotebookName")
fs(action="tree", path="/NotebookName/Folder", maxDepth=5)
```

For low-level tree operations (needing storage paths), use:
```python
document(action="list_tree", notebook="notebook-id", path="/")
```

## Read Document Content

```python
# Read full markdown by human-readable path (recommended)
fs(action="read", path="/NotebookName/Folder/Doc")

# For long documents, paginate
fs(action="read", path="/NotebookName/Folder/Doc", page=2, pageSize=8000)

# Low-level: get child blocks by document ID
document(action="get_child_blocks", id="doc-id")

# Low-level: get markdown by document ID
document(action="get_doc", id="doc-id", mode="markdown")
```

## Search to Locate Content

```python
# Fulltext search
search(action="fulltext", query="keyword")

# Scoped to a document subtree
search(action="fulltext", query="keyword", parentId="doc-id")

# Filter by block type (shortcodes auto-expand)
search(action="fulltext", query="keyword", types={"h": true, "p": true})
```

## Resolve a Document Path

```python
# Get storage path and human-readable path from an ID
info = document(action="lookup", id="doc-id", include=["path", "hpath"])
# info.path == "/20240318112233-abc123.sy" (storage path)
# info.hpath == "/Notebook/Folder/Doc" (human-readable path)
```

## Pitfalls: Path Semantics (the #1 Error Source)

There are exactly two path types. Do not mix them.

| Type | Used by | Example |
|------|---------|---------|
| **Human-readable** | `fs.*`, `document.create`, `document.lookup` (with hpath) | `/Inbox/Weekly Note` |
| **Storage path** | `document.rename`, `document.remove`, `document.move`, `document.lookup` (with path) | `/20240318112233-abc123.sy` |

**Safe workflow**: When you need a storage path, call `document(action="lookup", id="...", include=["path"])` first, then reuse the returned storage path.

```python
# WRONG: rename expects storage path, not human-readable path
document(action="rename", notebook="...", path="/Inbox/Weekly Note", title="New Title")

# CORRECT:
info = document(action="lookup", id="doc-id", include=["path"])
# info.path == "/20240318112233-abc123.sy"
document(action="rename", notebook="...", path=info.path, title="New Title")
```

## Other Path Gotchas

- `document(action="lookup", hpath=...)` may briefly lag after creation because it depends on SiYuan indexing. Retry if needed.
- `document(action="lookup", id=...)` may hit the same short indexing delay right after create; MCP retries briefly and returns a timing-specific hint if indexing hasn't settled.

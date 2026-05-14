---
name: siyuan-sisyphus-create-edit
description: Create and edit SiYuan documents and blocks. Covers document creation, block append/insert/update/replace, daily notes, and metadata. Use when the agent needs to write or modify SiYuan content.
---

# SiYuan Sisyphus — Create and Edit

## Create a New Document

```python
# Method 1: fs (recommended for simple creation)
fs(action="write", path="/NotebookName/Folder/New Doc", markdown="# Title\n\nContent.")

# Method 2: document API (when you need the doc ID immediately)
document(action="create", notebook="notebook-id", path="/Folder/New Doc", markdown="# Title\n\nContent.")
```

`fs(action="write")` creates missing documents automatically. If the document already exists, pass `overwrite=true` to replace its body while preserving the document node and title.

## Append Content to a Document

```python
# Append to end of document
block(action="append", parentID="doc-id", dataType="markdown", data="## New Section\n\nParagraph.")

# Append multiple blocks at once
block(action="append", parentID="doc-id", dataType="markdown", data="""
## Section 1
Content 1.

## Section 2
Content 2.
""")
```

## Insert Content at a Specific Position

```python
# Insert BEFORE a block
block(action="insert", dataType="markdown", data="New content", nextID="block-id")

# Insert AFTER a block
block(action="insert", dataType="markdown", data="New content", previousID="block-id")

# Prepend to start of document
block(action="prepend", parentID="doc-id", dataType="markdown", data="# Front matter")
```

## Update Existing Content

```python
# Replace a single block (best for short content)
block(action="update", id="block-id", dataType="markdown", data="Updated content")

# Replace exact text inside one block
block(action="replace", id="block-id", edit={"old": "old text", "new": "new text"})

# Sequential replacements
block(action="replace", id="block-id", edit=[
    {"old": "A", "new": "Alpha"},
    {"old": "B", "new": "Beta"}
])

# Replace all occurrences
block(action="replace", id="block-id", edit={"old": "foo", "new": "bar", "replace_all": True})
```

## Edit Document by Path

```python
# Replace text in a document without needing block IDs
fs(action="replace", path="/Notebook/Doc", edit={"old": "old text", "new": "new text"})
```

## Set Document Metadata

```python
# Set icon and cover
document(action="set_attr", id="doc-id", attrs={"icon": "1f4d4", "cover": "https://example.com/image.png"})

# Clear cover
document(action="set_attr", id="doc-id", attrs={"cover": None})
```

## Create Daily Note

```python
# When user asks for diary, journal, daily log, or today's note
document(action="create_daily_note", notebook="notebook-id")
```

## Move or Rename Documents

```python
# Rename by ID
document(action="rename", id="doc-id", title="New Title")

# Rename by storage path (requires explicit user confirmation)
document(action="rename", notebook="notebook-id", path="/20240318112233-abc123.sy", title="New Title")

# Move documents (requires explicit user confirmation)
document(action="move", fromIDs=["doc-id-1"], toID="target-doc-id")
```

## Pitfalls

1. **`block(action="update")` truncates multi-line markdown**: SiYuan may truncate multi-line content to the first line. Use `append`, `prepend`, or `insert` when you need multiple blocks, tables, or longer multi-line content.

2. **`prepend` / `append` behavior depends on `parentID` type**:
   - `parentID` = document ID → inserts at document start/end
   - `parentID` = block ID → inserts at that block's child list start/end

3. **Document removal requires confirmation**: `document(action="remove")` is disabled by default and always requires explicit user confirmation when enabled.

4. **Recently created documents may lag in lookup**: `document(action="lookup", hpath=...)` depends on SiYuan indexing. Retry briefly if needed.

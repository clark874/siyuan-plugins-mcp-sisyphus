# API Reference

Complete API reference for SiYuan MCP Sisyphus. This document describes all available MCP tools and actions.

## Table of Contents

- [Overview](#overview)
- [Permission Model](#permission-model)
- [High-Risk Actions](#high-risk-actions)
- [Path Semantics](#path-semantics)
- [Error Codes](#error-codes)
- [Tools](#tools)
  - [notebook](#notebook)
  - [document](#document)
  - [block](#block)
  - [av](#av)
  - [file](#file)
  - [search](#search)
  - [tag](#tag)
  - [system](#system)
  - [flashcard](#flashcard)
  - [mascot](#mascot)

## Overview

SiYuan MCP Sisyphus provides **10 aggregated tools** with **115 actions**, covering most SiYuan Note functionality:

| Tool | Actions | Description |
|------|---------|-------------|
| `notebook` | 11 | Notebook management |
| `document` | 20 | Document operations |
| `block` | 24 | Block editing and attributes |
| `av` | 13 | Attribute view (database) operations |
| `file` | 12 | File uploads, exports, templates |
| `search` | 11 | Search and query operations |
| `tag` | 3 | Tag management |
| `system` | 10 | System and notification operations |
| `flashcard` | 8 | Flashcard review and decks |
| `mascot` | 3 | Balance, shop, and purchases |

Each tool uses a required `action` field to specify the operation to perform.

## Permission Model

The plugin implements a four-state permission model for notebook-level access control:

| Level | Read | Write | Delete | Description |
|-------|------|-------|--------|-------------|
| `rwd` | Yes | Yes | Yes | Full access (default for new notebooks) |
| `rw` | Yes | Yes | No | Read and write without delete |
| `r` | Yes | No | No | Read-only access |
| `none` | No | No | No | No access |

Permissions are managed via `notebook(action="set_permission")` and take effect immediately for subsequent calls.

## High-Risk Actions

The following actions require explicit user confirmation before execution:

| Tool | Action | Reason |
|------|--------|--------|
| `notebook` | `remove` | Deletes entire notebook |
| `notebook` | `set_permission` | Changes access permissions |
| `document` | `remove` | Deletes documents |
| `document` | `move` | Moves documents between locations |
| `document` | `remove_batch` | Batch deletes documents |
| `block` | `delete` | Deletes blocks |
| `block` | `move` | Moves blocks |
| `file` | `upload_asset` | Uploads local files (also requires confirmation for files >10MB) |
| `file` | `remove_unused_assets` | Removes all unused assets |
| `file` | `delete_asset` | Deletes a specific asset |
| `search` | `find_replace` | Finds and replaces text across workspace |
| `system` | `workspace_info` | Exposes absolute workspace path |
| `tag` | `remove` | Removes tags |
| `flashcard` | `remove_card` | Removes cards from decks |

## Path Semantics

There are exactly two path types. Do not mix them.

### Human-Readable Path

Used by: `document(action="create")`, `document(action="get_ids")`

- Format: `/Inbox/Weekly Note`
- Must start with `/`
- Parent paths must already exist

### Storage Path

Used by: `document(action="rename")`, `document(action="remove")`, `document(action="move")`, `document(action="get_hpath")`, `document(action="list_tree")`

- Format: `/20240318112233-abc123.sy`
- Represents actual file storage location
- Use `document(action="get_path", id="...")` to obtain storage paths

**Safe workflow**: Call `document(action="get_path", id=...)` first, then reuse the returned storage path.

## Error Codes

Common error types returned by the MCP server:

| Error Type | Description |
|------------|-------------|
| `validation_error` | Invalid parameters or missing required fields |
| `permission_denied` | Insufficient permissions for the operation |
| `api_error` | SiYuan API returned an error |
| `internal_error` | Internal MCP server error |
| `action_disabled` | Action is disabled in configuration |

## Tools

### notebook

Grouped notebook operations.

#### list

**Description**: List all notebooks in the workspace.

**Permission Required**: None

**Parameters**: None

**Returns**: Array of notebooks with `id`, `name`, `icon`, `closed` status.

**Example**:
```json
{
  "action": "list"
}
```

#### create

**Description**: Create a new notebook.

**Permission Required**: None

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Notebook name |
| `icon` | string | No | Optional icon (prefer Unicode hex like "1f4d4") |

**Returns**: Created notebook object.

**Example**:
```json
{
  "action": "create",
  "name": "My Notebook",
  "icon": "1f4d4"
}
```

#### set_open_state

**Description**: Set notebook open/closed state.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `notebook` | string | Yes | Notebook ID |
| `opened` | boolean | Yes | `true` to open, `false` to close |

**Example** (open a notebook):
```json
{
  "action": "set_open_state",
  "notebook": "20240318112233-abc123",
  "opened": true
}
```

**Example** (close a notebook):
```json
{
  "action": "set_open_state",
  "notebook": "20240318112233-abc123",
  "opened": false
}
```

#### remove

**Description**: Remove a notebook permanently.

**Permission Required**: Delete (rwd)

**Confirmation Required**: Yes

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `notebook` | string | Yes | Notebook ID |

**Example**:
```json
{
  "action": "remove",
  "notebook": "20240318112233-abc123"
}
```

#### rename

**Description**: Rename a notebook.

**Permission Required**: Write (rw/rwd)

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `notebook` | string | Yes | Notebook ID |
| `name` | string | Yes | New notebook name |

**Example**:
```json
{
  "action": "rename",
  "notebook": "20240318112233-abc123",
  "name": "New Name"
}
```

#### get_conf

**Description**: Get notebook configuration.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `notebook` | string | Yes | Notebook ID |

**Returns**: Configuration object with `name`, `closed`, `refCreateSavePath`, `createDocNameTemplate`, `dailyNoteSavePath`, `dailyNoteTemplatePath`.

**Example**:
```json
{
  "action": "get_conf",
  "notebook": "20240318112233-abc123"
}
```

#### set_conf

**Description**: Set notebook configuration.

**Permission Required**: Write (rw/rwd)

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `notebook` | string | Yes | Notebook ID |
| `conf` | object | Yes | Configuration object |

**Example**:
```json
{
  "action": "set_conf",
  "notebook": "20240318112233-abc123",
  "conf": {
    "name": "New Name",
    "closed": false,
    "dailyNoteSavePath": "/daily"
  }
}
```

#### set_icon

**Description**: Set notebook icon.

**Permission Required**: Write (rw/rwd)

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `notebook` | string | Yes | Notebook ID |
| `icon` | string | Yes | Icon value (prefer Unicode hex) |

**Example**:
```json
{
  "action": "set_icon",
  "notebook": "20240318112233-abc123",
  "icon": "1f4d4"
}
```

#### get_permissions

**Description**: Get permission levels for notebooks.

**Permission Required**: None

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `notebook` | string | No | Notebook ID, "all", or omit for all |

**Example**:
```json
{
  "action": "get_permissions",
  "notebook": "all"
}
```

#### set_permission

**Description**: Set permission level for a notebook.

**Permission Required**: None (but affects future operations)

**Confirmation Required**: Yes

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `notebook` | string | Yes | Notebook ID |
| `permission` | string | Yes | One of: `none`, `r`, `rw`, `rwd` |

**Example**:
```json
{
  "action": "set_permission",
  "notebook": "20240318112233-abc123",
  "permission": "rw"
}
```

#### get_child_docs

**Description**: Get direct child documents at notebook root.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `notebook` | string | Yes | Notebook ID |

**Example**:
```json
{
  "action": "get_child_docs",
  "notebook": "20240318112233-abc123"
}
```

---

### document

Grouped document operations.

#### create

**Description**: Create a new document with markdown content.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `notebook` | string | Yes | Notebook ID |
| `path` | string | Yes | Human-readable path (e.g., `/Inbox/Note`) |
| `markdown` | string | Yes | Markdown content |
| `icon` | string | No | Optional document icon |

**Example**:
```json
{
  "action": "create",
  "notebook": "20240318112233-abc123",
  "path": "/Inbox/Weekly Note",
  "markdown": "# Weekly Report\n\nContent here...",
  "icon": "1f4d4"
}
```

#### rename

**Description**: Rename a document.

**Permission Required**: Write

**Parameters** (ID mode):

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Document ID |
| `title` | string | Yes | New document title |

**Parameters** (Path mode):

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `notebook` | string | Yes | Notebook ID |
| `path` | string | Yes | Storage path |
| `title` | string | Yes | New document title |

**Example**:
```json
{
  "action": "rename",
  "id": "20240318112233-abc123",
  "title": "New Title"
}
```

#### remove

**Description**: Remove a document.

**Permission Required**: Delete (rwd)

**Confirmation Required**: Yes

**Parameters** (ID mode):

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Document ID |

**Parameters** (Path mode):

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `notebook` | string | Yes | Notebook ID |
| `path` | string | Yes | Storage path |

**Example**:
```json
{
  "action": "remove",
  "id": "20240318112233-abc123"
}
```

#### move

**Description**: Move documents to a new location.

**Permission Required**: Write

**Confirmation Required**: Yes

**Parameters** (ID mode):

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fromIDs` | string[] | Yes | Source document IDs |
| `toID` | string | Yes | Target document ID or notebook ID |

**Parameters** (Path mode):

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fromPaths` | string[] | Yes | Source storage paths |
| `toNotebook` | string | Yes | Target notebook ID |
| `toPath` | string | Yes | Target storage path (must exist) |

**Example**:
```json
{
  "action": "move",
  "fromIDs": ["20240318112233-abc123"],
  "toID": "20240318112233-def456"
}
```

#### get_path

**Description**: Get storage path by document ID.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Document ID |

**Returns**: Storage path string.

**Example**:
```json
{
  "action": "get_path",
  "id": "20240318112233-abc123"
}
```

#### get_hpath

**Description**: Get human-readable path.

**Permission Required**: Read

**Parameters** (ID mode):

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Document ID |

**Parameters** (Path mode):

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `notebook` | string | Yes | Notebook ID |
| `path` | string | Yes | Storage path |

**Example**:
```json
{
  "action": "get_hpath",
  "id": "20240318112233-abc123"
}
```

#### get_ids

**Description**: Get document IDs by human-readable path.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Human-readable path |
| `notebook` | string | Yes | Notebook ID |

**Returns**: Array of document IDs.

**Example**:
```json
{
  "action": "get_ids",
  "path": "/Inbox/Weekly Note",
  "notebook": "20240318112233-abc123"
}
```

#### get_child_blocks

**Description**: Get direct child blocks of a document.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Document ID |

**Example**:
```json
{
  "action": "get_child_blocks",
  "id": "20240318112233-abc123"
}
```

#### get_child_docs

**Description**: Get direct child documents of a document.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Document ID |

**Example**:
```json
{
  "action": "get_child_docs",
  "id": "20240318112233-abc123"
}
```

#### set_icon

**Description**: Set document icon.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Document ID |
| `icon` | string | Yes | Icon value |

**Example**:
```json
{
  "action": "set_icon",
  "id": "20240318112233-abc123",
  "icon": "1f4d4"
}
```

#### set_cover

**Description**: Set or clear document cover image. Omit `source` to clear the cover.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Document ID |
| `source` | string | No | URL or `/assets/...` path; omit to clear cover |

**Example** (set cover):
```json
{
  "action": "set_cover",
  "id": "20240318112233-abc123",
  "source": "https://example.com/image.png"
}
```

**Example** (clear cover):
```json
{
  "action": "set_cover",
  "id": "20240318112233-abc123"
}
```

#### list_tree

**Description**: List nested document tree under a notebook path.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `notebook` | string | Yes | Notebook ID |
| `path` | string | Yes | Storage path or `/` for root |
| `maxDepth` | number | No | Max depth (default 3) |

**Example**:
```json
{
  "action": "list_tree",
  "notebook": "20240318112233-abc123",
  "path": "/",
  "maxDepth": 3
}
```

#### search_docs

**Description**: Search documents by title keyword.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `notebook` | string | Yes | Notebook ID for permission scoping |
| `query` | string | Yes | Search keyword |
| `path` | string | No | Optional storage path to narrow scope |

**Example**:
```json
{
  "action": "search_docs",
  "notebook": "20240318112233-abc123",
  "query": "Weekly"
}
```

#### get_doc

**Description**: Get document content and metadata.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Document ID |
| `mode` | string | No | `markdown` (default) or `html` |
| `size` | number | No | Max content size hint |
| `page` | number | No | Page number (1-based) |
| `pageSize` | number | No | Characters per page (default 8000) |

**Example**:
```json
{
  "action": "get_doc",
  "id": "20240318112233-abc123",
  "mode": "markdown",
  "page": 1,
  "pageSize": 8000
}
```

#### create_daily_note

**Description**: Create or return today's daily note.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `notebook` | string | Yes | Notebook ID |
| `app` | string | No | Optional app identifier |

**Example**:
```json
{
  "action": "create_daily_note",
  "notebook": "20240318112233-abc123"
}
```

#### duplicate

**Description**: Duplicate an existing document.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `notebook` | string | Yes | Notebook ID |
| `path` | string | Yes | Storage path of the document to duplicate |

**Example**:
```json
{
  "action": "duplicate",
  "notebook": "20240318112233-abc123",
  "path": "/20240318112233-abc123.sy"
}
```

#### remove_batch

**Description**: Remove multiple documents by storage paths.

**Permission Required**: Delete (rwd)

**Confirmation Required**: Yes

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `notebook` | string | Yes | Notebook ID |
| `paths` | string[] | Yes | Storage paths to remove |

**Example**:
```json
{
  "action": "remove_batch",
  "notebook": "20240318112233-abc123",
  "paths": ["/20240318112233-abc123.sy", "/20240318112233-def456.sy"]
}
```

#### create_empty

**Description**: Create an empty document. Can also pass `markdown` as initial content.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `notebook` | string | Yes | Notebook ID |
| `path` | string | Yes | Human-readable path |
| `markdown` | string | No | Optional initial markdown content |

**Example**:
```json
{
  "action": "create_empty",
  "notebook": "20240318112233-abc123",
  "path": "/Inbox/New Note"
}
```

#### heading_to_doc

**Description**: Convert a heading block into a standalone document.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Heading block ID |
| `notebook` | string | Yes | Target notebook ID |
| `path` | string | No | Target human-readable path |

**Example**:
```json
{
  "action": "heading_to_doc",
  "id": "20240318112233-abc123",
  "notebook": "20240318112233-def456"
}
```

#### doc_to_heading

**Description**: Convert a document into a heading under a target document.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `srcID` | string | Yes | Source document ID |
| `targetID` | string | Yes | Target document ID |

**Example**:
```json
{
  "action": "doc_to_heading",
  "srcID": "20240318112233-abc123",
  "targetID": "20240318112233-def456"
}
```

---

### block

Grouped block operations.

#### insert

**Description**: Insert a new block at specified position.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dataType` | string | Yes | `markdown` or `dom` |
| `data` | string | Yes | Block content |
| `nextID` | string | No | Insert before this block |
| `previousID` | string | No | Insert after this block |
| `parentID` | string | No | Parent block/document ID |

**Example**:
```json
{
  "action": "insert",
  "dataType": "markdown",
  "data": "* New item",
  "parentID": "20240318112233-abc123"
}
```

#### prepend

**Description**: Insert a block at the beginning of a parent.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dataType` | string | Yes | `markdown` or `dom` |
| `data` | string | Yes | Block content |
| `parentID` | string | Yes | Parent block or document ID |

**Example**:
```json
{
  "action": "prepend",
  "dataType": "markdown",
  "data": "# Title",
  "parentID": "20240318112233-abc123"
}
```

#### append

**Description**: Insert a block at the end of a parent.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dataType` | string | Yes | `markdown` or `dom` |
| `data` | string | Yes | Block content |
| `parentID` | string | Yes | Parent block or document ID |

**Example**:
```json
{
  "action": "append",
  "dataType": "markdown",
  "data": "- [ ] Todo item",
  "parentID": "20240318112233-abc123"
}
```

#### update

**Description**: Update block content.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dataType` | string | Yes | `markdown` or `dom` |
| `data` | string | Yes | New block content |
| `id` | string | Yes | Block ID |

**Example**:
```json
{
  "action": "update",
  "dataType": "markdown",
  "data": "Updated content",
  "id": "20240318112233-abc123"
}
```

#### delete

**Description**: Delete a block.

**Permission Required**: Delete (rwd)

**Confirmation Required**: Yes

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Block ID |

**Example**:
```json
{
  "action": "delete",
  "id": "20240318112233-abc123"
}
```

#### move

**Description**: Move a block to a new position.

**Permission Required**: Write

**Confirmation Required**: Yes

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Block ID |
| `previousID` | string | No | Position after this block |
| `parentID` | string | No | New parent block ID |

**Note**: At least one of `previousID` or `parentID` must be provided.

**Example**:
```json
{
  "action": "move",
  "id": "20240318112233-abc123",
  "parentID": "20240318112233-def456"
}
```

#### set_fold_state

**Description**: Set the fold state of a foldable block.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Foldable block ID |
| `folded` | boolean | Yes | `true` to fold, `false` to unfold |

**Example** (fold a block):
```json
{
  "action": "set_fold_state",
  "id": "20240318112233-abc123",
  "folded": true
}
```

**Example** (unfold a block):
```json
{
  "action": "set_fold_state",
  "id": "20240318112233-abc123",
  "folded": false
}
```

#### get_kramdown

**Description**: Get block content in kramdown format.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Block ID or document ID |

**Example**:
```json
{
  "action": "get_kramdown",
  "id": "20240318112233-abc123"
}
```

#### get_children

**Description**: Get child blocks with pagination.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Block ID or document ID |
| `page` | number | No | Page number (1-based, default 1) |
| `pageSize` | number | No | Items per page (default 50) |

**Example**:
```json
{
  "action": "get_children",
  "id": "20240318112233-abc123",
  "page": 1,
  "pageSize": 50
}
```

#### transfer_ref

**Description**: Transfer block references from one block to another.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fromID` | string | Yes | Source block ID |
| `toID` | string | Yes | Target block ID |
| `refIDs` | string[] | No | Specific reference block IDs |

**Example**:
```json
{
  "action": "transfer_ref",
  "fromID": "20240318112233-abc123",
  "toID": "20240318112233-def456"
}
```

#### set_attrs

**Description**: Set block attributes.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Block ID |
| `attrs` | object | Yes | Attribute key-value pairs |

**Example**:
```json
{
  "action": "set_attrs",
  "id": "20240318112233-abc123",
  "attrs": {
    "custom-key": "value"
  }
}
```

#### get_attrs

**Description**: Get block attributes.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Block ID |

**Example**:
```json
{
  "action": "get_attrs",
  "id": "20240318112233-abc123"
}
```

#### exists

**Description**: Check if a block exists.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Block ID |

**Example**:
```json
{
  "action": "exists",
  "id": "20240318112233-abc123"
}
```

#### info

**Description**: Get block position and root document metadata.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Block ID |

**Example**:
```json
{
  "action": "info",
  "id": "20240318112233-abc123"
}
```

#### breadcrumb

**Description**: Get breadcrumb path for a block.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Block ID |
| `excludeTypes` | string[] | No | Block types to exclude |

**Example**:
```json
{
  "action": "breadcrumb",
  "id": "20240318112233-abc123",
  "excludeTypes": ["paragraph"]
}
```

#### dom

**Description**: Get rendered DOM for a block.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Block ID |

**Example**:
```json
{
  "action": "dom",
  "id": "20240318112233-abc123"
}
```

#### recent_updated

**Description**: Get recently updated blocks.

**Permission Required**: Read (filtered by notebook permission)

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `count` | number | No | Maximum number of blocks to return |

**Example**:
```json
{
  "action": "recent_updated",
  "count": 20
}
```

#### word_count

**Description**: Get word count statistics for blocks.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ids` | string[] | Yes | Block IDs |

**Example**:
```json
{
  "action": "word_count",
  "ids": ["20240318112233-abc123", "20240318112233-def456"]
}
```

#### batch_insert

**Description**: Insert multiple blocks at specified positions.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `parentID` | string | Yes | Parent block or document ID |
| `blocks` | array | Yes | Array of block objects with `dataType` and `data` |

**Example**:
```json
{
  "action": "batch_insert",
  "parentID": "20240318112233-abc123",
  "blocks": [
    { "dataType": "markdown", "data": "# Heading 1" },
    { "dataType": "markdown", "data": "# Heading 2" }
  ]
}
```

#### batch_update

**Description**: Update multiple blocks at once.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `blocks` | array | Yes | Array of block objects with `id`, `dataType`, and `data` |

**Example**:
```json
{
  "action": "batch_update",
  "blocks": [
    { "id": "20240318112233-abc123", "dataType": "markdown", "data": "Updated 1" },
    { "id": "20240318112233-def456", "dataType": "markdown", "data": "Updated 2" }
  ]
}
```

#### append_daily_note

**Description**: Append a block to today's daily note.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dataType` | string | Yes | `markdown` or `dom` |
| `data` | string | Yes | Block content |
| `notebook` | string | No | Notebook ID |

**Example**:
```json
{
  "action": "append_daily_note",
  "dataType": "markdown",
  "data": "- [ ] Morning task"
}
```

#### prepend_daily_note

**Description**: Prepend a block to today's daily note.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dataType` | string | Yes | `markdown` or `dom` |
| `data` | string | Yes | Block content |
| `notebook` | string | No | Notebook ID |

**Example**:
```json
{
  "action": "prepend_daily_note",
  "dataType": "markdown",
  "data": "# Daily Standup"
}
```

#### doc_info

**Description**: Get information about the document containing a block.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Block or document ID |

**Example**:
```json
{
  "action": "doc_info",
  "id": "20240318112233-abc123"
}
```

#### docs_info

**Description**: Get information for multiple documents.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ids` | string[] | Yes | Document IDs |
| `refCount` | boolean | No | Include reference counts |
| `av` | boolean | No | Include attribute view metadata |

**Example**:
```json
{
  "action": "docs_info",
  "ids": ["20240318112233-abc123", "20240318112233-def456"]
}
```

---

### av

Grouped attribute-view (database) operations.

#### get

**Description**: Get full attribute view payload by AV ID.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Attribute view ID |

**Example**:
```json
{
  "action": "get",
  "id": "20240318112233-abc123"
}
```

#### search

**Description**: Search attribute views by keyword.

**Permission Required**: Read (filtered by notebook permission)

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `keyword` | string | Yes | Search keyword |
| `excludes` | string[] | No | AV IDs to exclude |

**Example**:
```json
{
  "action": "search",
  "keyword": "Projects"
}
```

#### render_attribute_view

**Description**: Render an attribute view with optional view, pagination, query, and group paging context.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Attribute view ID |
| `blockID` | string | No | Optional database block ID |
| `viewID` | string | No | Optional target view ID |
| `page` | number | No | Page number (1-based) |
| `pageSize` | number | No | Rows per page |
| `query` | string | No | Optional row query |
| `groupPaging` | object | No | Optional group paging map |
| `createIfNotExist` | boolean | No | Create a default view if missing |

#### get_attribute_view_keys

**Description**: Get keys/columns for an attribute view.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Attribute view ID |

#### get_attribute_view_filter_sort

**Description**: Get filters and sorts for a database block view.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Attribute view ID |
| `blockID` | string | Yes | Database block ID |

#### add_rows

**Description**: Add existing blocks as rows in an attribute view.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `avID` | string | Yes | Attribute view ID |
| `blockIDs` | string[] | Yes | Block IDs to add as rows |
| `blockID` | string | No | Database block ID |
| `viewID` | string | No | Target view ID |
| `groupID` | string | No | Target group ID |
| `previousID` | string | No | Previous row item ID |
| `ignoreDefaultFill` | boolean | No | Skip default fill from filters/groups |

**Example**:
```json
{
  "action": "add_rows",
  "avID": "20240318112233-abc123",
  "blockIDs": ["20240318112233-def456"]
}
```

#### remove_rows

**Description**: Remove rows from an attribute view.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `avID` | string | Yes | Attribute view ID |
| `srcIDs` | string[] | Yes | Row block/item IDs to remove |

**Example**:
```json
{
  "action": "remove_rows",
  "avID": "20240318112233-abc123",
  "srcIDs": ["20240318112233-def456"]
}
```

#### add_column

**Description**: Add a column to an attribute view.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `avID` | string | Yes | Attribute view ID |
| `keyName` | string | Yes | Column name |
| `keyType` | string | Yes | Column type (see below) |
| `keyID` | string | No | Optional column key ID |
| `keyIcon` | string | No | Optional column icon |
| `previousKeyID` | string | No | Insert after this key ID |

**Column Types**: `text`, `number`, `date`, `select`, `mSelect`, `url`, `email`, `phone`, `mAsset`, `template`, `created`, `updated`, `checkbox`, `relation`, `rollup`, `lineNumber`

**Example**:
```json
{
  "action": "add_column",
  "avID": "20240318112233-abc123",
  "keyName": "Status",
  "keyType": "select"
}
```

#### remove_column

**Description**: Remove a column from an attribute view.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `avID` | string | Yes | Attribute view ID |
| `keyID` | string | No | Column key ID |
| `columnID` | string | No | Alias of keyID |
| `removeRelationDest` | boolean | No | Also remove reverse relation metadata |

**Note**: At least one of `keyID` or `columnID` must be provided.

**Example**:
```json
{
  "action": "remove_column",
  "avID": "20240318112233-abc123",
  "keyID": "20240318112233-def456"
}
```

#### set_cell

**Description**: Update one attribute view cell.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `avID` | string | Yes | Attribute view ID |
| `rowID` | string | Yes | Row item ID |
| `columnID` | string | Yes | Column key ID |
| `valueType` | string | Yes | Cell value type |

**Value Type Specific Fields**:

| Value Type | Required Field | Description |
|------------|----------------|-------------|
| `text` | `text` | Text content |
| `number` | `number` | Numeric value |
| `date` | `date` | ISO string or epoch ms |
| `checkbox` | `checked` | Boolean state |
| `select` | `option` | Selected option |
| `multi_select` | `options` | Array of options |
| `relation` | `relationBlockIDs` | Related block IDs |
| `url` | `url` | URL value |
| `email` | `email` | Email value |
| `phone` | `phone` | Phone value |
| `mAsset` | `assets` | Asset entries |

**Example**:
```json
{
  "action": "set_cell",
  "avID": "20240318112233-abc123",
  "rowID": "20240318112233-def456",
  "columnID": "20240318112233-ghi789",
  "valueType": "text",
  "text": "Hello World"
}
```

#### batch_set_cells

**Description**: Batch update multiple cells.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `avID` | string | Yes | Attribute view ID |
| `items` | array | Yes | Array of cell updates |

Each item in `items` follows the same structure as `set_cell` parameters.

**Example**:
```json
{
  "action": "batch_set_cells",
  "avID": "20240318112233-abc123",
  "items": [
    {
      "rowID": "20240318112233-def456",
      "columnID": "20240318112233-ghi789",
      "valueType": "text",
      "text": "Value 1"
    },
    {
      "rowID": "20240318112233-def456",
      "columnID": "20240318112233-jkl012",
      "valueType": "number",
      "number": 42
    }
  ]
}
```

#### duplicate_block

**Description**: Duplicate a database block from an existing attribute view.

**Permission Required**: Write

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `avID` | string | Yes | Source attribute view ID |
| `previousID` | string | No | Block ID to insert after |

**Example**:
```json
{
  "action": "duplicate_block",
  "avID": "20240318112233-abc123"
}
```

#### get_primary_key_values

**Description**: Get primary key values for an attribute view.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `avID` | string | Yes | Attribute view ID |
| `keyword` | string | No | Filter keyword |
| `page` | number | No | Page number (1-based) |
| `pageSize` | number | No | Rows per page |

**Example**:
```json
{
  "action": "get_primary_key_values",
  "avID": "20240318112233-abc123",
  "keyword": "Project"
}
```

---

### file

Grouped file and asset operations.

#### upload_asset

**Description**: Upload a local file to SiYuan assets.

**Permission Required**: None (but requires user confirmation)

**Confirmation Required**: Yes (and for files >10MB)

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `assetsDirPath` | string | Yes | Asset directory (e.g., `/assets/`) |
| `localFilePath` | string | Yes | Local file path to upload |
| `confirmLargeFile` | boolean | No | Confirm for files >10MB |

**Example**:
```json
{
  "action": "upload_asset",
  "assetsDirPath": "/assets/",
  "localFilePath": "/Users/me/image.png"
}
```

#### render_template

**Description**: Render a template with document context.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Document ID for context |
| `path` | string | Yes | Template path in workspace |

**Example**:
```json
{
  "action": "render_template",
  "id": "20240318112233-abc123",
  "path": "/templates/daily.md"
}
```

#### render_sprig

**Description**: Render a Sprig template.

**Permission Required**: None

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `template` | string | Yes | Sprig template content |

**Example**:
```json
{
  "action": "render_sprig",
  "template": "Hello {{ .name }}"
}
```

#### export_md

**Description**: Export document as Markdown.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Document ID |

**Example**:
```json
{
  "action": "export_md",
  "id": "20240318112233-abc123"
}
```

#### export_resources

**Description**: Export resources as a ZIP archive.

**Permission Required**: None

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `paths` | string[] | Yes | Resource paths to export |
| `name` | string | No | Export file name |
| `outputPath` | string | No | Local path to save ZIP |

**Example**:
```json
{
  "action": "export_resources",
  "paths": ["/assets/image.png"],
  "name": "backup.zip",
  "outputPath": "/Users/me/Downloads/backup.zip"
}
```

#### list_unused_assets

**Description**: List unused asset files.

#### get_doc_assets

**Description**: List assets referenced by a document. Use `assetType` to filter by type.

**Permission Required**: Read

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Document ID |
| `assetType` | string | No | `"all"` (default) or `"image"` to list only image assets |

#### get_image_ocr_text

**Description**: Read stored OCR text for an image asset.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | No | Asset path; omit to get an empty text payload |

---

### search

Grouped search and query operations.

#### fulltext

**Description**: Full-text search across all blocks.

**Permission Required**: Read (filtered by notebook permission)

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query |
| `method` | number | No | 0=keyword, 1=query syntax, 2=SQL, 3=regex |
| `types` | object | No | Block type filter |
| `paths` | string[] | No | Restrict to notebook paths |
| `groupBy` | number | No | 0=no group, 1=by document |
| `orderBy` | number | No | Sort order (0-7) |
| `page` | number | No | Page number |
| `pageSize` | number | No | Results per page (max 128) |
| `stripHtml` | boolean | No | Add plain-text fields |

**Example**:
```json
{
  "action": "fulltext",
  "query": "meeting notes",
  "method": 0,
  "page": 1,
  "pageSize": 32
}
```

#### query_sql

**Description**: Execute read-only SQL query.

**Permission Required**: Read (rows filtered by permission)

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `stmt` | string | Yes | SELECT or WITH statement |

**Example**:
```json
{
  "action": "query_sql",
  "stmt": "SELECT * FROM blocks WHERE content LIKE '%todo%' LIMIT 10"
}
```

**Note**: Only `SELECT` and `WITH` statements are allowed. Mutation queries are forbidden.

#### search_tag

**Description**: Search tags by keyword.

**Permission Required**: None

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `k` | string | Yes | Tag keyword |

**Example**:
```json
{
  "action": "search_tag",
  "k": "project"
}
```

#### get_backlinks

**Description**: Find documents/blocks that link to a block.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Block or document ID |
| `keyword` | string | No | Filter by keyword |
| `refTreeID` | string | No | Narrow to document tree |

**Example**:
```json
{
  "action": "get_backlinks",
  "id": "20240318112233-abc123"
}
```

#### get_backmentions

**Description**: Find documents/blocks that mention a block name.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Block or document ID |
| `keyword` | string | No | Filter by keyword |
| `refTreeID` | string | No | Narrow to document tree |

**Example**:
```json
{
  "action": "get_backmentions",
  "id": "20240318112233-abc123"
}
```

#### search_refs

**Description**: Search blocks that reference a specific block or document.

**Permission Required**: Read

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Referenced block or document ID |
| `keyword` | string | No | Filter by keyword |
| `typeShortcodes` | string[] | No | Block type filters |

**Example**:
```json
{
  "action": "search_refs",
  "id": "20240318112233-abc123"
}
```

#### find_replace

**Description**: Find and replace text across the workspace.

**Permission Required**: Write

**Confirmation Required**: Yes

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `k` | string | Yes | Find keyword |
| `r` | string | Yes | Replacement text |
| `paths` | string[] | No | Restrict to notebook paths |
| `replaceTypes` | object | No | Target kinds (text, code, docTitle, blockRef) |

**Example**:
```json
{
  "action": "find_replace",
  "k": "old text",
  "r": "new text"
}
```

#### search_assets

**Description**: Search asset files by filename.

**Permission Required**: None

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `k` | string | Yes | Asset filename keyword |

**Example**:
```json
{
  "action": "search_assets",
  "k": "image.png"
}
```

#### get_asset_content

**Description**: Get indexed content result for a single asset.

**Permission Required**: None

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Asset content ID |

**Example**:
```json
{
  "action": "get_asset_content",
  "id": "20240318112233-abc123"
}
```

#### fulltext_asset_content

**Description**: Full-text search within asset content indexes.

**Permission Required**: None

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query |
| `page` | number | No | Page number |
| `pageSize` | number | No | Results per page |

**Example**:
```json
{
  "action": "fulltext_asset_content",
  "query": "quarterly report"
}
```

#### list_invalid_refs

**Description**: List invalid block references in the workspace.

**Permission Required**: Read

**Parameters**: None

**Example**:
```json
{
  "action": "list_invalid_refs"
}
```

---

### tag

Grouped tag operations.

#### list

**Description**: List all tags in the workspace.

**Permission Required**: None

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sort` | number | No | Sort mode |
| `ignoreMaxListHint` | boolean | No | Ignore max list hint |
| `app` | string | No | App identifier |

**Example**:
```json
{
  "action": "list"
}
```

#### rename

**Description**: Rename a tag globally.

**Permission Required**: None

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `oldLabel` | string | Yes | Existing tag label |
| `newLabel` | string | Yes | New tag label |

**Example**:
```json
{
  "action": "rename",
  "oldLabel": "old-tag",
  "newLabel": "new-tag"
}
```

#### remove

**Description**: Remove a tag.

**Permission Required**: None

**Confirmation Required**: Yes

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `label` | string | Yes | Tag label to remove |

**Example**:
```json
{
  "action": "remove",
  "label": "old-tag"
}
```

---

### system

Grouped system and notification operations.

#### push_msg

**Description**: Push a notification message.

**Permission Required**: None

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `msg` | string | Yes | Message content |
| `timeout` | number | No | Display timeout in ms |

**Example**:
```json
{
  "action": "push_msg",
  "msg": "Hello from MCP!",
  "timeout": 5000
}
```

#### push_err_msg

**Description**: Push an error notification message.

**Permission Required**: None

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `msg` | string | Yes | Error message content |
| `timeout` | number | No | Display timeout in ms |

**Example**:
```json
{
  "action": "push_err_msg",
  "msg": "Something went wrong!",
  "timeout": 10000
}
```

#### get_version

**Description**: Get SiYuan version.

**Permission Required**: None

**Parameters**: None

**Example**:
```json
{
  "action": "get_version"
}
```

#### get_current_time

**Description**: Get current system time.

**Permission Required**: None

**Parameters**: None

**Returns**: Object with `currentTime` and `iso` fields.

**Example**:
```json
{
  "action": "get_current_time"
}
```

#### workspace_info

**Description**: Get workspace metadata.

**Permission Required**: None

**Note**: Exposes absolute workspace path. Disabled by default.

**Parameters**: None

**Example**:
```json
{
  "action": "workspace_info"
}
```

#### network

**Description**: Get network proxy information.

**Permission Required**: None

**Parameters**: None

**Example**:
```json
{
  "action": "network"
}
```

#### changelog

**Description**: Get current version changelog.

**Permission Required**: None

**Parameters**: None

**Example**:
```json
{
  "action": "changelog"
}
```

#### conf

**Description**: Get system configuration.

**Permission Required**: None

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mode` | string | No | `summary` (default) or `get` |
| `keyPath` | string | No | Dot/bracket path to field |
| `maxDepth` | number | No | Max traversal depth |
| `maxItems` | number | No | Max keys per level |

**Example**:
```json
{
  "action": "conf",
  "mode": "get",
  "keyPath": "conf.appearance.mode"
}
```

#### sys_fonts

**Description**: List available system fonts.

**Permission Required**: None

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mode` | string | No | `summary` (default) or `list` |
| `offset` | number | No | Pagination offset |
| `limit` | number | No | Pagination size |
| `query` | string | No | Filter by name |

**Example**:
```json
{
  "action": "sys_fonts",
  "mode": "list",
  "offset": 0,
  "limit": 50
}
```

#### boot_progress

**Description**: Get boot progress details.

**Permission Required**: None

**Parameters**: None

**Example**:
```json
{
  "action": "boot_progress"
}
```

---

### flashcard

Grouped flashcard review and deck operations.

#### list_cards

**Description**: List due flashcards.

**Permission Required**: None

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scope` | string | Yes | `all`, `deck`, `notebook`, or `tree` |
| `filter` | string | Yes | `due`, `new`, or `old` |
| `deckID` | string | No | Required when scope=deck |
| `notebook` | string | No | Required when scope=notebook |
| `rootID` | string | No | Required when scope=tree |

**Example**:
```json
{
  "action": "list_cards",
  "scope": "all",
  "filter": "due"
}
```

#### get_decks

**Description**: Get flashcard deck definitions.

**Permission Required**: None

**Parameters**: None

**Example**:
```json
{
  "action": "get_decks"
}
```

#### get_cards

**Description**: List all cards in a deck with pagination.

**Permission Required**: None

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `deckID` | string | Yes | Deck ID (empty for all) |
| `page` | number | No | Page number (1-based) |
| `pageSize` | number | No | Cards per page (max 512) |

**Example**:
```json
{
  "action": "get_cards",
  "deckID": "20240318112233-abc123",
  "page": 1,
  "pageSize": 32
}
```

#### review_card

**Description**: Submit a review result for a flashcard.

**Permission Required**: None

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `deckID` | string | Yes | Deck ID |
| `cardID` | string | Yes | Card ID |
| `rating` | number | Yes | Review rating |
| `reviewedCards` | array | No | Additional review data |

**Example**:
```json
{
  "action": "review_card",
  "deckID": "20240318112233-abc123",
  "cardID": "20240318112233-def456",
  "rating": 5
}
```

#### skip_review_card

**Description**: Skip the current flashcard in review flow.

**Permission Required**: None

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `deckID` | string | Yes | Deck ID |
| `cardID` | string | Yes | Card ID |

**Example**:
```json
{
  "action": "skip_review_card",
  "deckID": "20240318112233-abc123",
  "cardID": "20240318112233-def456"
}
```

#### create_card

**Description**: Turn existing blocks into real flashcards by writing `custom-riff-decks` and registering riff cards.

**Permission Required**: None

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `deckID` | string | Yes | Deck ID |
| `blockIDs` | string[] | Yes | Block IDs to turn into flashcards |

**Example**:
```json
{
  "action": "create_card",
  "deckID": "20240318112233-abc123",
  "blockIDs": ["20240318112233-def456"]
}
```

#### add_card

**Description**: Run the lower-level riff registration step for existing blocks.

**Permission Required**: None

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `deckID` | string | Yes | Deck ID |
| `blockIDs` | string[] | Yes | Block IDs to add |

**Example**:
```json
{
  "action": "add_card",
  "deckID": "20240318112233-abc123",
  "blockIDs": ["20240318112233-def456"]
}
```

#### remove_card

**Description**: Remove blocks from a flashcard deck.

**Permission Required**: None

**Confirmation Required**: Yes

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `deckID` | string | Yes | Deck ID |
| `blockIDs` | string[] | Yes | Block IDs to remove |

**Example**:
```json
{
  "action": "remove_card",
  "deckID": "20240318112233-abc123",
  "blockIDs": ["20240318112233-def456"]
}
```

---

### mascot

Grouped mascot balance and care operations. Every successful MCP tool call earns 1 coin.

#### get_balance

**Description**: Get mascot's current spendable balance.

**Permission Required**: None

**Parameters**: None

**Returns**: Object with `balance` and `totalEarned` fields.

**Example**:
```json
{
  "action": "get_balance"
}
```

#### shop

**Description**: List mascot shop inventory.

**Permission Required**: None

**Parameters**: None

**Returns**: Array of shop items with `id`, `label`, `cost`, `type`, and `emoji`.

**Example**:
```json
{
  "action": "shop"
}
```

#### buy

**Description**: Buy an item from the mascot shop.

**Permission Required**: None

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `item_id` | string | Yes | Shop item ID |

**Example**:
```json
{
  "action": "buy",
  "item_id": "cat-food"
}
```

**Available Items**:

| ID | Label | Cost | Type | Emoji |
|----|-------|------|------|-------|
| `cat-food` | Cat Food | 5 | food | |
| `milk` | Milk | 3 | drink | |
| `dried-fish` | Dried Fish | 4 | food | |
| `can-food` | Canned Food | 6 | food | |
| `catnip` | Catnip | 5 | snack | |
| `chicken-leg` | Chicken Leg | 7 | food | |
| `cheese` | Cheese | 4 | snack | |

---

## Action Summary

Total: **115 actions** across **10 tools**

| Tool | Count | Actions |
|------|-------|---------|
| notebook | 11 | list, create, set_open_state, remove, rename, get_conf, set_conf, set_icon, get_permissions, set_permission, get_child_docs |
| document | 20 | create, rename, remove, move, get_path, get_hpath, get_ids, get_child_blocks, get_child_docs, set_icon, set_cover, list_tree, search_docs, get_doc, create_daily_note, duplicate, remove_batch, create_empty, heading_to_doc, doc_to_heading |
| block | 24 | insert, prepend, append, update, delete, move, set_fold_state, get_kramdown, get_children, transfer_ref, set_attrs, get_attrs, exists, info, breadcrumb, dom, recent_updated, word_count, batch_insert, batch_update, append_daily_note, prepend_daily_note, doc_info, docs_info |
| av | 13 | get, render_attribute_view, get_attribute_view_keys, get_attribute_view_filter_sort, search, add_rows, remove_rows, add_column, remove_column, set_cell, batch_set_cells, duplicate_block, get_primary_key_values |
| file | 12 | upload_asset, render_template, render_sprig, export_md, export_resources, list_unused_assets, get_doc_assets, get_image_ocr_text, remove_unused_assets, rename_asset, delete_asset, set_image_alpha |
| search | 11 | fulltext, query_sql, search_tag, get_backlinks, get_backmentions, search_refs, find_replace, search_assets, get_asset_content, fulltext_asset_content, list_invalid_refs |
| tag | 3 | list, rename, remove |
| system | 10 | push_msg, push_err_msg, get_version, get_current_time, workspace_info, network, changelog, conf, sys_fonts, boot_progress |
| flashcard | 8 | list_cards, get_decks, get_cards, review_card, skip_review_card, create_card, add_card, remove_card |
| mascot | 3 | get_balance, shop, buy |

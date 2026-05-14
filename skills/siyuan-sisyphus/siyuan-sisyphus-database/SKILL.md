---
name: siyuan-sisyphus-database
description: Operate SiYuan attribute views (databases). Covers creating AVs, adding columns and rows, updating cells, and the critical ID distinctions. Use when the agent needs to work with SiYuan database blocks.
---

# SiYuan Sisyphus — Database / Attribute View

SiYuan attribute views (AV) are real database structures, not Markdown tables.

## Create a Database

```python
# Initialize AV and materialize the database block into a document
av(action="render", blockID="doc-id", createIfNotExist=True)
# MCP generates the AV ID automatically if id is omitted
```

## Add Columns

```python
av(action="add_column", avID="av-id", keyName="Status", keyType="select")
av(action="add_column", avID="av-id", keyName="Due Date", keyType="date")
av(action="add_column", avID="av-id", keyName="Priority", keyType="number")
```

Supported `keyType` values: `text`, `number`, `date`, `select`, `mSelect`, `url`, `email`, `phone`, `mAsset`, `template`, `created`, `updated`, `checkbox`, `relation`, `rollup`, `lineNumber`.

## Add Rows

```python
# Bind existing blocks as rows
av(action="add_rows", avID="av-id", blockIDs=["block-id-1", "block-id-2"])

# Create detached rows with plain text primary keys
av(action="add_rows", avID="av-id", primaryKeyTexts=["Task 1", "Task 2"])
```

## Update Cells

```python
# Single cell
av(action="set_cells", avID="av-id", rowID="row-item-id", columnID="col-id",
   valueType="text", text="Done")

# Batch update
av(action="set_cells", avID="av-id", cells=[
    {"rowID": "row-item-id-1", "columnID": "col-id-1", "valueType": "select", "option": "Done"},
    {"rowID": "row-item-id-1", "columnID": "col-id-2", "valueType": "date", "date": "2026-05-14T00:00:00+08:00"},
    {"rowID": "row-item-id-2", "columnID": "col-id-1", "valueType": "checkbox", "checked": True}
])
```

Cell value types and their corresponding fields:
| valueType | Required field |
|-----------|---------------|
| `text` | `text` |
| `number` | `number` |
| `date` | `date` (ISO string or epoch ms) |
| `checkbox` | `checked` |
| `select` | `option` |
| `multi_select` | `options` (array) |
| `url` | `url` |
| `email` | `email` |
| `phone` | `phone` |
| `mAsset` | `assets` (array of `{content, type, name?}`) |
| `relation` | `relationBlockIDs` (array) |

## Read Database Content

```python
# Get full AV payload
av(action="get", avID="av-id")

# Render with view context (filters, sorts, pagination)
av(action="render", id="av-id", blockID="doc-id")

# Search databases by name
av(action="search", keyword="project")

# Get primary key values only
av(action="get_primary_key_values", avID="av-id")
```

## Duplicate a Database

```python
av(action="duplicate", avID="av-id", blockID="doc-id")
```

## Pitfalls (Critical)

1. **rowID is NOT block.id**: 
   - `block.id` = original source block ID
   - `blockID` (in AV value) = the row binding ID (itemID) inside the database — this is what you use for `rowID`
   - `id` (in AV value) = the cell value ID, not the row ID

2. **`set_cells` uses `columnID`, NOT `keyID`**: Even if `av(action="get")` returns column metadata under a field named `key`, write operations still require `columnID`.

3. **Date values use ISO strings**: e.g., `2026-05-14T00:00:00+08:00`.

4. **After `add_rows`, reuse the returned mapping**: The response includes `rows[{ blockID, rowID }]` mapping. Use these `rowID`s directly for subsequent `set_cells` calls.

```python
# Correct workflow
result = av(action="add_rows", avID="av-id", blockIDs=["block-id"])
row_id = result.rows[0].rowID  # Use this rowID
av(action="set_cells", avID="av-id", rowID=row_id, columnID="col-id", valueType="text", text="value")
```

5. **`add_rows` requires either `blockIDs` or `primaryKeyTexts`**.

6. **AV permission checks resolve from registered database blocks**: For `createIfNotExist=true`, provide `blockID` as the creation target; after materialization, MCP can usually rediscover that owning database block automatically.

# av

This tool covers attribute view and database-style operations.

When to read this page: you need to inspect or mutate a real SiYuan attribute view instead of using Markdown tables.

Related pages:

- [Common Tasks](../common-tasks.md)
- [Permissions](../permissions.md)

## Common Actions

| Group | Actions |
|------|---------|
| Read | `get`, `render_attribute_view`, `get_attribute_view_keys`, `get_attribute_view_filter_sort`, `search`, `get_primary_key_values` |
| Row operations | `add_rows`, `remove_rows` |
| Column operations | `add_column`, `remove_column` |
| Cell updates | `set_cell`, `batch_set_cells` |
| Structure | `duplicate_block` |

## Parameters and Semantics

- `render_attribute_view` can also create and materialize an AV when `createIfNotExist=true`
- `set_cell` is typed by `valueType`
- `rowID` refers to the row item ID, not the source block ID

## Safety Rules

- AV operations are real database operations, not Markdown table edits
- Use `av` for structured data instead of faking database behavior in Markdown

## Examples

MCP:

```json
{
  "action": "get",
  "id": "<attribute-view-id>"
}
```

```json
{
  "action": "add_column",
  "avID": "<attribute-view-id>",
  "keyName": "Status",
  "keyType": "select"
}
```

CLI:

```bash
siyuan av get --id <attribute-view-id>
siyuan av add-column --av-id <attribute-view-id> --key-name Status --key-type select
```

## Action List

- `get`
- `render_attribute_view`
- `get_attribute_view_keys`
- `get_attribute_view_filter_sort`
- `search`
- `add_rows`
- `remove_rows`
- `add_column`
- `remove_column`
- `set_cell`
- `batch_set_cells`
- `duplicate_block`
- `get_primary_key_values`

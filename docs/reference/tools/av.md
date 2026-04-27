# av

This tool covers attribute view and database-style operations.

When to read this page: you need to inspect or mutate a real SiYuan attribute view instead of using Markdown tables.

Related pages:

- [Common Tasks](../common-tasks.md)
- [Permissions](../permissions.md)

## Common Actions

| Group | Actions |
|------|---------|
| Read | `get`, `render`, `get_attribute_view_keys`, `get_attribute_view_filter_sort`, `search`, `get_primary_key_values` |
| Row operations | `add_rows`, `remove_rows` |
| Column operations | `add_column`, `remove_column` |
| Cell updates | `set_cells` |
| Structure | `duplicate` |

## Parameters and Semantics

- `render` can also create and materialize an AV when `createIfNotExist=true` and `blockID` is provided. In this mode, `blockID` is the target parent/insertion context, and MCP inserts a SiYuan-style spun AV block through a transaction.
- Keep the `blockID` returned by `render(createIfNotExist=true)`. Later AV reads and writes usually only need `avID`; MCP resolves the owning database block from row bindings, mirror database blocks, or the blocks-table AV block record. Pass `blockID` when you need an exact database-block view context, when multiple mirrors are possible, or as an explicit fallback for a brand-new empty AV.
- `set_cells` is typed by `valueType` and accepts either single-cell fields or a `cells` / `items` array.
- `rowID` refers to the row item ID, not the source block ID.
- AV writes follow SiYuan frontend transaction operations where possible, including row/column/cell operations and database block `updated` refresh metadata.
- `duplicate` follows SiYuan's copy-as-mirror flow: it duplicates the AV definition, spins the AV block DOM, and inserts the mirror database block through a transaction. `previousID` controls the insertion position when provided; otherwise `blockID` or an automatically resolved owning database block is used as the default insertion context.

## Safety Rules

- AV operations are real database operations, not Markdown table edits.
- Use `av` for structured data instead of faking database behavior in Markdown.

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
siyuan av add-rows --av-id <attribute-view-id> --block-ids <block-id>
siyuan av add-rows --av-id <attribute-view-id> --primary-key-texts "Plain text row"
```

## Action List

- `get`
- `render`
- `get_attribute_view_keys`
- `get_attribute_view_filter_sort`
- `search`
- `add_rows`
- `remove_rows`
- `add_column`
- `remove_column`
- `set_cells`
- `duplicate`
- `get_primary_key_values`

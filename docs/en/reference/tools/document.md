# document

This tool covers document CRUD, tree navigation, and daily-note oriented document operations.

When to read this page: you need to create, move, query, or convert documents.

Related pages:

- [Path Semantics](../path-semantics.md)
- [Permissions](../permissions.md)

## Common Actions

| Group | Actions |
|------|---------|
| Create and read | `create`, `create_empty`, `get_doc`, `get_path`, `get_hpath`, `get_ids` |
| Tree navigation | `get_child_blocks`, `get_child_docs`, `list_tree`, `search_docs` |
| Mutations | `rename`, `move`, `remove`, `remove_batch`, `duplicate` |
| Presentation | `set_icon`, `set_cover` |
| Daily note / conversion | `create_daily_note`, `heading_to_doc`, `doc_to_heading` |

## Parameters and Semantics

- `create` and `create_empty` take a human-readable `path`
- `rename`, `remove`, and `move` often need a storage path if you are not using document IDs
- `move` supports ID mode and path mode
- `set_cover` clears the cover when `source` is omitted

## Safety Rules

- `remove`, `move`, and `remove_batch` require explicit confirmation
- Always resolve document path type before mutating by path

## Examples

MCP:

```json
{
  "action": "create",
  "notebook": "<notebook-id>",
  "path": "/Inbox/Weekly Note",
  "markdown": "# Weekly Report"
}
```

```json
{
  "action": "get_path",
  "id": "<doc-id>"
}
```

CLI:

```bash
siyuan document create --notebook <notebook-id> --path "/Inbox/Weekly Note" --markdown "# Weekly Report"
siyuan document get-path --id <doc-id>
```

## Action List

- `create`
- `rename`
- `remove`
- `move`
- `get_path`
- `get_hpath`
- `get_ids`
- `get_child_blocks`
- `get_child_docs`
- `set_icon`
- `set_cover`
- `list_tree`
- `search_docs`
- `get_doc`
- `create_daily_note`
- `duplicate`
- `remove_batch`
- `create_empty`
- `heading_to_doc`
- `doc_to_heading`

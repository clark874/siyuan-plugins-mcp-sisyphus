# document

This tool covers document CRUD, tree navigation, and daily-note oriented document operations.

When to read this page: you need to create, move, query, or convert documents.

Related pages:

- [Path Semantics](../path-semantics.md)
- [Permissions](../permissions.md)

## Common Actions

| Group | Actions |
|------|---------|
| Create and read | `create`, `resolve`, `get_doc` |
| Tree navigation | `get_child_blocks`, `get_child_docs`, `list_tree`, `search_docs` |
| Mutations | `rename`, `move`, `remove`, `remove_batch`, `duplicate` |
| Presentation | `set_icon`, `set_cover` |
| Daily note / conversion | `create_daily_note`, `heading_to_doc`, `doc_to_heading` |

## Parameters and Semantics

- `create` takes either a human-readable `path`, or `parentPath` + `title`; omit `markdown` to create an empty document
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
  "action": "resolve",
  "id": "<doc-id>",
  "include": ["path"]
}
```

CLI:

```bash
siyuan document create --notebook <notebook-id> --path "/Inbox/Weekly Note" --markdown "# Weekly Report"
siyuan document resolve --id <doc-id> --include-json '["path"]'
```

## Action List

- `create`
- `resolve`
- `rename`
- `remove`
- `move`
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
- `heading_to_doc`
- `doc_to_heading`

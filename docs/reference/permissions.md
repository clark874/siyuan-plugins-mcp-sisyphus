# Permissions

This page explains notebook-level access control and confirmation rules.

When to read this page: you see permission errors or need to reason about write and delete boundaries.

Related pages:

- [Path Semantics](./path-semantics.md)
- [Tools Index](./tools/index.md)

## Permission Levels

| Level | Read | Write | Delete |
|-------|------|-------|--------|
| `rwd` | Yes | Yes | Yes |
| `rw` | Yes | Yes | No |
| `r` | Yes | No | No |
| `none` | No | No | No |

Notes:

- New notebooks default to `r` (read-only) unless configured otherwise
- Permissions are managed through `notebook(action="set_permission")`
- Changes apply to subsequent calls immediately

## High-Risk Actions

These actions require explicit user confirmation:

- `notebook.remove`
- `notebook.set_permission`
- `document.remove`
- `document.move`
- `document.remove_batch`
- `block.delete`
- `block.move`
- `file.upload_asset`
- `file.remove_unused_assets`
- `file.delete_asset`
- `search.find_replace`
- `system.workspace_info`
- `tag.remove`
- `flashcard.remove_card`

Additional notes:

- `file.upload_asset` also requires special confirmation for large files
- `file.export_resources` with a local `outputPath` should be treated as high-risk operationally

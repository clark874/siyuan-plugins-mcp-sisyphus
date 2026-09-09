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
- Permissions are managed through the plugin settings or the file-tree badges
- Changes apply to subsequent calls immediately

## File-Tree Status Display

The plugin can show an `R`, `RW`, `RWD`, or `NONE` badge beside each notebook root in SiYuan's file tree. The badge only reflects the current MCP permission; it does not change note content or SiYuan's own access control. Child documents inherit their notebook permission, so they are not decorated individually.

Click a badge to cycle through `NONE → R → RW → RWD → NONE` and save immediately. Successful changes do not show a notification; a failed save restores the previous permission. Use **Show MCP permissions in the file tree** on the plugin's Permissions settings page to turn this display off. A dashed `R` means that the notebook has no explicit entry and is using the default read-only permission.

## High-Risk Actions

These currently exposed destructive or structure-changing actions require explicit user confirmation:

- `fs.rm`
- `fs.mv`
- `document.move`
- `block.move`
- `av.remove_rows`
- `av.remove_column`
- `search.find_replace`
- `search.criteria_remove`
- `tag.remove`

The `file` category only manages registered project-source text. It does not upload, export, or delete SiYuan assets.

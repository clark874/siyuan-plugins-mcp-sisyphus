# tag

This tool covers global workspace tag listing and tag mutations.

When to read this page: you need to inspect or rename/remove tags across the workspace.

Related pages:

- [Permissions](../permissions.md)

## Actions

| Action | Required Fields | Notes |
|--------|-----------------|------|
| `list` | none | Optional sort and list tuning |
| `rename` | `oldLabel`, `newLabel` | Global rename |
| `remove` | `label` | Confirmation required |

## Notes

- Tags are inline Markdown semantics, not block attributes
- There is no direct create action; create tags by writing `#tag#` in content

# Path Semantics

This page defines the two path types used by document actions.

When to read this page: you are calling `document` actions and are unsure whether a field wants a human-readable path or a storage path.

Related pages:

- [Permissions](./permissions.md)
- [document tool](./tools/document.md)

## Human-Readable Path

Used by:

- `document(action="create")`
- `document(action="get_ids")`

Format:

- `/Inbox/Weekly Note`

Rules:

- Must start with `/`
- Parent path must already exist

## Storage Path

Used by:

- `document(action="rename")`
- `document(action="remove")`
- `document(action="move")`
- `document(action="get_hpath")`
- `document(action="list_tree")`

Format:

- `/20240318112233-abc123.sy`

Rules:

- Represents the real file storage location
- Obtain it through `document(action="get_path", id=...)`

## Safe Workflow

1. Call `document(action="get_path", id=...)`
2. Reuse the returned storage path in follow-up operations

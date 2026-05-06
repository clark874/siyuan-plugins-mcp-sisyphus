# fs Tool

Use `fs` first for ordinary document file operations. It accepts human-readable workspace paths and hides notebook IDs, block IDs, and storage paths.

Path shape:

- `/<notebook name>` for a notebook root
- `/<notebook name>/<folder>/<doc>` for a document
- `/` for all readable notebook roots

## Common Actions

| Action | Purpose |
|--------|---------|
| `ls` | List direct child documents as `{ name, path, children }` |
| `tree` | List a compact recursive document tree |
| `read` | Read a document as Markdown |
| `write` | Create a document, or replace its body with `overwrite=true` |
| `search` | Search Markdown lines under a document or folder path |

## High-risk Actions

- `rm` deletes a document and requires explicit confirmation.
- `mv` moves or renames a document and requires explicit confirmation.

## Examples

```json
{ "action": "ls", "path": "/Inbox/Meetings" }
```

```json
{ "action": "read", "path": "/Inbox/Meetings/2024 Summary" }
```

```json
{ "action": "write", "path": "/Inbox/Meetings/New Doc", "markdown": "# Notes\n\nContent" }
```

```json
{ "action": "search", "path": "/Inbox/Meetings", "query": "budget", "caseSensitive": false }
```

Use `document`, `block`, `search`, or `av` only when you need SiYuan-specific block layout, metadata, SQL, backlinks, assets, or database operations.


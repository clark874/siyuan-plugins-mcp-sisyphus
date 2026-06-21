# document

This tool covers document CRUD, tree navigation, metadata, and daily-note oriented document operations.

When to read this page: you need to create, move, query, or convert documents.

Related pages:

- [Path Semantics](../path-semantics.md)
- [Permissions](../permissions.md)

## Common Actions

| Group | Actions |
|------|---------|
| Create and read | `create`, `lookup`, `get_doc` |
| Tree navigation | `get_child_blocks`, `get_child_docs`, `list_tree`, `search_docs` |
| Metadata and mutations | `rename`, `move`, `remove`, `set_attr`, `duplicate` |
| Daily note / conversion | `create_daily_note`, `heading_to_doc`, `doc_to_heading` |

## Parameters and Semantics

- `create` takes either a human-readable `path`, or `parentPath` + `title`; omit `markdown` to create an empty document. Prefer `path` for child documents. The `parentPath` + `title` mode accepts either a human-readable parent path or a storage path ending in `.sy` returned by `lookup`.
- `lookup` resolves by `id`, storage `path`, or human-readable `hpath` / `hPath`; use `include` to request `id`, `ids`, `path`, `hpath`, or `docInfo`.
- The returned `idPath` includes available `id` / `ids`. When several documents share the same hpath, `include: ["ids"]` returns all matching IDs; the tool includes a SQL fallback.
- `rename`, `remove`, and `move` often need a storage path if you are not using document IDs.
- `get_child_docs` requires a document `id`; it does not accept `notebook + path`.
- `list_tree` uses `notebook + path`, and `path` is a storage path such as `/` or `/20240318112233-abc123.sy`, not a human-readable path.
- If bulk `remove` hits SiYuan's short `indexing` window, retry by deleting one document at a time with `notebook + storage path`.
- `set_attr` writes document metadata attributes by document ID.

## Markdown and Title Rules

- `create` markdown does not need a same-name leading `# Title`; if present, it is stripped to avoid duplicate visible titles.
- `create` accepts `((id 'title'))`, naked `((id))`, and `#tag#` directly. Naked refs are expanded to explicit anchors; if lookup fails, MCP falls back to `((id 'id'))` with a warning.
- `create` allows footnote-style refs such as `[^1]` and `[text](siyuan://blocks/id)`, but the result includes a hint because they do not create SiYuan backlinks.
- `get_doc` returns the same editable Markdown shape as `fs.read`, preserving `((id 'title'))` and `#tag#`.

## Safety Rules

- `remove` and `move` require explicit confirmation.
- Always resolve document path type before mutating by path.

## Examples

MCP:

```json
{
  "action": "create",
  "notebook": "<notebook-id>",
  "path": "/Inbox/Weekly Note",
  "markdown": "Weekly report body"
}
```

```json
{
  "action": "lookup",
  "id": "<doc-id>",
  "include": "path"
}
```

CLI:

```bash
siyuan document create --notebook <notebook-id> --path "/Inbox/Weekly Note" --markdown "Weekly report body"
siyuan document lookup --id <doc-id> --include path
```

## Action List

- `create`
- `lookup`
- `rename`
- `remove`
- `move`
- `get_child_blocks`
- `get_child_docs`
- `set_attr`
- `list_tree`
- `search_docs`
- `get_doc`
- `create_daily_note`
- `duplicate`
- `heading_to_doc`
- `doc_to_heading`

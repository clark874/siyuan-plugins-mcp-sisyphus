# block

This tool covers block insertion, updates, movement, metadata, references, and document-context helpers.

When to read this page: you need to manipulate block content directly instead of working at the whole-document level.

Related pages:

- [Permissions](../permissions.md)
- [document](./document.md)

## Common Actions

| Group | Actions |
|------|---------|
| Insert and update | `insert`, `prepend`, `append`, `update` |
| Movement and structure | `move`, `set_fold_state`, `get_children`, `breadcrumb` |
| Metadata | `set_attrs`, `get_attrs`, `info`, `dom`, `get_kramdown`, `batch_kramdown` |
| Reference / utility | `transfer_references`, `word_count`, `recent_updated` |
| Daily note helper | `add_to_daily_note` |
| Document context | `docs_info` |

## Parameters and Semantics

- `dataType` is usually `markdown` or `dom`.
- `prepend` and `append` work on either a document or a block child list.
- `update` is best for single-block replacement.
- `move` requires at least one destination hint such as `parentID` or `previousID`.
- For batch `move`, pass `ids` in the desired final order. The tool reverses only the internal SiYuan API call order and returns `apiCallOrder` for debugging.
- `add_to_daily_note` appends or prepends content to today's daily note via `position`.
- `batch_kramdown` accepts 1–20 block or document IDs, performs a read-permission resolution for each item, fetches readable content in one kernel request, and returns an ordered item for every input ID. Duplicate IDs remain duplicated in the output; denied or missing IDs are returned as per-item errors.

## Safety Rules

- `delete` and `move` require explicit confirmation.
- For multiline content, prefer `append`, `prepend`, or `insert` instead of `update`.

## Examples

MCP:

```json
{
  "action": "append",
  "parentID": "<doc-id>",
  "dataType": "markdown",
  "data": "- [ ] Todo item"
}
```

CLI:

```bash
siyuan block append --parent-id <doc-id> --data-type markdown --data "- [ ] Todo item"
```

## Action List

- `insert`
- `prepend`
- `append`
- `update`
- `delete`
- `move`
- `set_fold_state`
- `get_kramdown`
- `batch_kramdown`
- `get_children`
- `transfer_references`
- `set_attrs`
- `get_attrs`
- `info`
- `breadcrumb`
- `dom`
- `recent_updated`
- `word_count`
- `add_to_daily_note`
- `docs_info`

# search

This tool covers full-text search, backlinks, SQL reads, asset search, and controlled find-replace operations.

When to read this page: you need to find content across the workspace or query indexed content.

Related pages:

- [Permissions](../permissions.md)
- [Error Types](../error-types.md)

## Common Actions

| Group | Actions |
|------|---------|
| Text search | `fulltext`, `search_tag`, `search_refs` |
| Graph / relation | `get_backlinks`, `get_backmentions`, `list_invalid_refs` |
| SQL / asset | `query_sql`, `search_assets`, `get_asset_content`, `fulltext_asset_content` |
| Mutating | `find_replace` |

## Safety Rules

- `find_replace` requires explicit confirmation
- `query_sql` is read-only and should stay `SELECT`/`WITH` only
- Search results are filtered by notebook permissions where applicable

## Examples

MCP:

```json
{
  "action": "fulltext",
  "query": "meeting notes"
}
```

```json
{
  "action": "query_sql",
  "stmt": "SELECT * FROM blocks LIMIT 10"
}
```

CLI:

```bash
siyuan search fulltext --query "meeting notes"
siyuan search query-sql --stmt "SELECT * FROM blocks LIMIT 10"
```

## Action List

- `fulltext`
- `query_sql`
- `search_tag`
- `get_backlinks`
- `get_backmentions`
- `search_refs`
- `find_replace`
- `search_assets`
- `get_asset_content`
- `fulltext_asset_content`
- `list_invalid_refs`

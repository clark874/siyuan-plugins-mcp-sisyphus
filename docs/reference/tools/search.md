# search

This tool covers semantic knowledge discovery, full-text search, backlinks, SQL reads, asset search, and controlled find-replace operations.

When to read this page: you need to find content across the workspace or query indexed content.

Related pages:

- [Permissions](../permissions.md)
- [Error Types](../error-types.md)

## Common Actions

| Group | Actions |
|------|---------|
| Knowledge retrieval | `knowledge` |
| Text search | `fulltext`, `search_refs` |
| Graph / relation | `get_backlinks`, `list_invalid_refs` |
| SQL / asset | `query_sql`, `search_assets`, `fulltext_asset_content` |
| Mutating | `find_replace` |

## Safety Rules

- `find_replace` is the mutating exception in this tool and requires explicit confirmation.
- `query_sql` is read-only and only accepts `SELECT` statements; add `LIMIT` yourself. `maxRows` controls the returned window after permission filtering (default 200, maximum 1000).
- Raw SQL can forge or hide result provenance, so `query_sql` is available only when every configured notebook is readable. If any notebook has permission `none`, the action fails closed before executing the query; use scope-aware search/database actions instead. When all notebooks are readable, aggregate, grouping, CTE, and row-level results no longer incur per-row ownership lookups.
- Search results are filtered by notebook permissions where applicable.
- `knowledge` requires SiYuan 3.8.0+ with a configured embedding model. The natural-language query leaves the workspace for that provider and may incur cost. It permission-filters semantic hits first, collapses reference-only results into their target blocks, prefers named content atoms, and attaches readable documents that reference each atom.
- A semantic match is a discovery candidate, not evidence. Read the returned stable block ID and inspect its source and verification attributes before reuse.
- Full-text search can lag briefly behind recent writes because indexing is eventually consistent.

## Examples

MCP:

```json
{
  "action": "knowledge",
  "query": "How is textnets projection weighting computed?",
  "pageSize": 10,
  "candidateSize": 30
}
```

```json
{
  "action": "fulltext",
  "query": "meeting notes",
  "methodName": "keyword",
  "sortBy": "relevance"
}
```

```json
{
  "action": "query_sql",
  "sql": "SELECT id, content, type FROM blocks LIMIT 10"
}
```

CLI:

```bash
siyuan search knowledge --query "How is textnets projection weighting computed?" --page-size 10 --candidate-size 30
siyuan search fulltext --query "meeting notes" --method-name keyword --sort-by relevance
siyuan search query-sql --sql "SELECT id, content, type FROM blocks LIMIT 10"
```

Notes for AI callers:

- Prefer semantic aliases such as `methodName`, `sortBy`, `query`, and `sql` over numeric `method` / `orderBy` or short legacy fields like `k`.
- `fulltext` returns `plainContent` and `excerpt` by default, so you do not need `stripHtml=true` just to get plain text.
- When `parentId`, `hasTags`, or permission filtering are involved, `kernel*` metadata describes the raw SiYuan search page and `returned*` metadata describes the post-filtered data in the current response.

## Action List

- `fulltext`
- `knowledge`
- `query_sql`
- `get_backlinks`
- `search_refs`
- `find_replace`
- `search_assets`
- `fulltext_asset_content`
- `list_invalid_refs`

# search

This tool covers semantic knowledge discovery, full-text search, backlinks, SQL reads, asset search, and controlled find-replace operations.

When to read this page: you need to find content across the workspace or query indexed content.

Related pages:

- [Permissions](../permissions.md)
- [Error Types](../error-types.md)

## Common Actions

| Group | Actions |
|------|---------|
| Knowledge retrieval | `knowledge`, `check_anchor` |
| Text search | `fulltext`, `semantic`, `search_refs` |
| Graph / relation | `get_backlinks`, `list_invalid_refs` |
| SQL / asset | `query_sql`, `search_assets`, `fulltext_asset_content` |
| Saved search | `criteria_list`, `criteria_save`, `criteria_remove` |
| Mutating | `find_replace` |

## Safety Rules

- `find_replace` is the mutating exception in this tool and requires explicit confirmation.
- `query_sql` is read-only and only accepts `SELECT` statements; add `LIMIT` yourself. `maxRows` controls the returned window after permission filtering (default 200, maximum 1000).
- Raw SQL can forge or hide result provenance, so `query_sql` is available only when every configured notebook is readable. If any notebook has permission `none`, the action fails closed before executing the query; use scope-aware search/database actions instead. When all notebooks are readable, aggregate, grouping, CTE, and row-level results no longer incur per-row ownership lookups.
- Search results are filtered by notebook permissions where applicable.
- `knowledge` first probes the readable controlled namespace. One exact normalized `name`/`alias` returns locally without embedding cost or data egress. Duplicate exact anchors return an explicit ambiguity and are never silently selected, unless `activeScopes` intersects exactly one target. Unique contained anchors seed semantic retrieval; only unresolved text reaches the configured SiYuan 3.8 embedding provider.
- `knowledge` runs a local lexical pre-check before any embedding egress: when a readable full-text block contains every query token, it is returned directly with `retrievalMode="lexical_exact"` and `egressAvoided=true`; set `lexicalFirst=false` for pure-semantic retrieval-evaluation baselines.
- Namespace results attach available verification and redacted source metadata. Deterministic resolution is not evidence approval: read the stable block and inspect its evidence boundary before reuse. `namespaceMode="off"` exists only for retrieval evaluation baselines.
- `check_anchor` is a generated, read-only namespace audit. It normalizes exact `name`/`alias` tokens, filters unreadable blocks, and returns every matching target plus `custom-anchor-scope` values. Canonical names are expected to remain unique; alias multi-matches are reported for adjudication and can resolve automatically only when exactly one target intersects `activeScopes`.
- Send at most 10 candidate tokens per `check_anchor` call. Each candidate returns at most 10 target details while preserving the full `targetCount` and a truncation hint, so large historical collisions fail closed without overflowing client output.
- A semantic match is a discovery candidate, not evidence. Read the returned stable block ID and inspect its source and verification attributes before reuse.
- `criteria_*` actions manage the workspace-level saved-search store (kernel `/api/storage/*`, public API since SiYuan 3.8.2). They are global rather than notebook-scoped and bypass per-notebook permission filtering, so only use them when the user explicitly asks. `criteria_save` overwrites an existing criterion with the same name; both `criteria_save` and `criteria_remove` require explicit confirmation. The `obj` field is an opaque kernel search-condition object: pass it through verbatim (typically copied from `criteria_list` output) instead of constructing it by hand.
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

Exact aliases can stay fully local:

```json
{
  "action": "knowledge",
  "query": "water paper",
  "activeScopes": ["water-commodification"]
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

```json
{
  "action": "check_anchor",
  "candidates": ["textnets-projection", "文本网络"],
  "candidateKind": "alias",
  "activeScopes": ["textnets"]
}
```

CLI:

```bash
siyuan search knowledge --query "How is textnets projection weighting computed?" --page-size 10 --candidate-size 30
siyuan search fulltext --query "meeting notes" --method-name keyword --sort-by relevance
siyuan search query-sql --sql "SELECT id, content, type FROM blocks LIMIT 10"
siyuan search criteria-save --name "meeting notes" --obj-json '{"k":"meeting notes","method":0}'
```

Notes for AI callers:

- Prefer semantic aliases such as `methodName`, `sortBy`, `query`, and `sql` over numeric `method` / `orderBy` or short legacy fields like `k`.
- `fulltext` returns `plainContent` and `excerpt` by default, so you do not need `stripHtml=true` just to get plain text.
- When `parentId`, `hasTags`, or permission filtering are involved, `kernel*` metadata describes the raw SiYuan search page and `returned*` metadata describes the post-filtered data in the current response.

## Action List

- `fulltext`
- `semantic`
- `knowledge`
- `check_anchor`
- `query_sql`
- `get_backlinks`
- `search_refs`
- `find_replace`
- `search_assets`
- `fulltext_asset_content`
- `list_invalid_refs`
- `criteria_list`
- `criteria_save`
- `criteria_remove`

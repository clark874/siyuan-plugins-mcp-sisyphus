# search

The maintained search surface contains 12 text-knowledge actions:

- Retrieval: `fulltext`, `semantic`, `knowledge`, `query_sql`.
- Governance and references: `check_anchor`, `get_backlinks`, `search_refs`, `list_invalid_refs`.
- Controlled mutation: `find_replace`, `criteria_save`, `criteria_remove`.
- Saved search inspection: `criteria_list`.

Use `knowledge` for governed natural-language retrieval, `semantic` for candidate inspection, and read-only `query_sql` with an explicit `LIMIT` for structured analysis. `check_anchor` is a pre-write collision check, not a retrieval shortcut. Asset filename search and indexed asset-content/OCR search are not exposed.

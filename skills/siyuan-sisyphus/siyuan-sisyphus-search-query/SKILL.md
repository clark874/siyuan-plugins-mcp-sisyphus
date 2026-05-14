---
name: siyuan-sisyphus-search-query
description: Search and query SiYuan notes. Covers fulltext search, SQL query, backlinks, references, and embed query blocks. Use when the agent needs to find content in SiYuan.
---

# SiYuan Sisyphus — Search and Query

## Fulltext Search

```python
# Keyword search (default)
search(action="fulltext", query="思源笔记")

# Query syntax (methodName="query" or method=1)
search(action="fulltext", query="foo NOT bar", methodName="query")

# Regex search
search(action="fulltext", query="pattern", methodName="regex")

# Scoped to document subtree
search(action="fulltext", query="keyword", parentId="doc-id")

# Filter by tag presence
search(action="fulltext", query="keyword", hasTags=True)

# Filter by block type (shortcodes auto-expand)
search(action="fulltext", query="keyword", types={"h": true, "c": true})
```

Search type shortcodes: `d`=document, `h`=heading, `p`=paragraph, `l`=list, `i`=list-item, `b`=blockquote, `c`=code, `m`=math, `t`=table, `html`=html, `video`=video, `audio`=audio, `widget`=widget, `av`=databaseBlock.

Prefer semantic aliases `methodName`/`sortBy` over numeric `method`/`orderBy`.

## SQL Query

```python
# Always add LIMIT yourself
search(action="query_sql", stmt="SELECT * FROM blocks WHERE type = 'p' ORDER BY updated DESC LIMIT 10")

# FTS query (faster for text matching)
search(action="query_sql", stmt="SELECT * FROM blocks_fts WHERE blocks_fts MATCH 'content:思源' LIMIT 10")

# Tag search via SQL
search(action="query_sql", stmt="SELECT * FROM spans WHERE type = 'tag' AND content = '#标签名#'")
```

Common `blocks` table columns: `id`, `parent_id`, `root_id`, `box`, `path`, `hpath`, `name`, `alias`, `memo`, `tag`, `content`, `fcontent`, `markdown`, `length`, `type`, `subtype`, `ial`, `sort`, `created`, `updated`.

Common tables: `blocks`, `blocks_fts`, `blocks_fts_case_insensitive`, `attributes`, `refs`, `spans`, `assets`.

## Backlinks and References

```python
# Get documents/blocks that reference this block
search(action="get_backlinks", id="block-id", mode="both")
# mode options: "links" | "mentions" | "both"

# Search references with surrounding context
search(action="search_refs", id="block-id", beforeLen=512)

# List invalid block references
search(action="list_invalid_refs")
```

## Search Assets

```python
# Search asset filenames
search(action="search_assets", k="image.png")

# Search indexed asset/OCR text
search(action="fulltext_asset_content", query="text in image")
```

## Embed Query Blocks

Create a dynamic SQL query block inside a document:

```python
block(action="append", parentID="doc-id", dataType="markdown",
      data="""{{SELECT * FROM blocks WHERE content LIKE '%[ ]%' AND type = 'i' LIMIT 20}}""")
```

## Find and Replace

**Requires explicit user confirmation** before execution.

```python
search(action="find_replace", k="old text", r="new text", ids=["doc-id"])
```

## Pitfalls

1. **Indexing delay**: Right after creating or editing content, full-text and tag search can lag behind writes because SiYuan indexing is eventually consistent. Brief retries are expected.

2. **Always add LIMIT in SQL**: MCP may truncate large result sets and will tell you when to refine the query.

3. **SQL is read-only**: `search(action="query_sql")` only accepts SELECT / WITH statements. Mutation queries are rejected.

4. **Case sensitivity**: Default search is case-insensitive using `blocks_fts_case_insensitive`. For case-sensitive search, use `blocks_fts`.

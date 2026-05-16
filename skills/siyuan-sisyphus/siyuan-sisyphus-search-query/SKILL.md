---
name: siyuan-sisyphus-search-query
description: CLI-only playbook for finding and querying SiYuan content with `siyuan-sisyphus`. Use for fulltext search, SQL SELECT queries, backlinks, references, asset search, indexed asset text, and safe find-replace workflows.
---

# SiYuan Sisyphus CLI - Search and Query

Use search commands to locate content, then read the target by path or ID before editing. Add `--json` for scripts and explicit page controls for repeatable output.

## Fulltext Search

```bash
siyuan-sisyphus search fulltext --query "keyword" --page 1 --page-size 20
siyuan-sisyphus search fulltext --query "foo NOT bar" --method-name query --json
siyuan-sisyphus search fulltext --query "pattern" --method-name regex --json
siyuan-sisyphus search fulltext --query "keyword" --parent-id "<doc-id>" --json
siyuan-sisyphus search fulltext --query "keyword" --has-tags --json
siyuan-sisyphus search fulltext --query "keyword" --type-shortcodes h,p --json
```

Common block type shortcodes: `d` document, `h` heading, `p` paragraph, `l` list, `i` list item, `b` blockquote, `c` code block, `m` math block, `t` table, `s` super block, `html`, `embed`, and `av`.

Prefer semantic flags such as `--method-name` and `--sort-by` over numeric fields.

## SQL Queries

SQL is read-only. Always include `LIMIT`.

```bash
siyuan-sisyphus search query-sql --stmt "SELECT id, hpath, content FROM blocks WHERE type = 'p' ORDER BY updated DESC LIMIT 10" --json
siyuan-sisyphus search query-sql --stmt "SELECT id, content FROM blocks_fts WHERE blocks_fts MATCH 'content:keyword' LIMIT 10" --json
siyuan-sisyphus search query-sql --stmt "SELECT root_id, content FROM spans WHERE type = 'tag' AND content = '#project#' LIMIT 20" --json
```

Common tables: `blocks`, `blocks_fts`, `blocks_fts_case_insensitive`, `attributes`, `refs`, `spans`, and `assets`.

Common `blocks` columns: `id`, `parent_id`, `root_id`, `box`, `path`, `hpath`, `name`, `alias`, `memo`, `tag`, `content`, `fcontent`, `markdown`, `length`, `type`, `subtype`, `ial`, `sort`, `created`, and `updated`.

## Backlinks and References

```bash
siyuan-sisyphus search get-backlinks --id "<block-or-doc-id>" --mode both --json
siyuan-sisyphus search get-backlinks --id "<block-or-doc-id>" --keyword "filter" --json
siyuan-sisyphus search search-refs --id "<block-id>" --before-len 512 --json
siyuan-sisyphus search list-invalid-refs --page 1 --page-size 50 --json
```

Use backlinks to understand references before moving or rewriting content.

## Assets and OCR Text

```bash
siyuan-sisyphus search search-assets --query "image" --json
siyuan-sisyphus search search-assets --query "diagram" --exts png,jpg,webp --json
siyuan-sisyphus search fulltext-asset-content --query "text in image" --page 1 --page-size 20 --json
```

For document-specific assets, use:

```bash
siyuan-sisyphus file get-doc-assets --id "<doc-id>" --asset-type image --json
```

## Dynamic Query Blocks

To create a query block inside a document, append Markdown containing the query template:

```bash
siyuan-sisyphus block append --parent-id "<doc-id>" --data-type markdown --data "{{SELECT id, content FROM blocks WHERE content LIKE '%TODO%' LIMIT 20}}"
```

## Find and Replace

`search find-replace` modifies content. Before running it, show the user the exact scope and replacement, then get explicit approval.

```bash
siyuan-sisyphus search find-replace --k "old text" --r "new text" --ids "<doc-id>"
siyuan-sisyphus search find-replace --k "old text" --r "" --ids-json '["<doc-id-1>","<doc-id-2>"]'
```

Safer workflow:

1. Search for candidate blocks.
2. Read the target document or block.
3. Confirm the exact replacement and scope with the user.
4. Run `search find-replace`.
5. Read again to verify.

## Pitfalls

- Recent writes may not appear in search immediately. Retry briefly or read by path/ID.
- SQL must be `SELECT` or `WITH` style read-only queries.
- Add `LIMIT` to every SQL query.
- Permission filtering can reduce results; check notebook permissions before treating missing content as an error.

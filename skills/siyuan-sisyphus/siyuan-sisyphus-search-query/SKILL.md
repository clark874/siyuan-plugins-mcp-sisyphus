---
name: siyuan-sisyphus-search-query
description: CLI-only playbook for finding and querying SiYuan content with siyuan-sisyphus. Use for semantic knowledge discovery, fulltext, read-only SQL, backlinks, references, assets, dynamic query blocks, and safe find-replace.
---

# Search and Query SiYuan with the CLI

## Resolve the CLI entry first

Before the first SiYuan CLI call in every new session, verify that the local command is available:

```bash
command -v siyuan-sisyphus
siyuan-sisyphus --version
```

If the command is missing, resolve a locally installed or user-provided maintained CLI entry before continuing. Do not use `npx` as an implicit fallback. A public npm package may lag the locally maintained plugin and silently omit custom actions or safety contracts.

After resolving the entry, start with the read-only live bootstrap:

```bash
siyuan-sisyphus system bootstrap --json
```

Search to identify candidates, read the target by ID or path, and only then edit. Use explicit pagination for repeatable results.

For a natural-language question on SiYuan 3.8.0+, use `semantic` for low-level candidate discovery and `knowledge` for the LLM Wiki view that collapses reference-only hits, prefers named content atoms, and attaches readable reusing documents. Semantic hits are discovery candidates rather than evidence; always read the returned stable block ID and inspect its source and verification attributes before reuse.

If one of the first three deduplicated `knowledge` results is a named project hub or knowledge atom with a path that clearly matches the task, read that stable target immediately and stop directory-level discovery. Continue with a parent tree, exploratory SQL, or broader fulltext search only when the top candidates are ambiguous, off-topic, or unnamed. Do not render an unfiltered full AV merely to locate a project status row.

`search.check_anchor` is a write-time collision preflight, not a retrieval action. It requires `candidates=[...]` and `candidateKind="name"|"alias"`. A `validation_error` means the preflight did not run; never reinterpret it as an available or missing anchor.

```bash
siyuan-sisyphus search semantic --query 'Which existing notes are relevant to this method?' --page '1' --page-size '30' --json
```
```bash
siyuan-sisyphus search knowledge --query 'How have existing projects reused this method?' --page-size '10' --candidate-size '30' --json
```
```bash
siyuan-sisyphus search fulltext --query 'keyword' --page '1' --page-size '20' --json
```
```bash
siyuan-sisyphus search fulltext --query 'keyword' --parent-id '<doc-id>' --type-shortcodes-json '["h","p"]' --json
```
```bash
siyuan-sisyphus search query-sql --stmt 'SELECT id, hpath, content FROM blocks WHERE type = '"'"'p'"'"' ORDER BY updated DESC LIMIT 10' --json
```
```bash
siyuan-sisyphus search get-backlinks --id '<block-or-doc-id>' --mode 'both' --json
```
```bash
siyuan-sisyphus search search-refs --id '<block-id>' --before-len '512' --json
```
```bash
siyuan-sisyphus search search-assets --query 'diagram' --exts-json '["png","jpg","webp"]' --json
```

SQL must be read-only and must include `LIMIT`. Useful tables include `blocks`, `blocks_fts`, `attributes`, `refs`, `spans`, and `assets`.

## Find and replace

This action mutates content. First search, read each target, show the exact old/new text and IDs, and obtain explicit approval.

```bash
siyuan-sisyphus search find-replace --k 'old text' --r 'new text' --ids-json '["<doc-id>"]' --json
```

Read the changed blocks again. Recent writes can take time to enter the search index; verify a fresh mutation by ID or path rather than assuming an empty search means failure. Use `siyuan-sisyphus help search query-sql` for live SQL action constraints.

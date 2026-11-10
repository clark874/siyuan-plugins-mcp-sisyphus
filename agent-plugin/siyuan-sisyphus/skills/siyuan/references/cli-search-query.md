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

探索性自然语言问题使用 `knowledge(retrievalMode="hybrid", includeContext=true)`，并优先传当前项目的真实存储路径范围。需要精排且思源已配置 TypeSafe 时加 `rerank=true`：只对前10个已授权短候选作一次文本决策请求，失败保留融合排序，检查 rerank.status，不将分数当作证据审核结果。默认 auto 保留原有低成本精确入口；semantic 模式跳过关键词预检，但唯一名称直达及名称歧义保护仍生效。诊断纯语义基线可同时设 namespaceMode="off"。

includeContext 最多补齐前20项的标题与同级相邻块；检查 contextStatus 和 context.complete。关键词与语义各有候选数量、融合来源与降级诊断，不能把融合数量称作向量召回数。语义请求等待上限15秒，超时不重放。精确跨行搜索使用 `fs.search(matchScope="block"|"document")` 与显式 `[\s\S]`，document 仅处理指定单文档；完整性上限拒绝不得解释成无命中。

For a natural-language question, use `knowledge` as the LLM Wiki entry point. It first probes the readable controlled namespace: one exact `name`/`alias` returns locally; multiple exact targets return an explicit ambiguity unless `activeScopes` resolves exactly one; unique contained anchors seed semantic retrieval. Only unresolved queries use the SiYuan 3.8 embedding provider. Use `semantic` only for low-level candidate inspection. Exact namespace matches are deterministic retrieval rather than automatic evidence approval; always read the stable block ID and inspect source and verification attributes before reuse.

If one of the first three deduplicated `knowledge` results is a named project hub or knowledge atom with a path that clearly matches the task, read that stable target immediately and stop directory-level discovery. Continue with a parent tree, exploratory SQL, or broader fulltext search only when the top candidates are ambiguous, off-topic, or unnamed. Do not render an unfiltered full AV merely to locate a project status row.

`search.check_anchor` is a write-time collision preflight, not a retrieval action. It requires `candidates=[...]` and `candidateKind="name"|"alias"`. A `validation_error` means the preflight did not run; never reinterpret it as an available or missing anchor.

```bash
siyuan-sisyphus search semantic --query 'Which existing notes are relevant to this method?' --page '1' --page-size '30' --json
```
```bash
siyuan-sisyphus search knowledge --query 'How have existing projects reused this method?' --retrieval-mode 'hybrid' --include-context --page-size '10' --candidate-size '30' --active-scopes-json '["<current-topic-scope>"]' --json
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
SQL must be read-only and must include `LIMIT`. Useful tables include `blocks`, `blocks_fts`, `attributes`, `refs`, `spans`, and `assets`.

## Find and replace

This action mutates content. First search, read each target, show the exact old/new text and IDs, and obtain explicit approval.

```bash
siyuan-sisyphus search find-replace --k 'old text' --r 'new text' --ids-json '["<doc-id>"]' --json
```

Read the changed blocks again. Recent writes can take time to enter the search index; verify a fresh mutation by ID or path rather than assuming an empty search means failure. Use `siyuan-sisyphus help search query-sql` for live SQL action constraints.

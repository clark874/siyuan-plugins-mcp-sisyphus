---
name: siyuan-mcp-search-query
description: MCP playbook for retrieving existing SiYuan content. Use for semantic discovery, fulltext, read-only SQL, backlinks, references, and safe find-replace. Do not use check_anchor to retrieve existing content; it is only a pre-write name/alias collision check.
compatibility: "优先使用已连接的 SiYuan Sisyphus MCP；无 MCP 时按随包 CLI 后备规程使用已有本机入口。技能安装与 MCP 连接配置分别回验。"
---

# Search and Query SiYuan with MCP

Search to identify candidates, read the target by ID or path, and only then edit. Use explicit pagination for repeatable results.

探索性自然语言问题使用 `knowledge(retrievalMode="hybrid", includeContext=true)`，并优先传当前项目的真实存储路径范围。需要精排且思源已配置 TypeSafe 时加 `rerank=true`：只对前10个已授权短候选作一次文本决策请求，失败保留融合排序，检查 rerank.status，不将分数当作证据审核结果。默认 auto 保留原有低成本精确入口；semantic 模式跳过关键词预检，但唯一名称直达及名称歧义保护仍生效。诊断纯语义基线可同时设 namespaceMode="off"。

includeContext 最多补齐前20项的标题与同级相邻块；检查 contextStatus 和 context.complete。关键词与语义各有候选数量、融合来源与降级诊断，不能把融合数量称作向量召回数。语义请求等待上限15秒，超时不重放。精确跨行搜索使用 `fs.search(matchScope="block"|"document")` 与显式 `[\s\S]`，document 仅处理指定单文档；完整性上限拒绝不得解释成无命中。

For a natural-language question, use `knowledge` as the LLM Wiki entry point. It first probes the readable controlled namespace: one exact `name`/`alias` returns locally; multiple exact targets return an explicit ambiguity unless `activeScopes` resolves exactly one; unique contained anchors seed semantic retrieval. Only unresolved queries use the SiYuan 3.8 embedding provider. Use `semantic` only for low-level candidate inspection. Exact namespace matches are deterministic retrieval rather than automatic evidence approval; always read the stable block ID and inspect source and verification attributes before reuse.

If one of the first three deduplicated `knowledge` results is a named project hub or knowledge atom with a path that clearly matches the task, read that stable target immediately and stop directory-level discovery. Continue with a parent tree, exploratory SQL, or broader fulltext search only when the top candidates are ambiguous, off-topic, or unnamed. Do not render an unfiltered full AV merely to locate a project status row.

`search.check_anchor` is a write-time collision preflight, not a retrieval action. It requires `candidates=[...]` and `candidateKind="name"|"alias"`. A `validation_error` means the preflight did not run; never reinterpret it as an available or missing anchor.

```text
search(action="semantic", query="Which existing notes are relevant to this method?", page=1, pageSize=30)
```
```text
search(action="knowledge", query="How have existing projects reused this method?", retrievalMode="hybrid", includeContext=true, pageSize=10, candidateSize=30, activeScopes=["<current-topic-scope>"])
```
```text
search(action="fulltext", query="keyword", page=1, pageSize=20)
```
```text
search(action="fulltext", query="keyword", parentId="<doc-id>", typeShortcodes=["h","p"])
```
```text
search(action="query_sql", stmt="SELECT id, hpath, content FROM blocks WHERE type = 'p' ORDER BY updated DESC LIMIT 10")
```
```text
search(action="get_backlinks", id="<block-or-doc-id>", mode="both")
```
```text
search(action="search_refs", id="<block-id>", beforeLen=512)
```
SQL must be read-only and must include `LIMIT`. Useful tables include `blocks`, `blocks_fts`, `attributes`, `refs`, `spans`, and `assets`.

## Find and replace

This action mutates content. First search, read each target, show the exact old/new text and IDs, and obtain explicit approval.

```text
search(action="find_replace", k="old text", r="new text", ids=["<doc-id>"])
```

Read the changed blocks again. Recent writes can take time to enter the search index; verify a fresh mutation by ID or path rather than assuming an empty search means failure. Use `siyuan://help/action/search/query_sql` for live SQL action constraints.

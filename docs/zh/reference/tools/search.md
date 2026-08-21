# search 工具

这个工具覆盖语义知识发现、全文搜索、反链、SQL 只读查询、资源搜索，以及受控查找替换。

适用场景：你需要跨工作区查找内容，或查询索引内容。

相关页面：

- [权限模型](../permissions.md)
- [错误类型](../error-types.md)

## 常见动作

| 分组 | 动作 |
|------|---------|
| 语义检索与知识锚点 | `semantic`, `knowledge`, `check_anchor` |
| 文本搜索 | `fulltext`, `search_refs` |
| 图谱 / 引用关系 | `get_backlinks`, `list_invalid_refs` |
| SQL / 资源 | `query_sql`, `search_assets`, `fulltext_asset_content` |
| 修改类 | `find_replace` |

## 安全规则

- `find_replace` 是本工具唯一的修改类操作，需要显式确认。
- `query_sql` 是只读操作，只接受 `SELECT` 语句；请自行添加 `LIMIT`。`maxRows` 控制权限过滤后的返回窗口，默认 200、最大 1000。
- 任意 SQL 都可以伪造或隐藏结果来源，因此 `query_sql` 只在全部笔记本均可读时开放。只要有任一笔记本权限为 `none`，MCP 就会在执行前保守拒绝，并提示改用带范围约束的搜索或数据库动作。全部笔记本可读时，聚合、分组、CTE 和普通结果都不再逐行查询归属。
- 搜索结果会在适用时按笔记本权限过滤。
- `semantic` 需要思源 3.8.0+ 并配置嵌入模型；查询会发送给模型提供商，可能产生费用。`knowledge` 则先探测当前权限范围内的受控命名空间：唯一精确 `name`/`alias` 在本地直接返回，不发生嵌入调用或数据外发；精确多命中必须显式返回歧义，只有 `activeScopes` 与恰好一个目标相交时才自动解析；正文中包含的唯一锚点只作为语义检索种子。
- 只有命名空间未解决的文本才进入思源 3.8 嵌入索引。语义分支继续执行引用折叠、命名原子优先和关联文档扩展。命名空间结果会附带已有的验证状态与脱敏来源元数据；确定性命中不等于证据自动获准，仍须按稳定块 ID 回读。`namespaceMode="off"` 仅供检索评测基线使用。
- `check_anchor` 是服务端生成的只读命名空间审计：统一规范化精确 `name`/`alias` 词元、过滤不可读块，并返回全部命中目标及其 `custom-anchor-scope`。规范 `name` 应保持唯一；alias 多命中只报告、不得静默选择，只有 `activeScopes` 与恰好一个候选相交时才自动解析。
- 每次 `check_anchor` 最多提交 10 个候选词元；每个候选最多返回 10 个目标详情，同时保留完整 `targetCount`、截断标记和后续审计提示，避免历史大冲突撑破客户端输出。
- 语义命中只用于发现候选，不等于证据。复用前必须按返回的稳定块 ID 读取原文，并检查来源与验证属性。
- 全文搜索可能略滞后于刚写入的内容，因为索引是最终一致的。

## 示例

MCP：

```json
{
  "action": "knowledge",
  "query": "既有项目如何复用这一分析方法？",
  "pageSize": 10,
  "candidateSize": 30
}
```

唯一精确别名可完全在本地解析：

```json
{
  "action": "knowledge",
  "query": "水论文",
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

CLI：

```bash
siyuan search knowledge --query "既有项目如何复用这一分析方法？" --page-size 10 --candidate-size 30
siyuan search fulltext --query "meeting notes" --method-name keyword --sort-by relevance
siyuan search query-sql --sql "SELECT id, content, type FROM blocks LIMIT 10"
```

给 AI 调用方的提示：

- 优先使用 `methodName`、`sortBy`、`query`、`sql` 等语义别名，少用数字型 `method` / `orderBy` 或 `k` 这类短字段。
- `fulltext` 默认返回 `plainContent` 和 `excerpt`，不需要仅为了纯文本而设置 `stripHtml=true`。
- 涉及 `parentId`、`hasTags` 或权限过滤时，`kernel*` 元数据描述思源原始搜索页，`returned*` 元数据描述当前响应中的过滤后数据。

## 动作列表

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

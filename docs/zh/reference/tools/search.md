# search 工具

这个工具覆盖语义知识发现、全文搜索、反链、SQL 只读查询、资源搜索，以及受控查找替换。

适用场景：你需要跨工作区查找内容，或查询索引内容。

相关页面：

- [权限模型](../permissions.md)
- [错误类型](../error-types.md)

## 常见动作

| 分组 | 动作 |
|------|---------|
| 语义检索 | `semantic`, `knowledge` |
| 文本搜索 | `fulltext`, `search_refs` |
| 图谱 / 引用关系 | `get_backlinks`, `list_invalid_refs` |
| SQL / 资源 | `query_sql`, `search_assets`, `fulltext_asset_content` |
| 修改类 | `find_replace` |

## 安全规则

- `find_replace` 是本工具唯一的修改类操作，需要显式确认。
- `query_sql` 是只读操作，只接受 `SELECT` 语句；请自行添加 `LIMIT`。`maxRows` 控制权限过滤后的返回窗口，默认 200、最大 1000。
- 任意 SQL 都可以伪造或隐藏结果来源，因此 `query_sql` 只在全部笔记本均可读时开放。只要有任一笔记本权限为 `none`，MCP 就会在执行前保守拒绝，并提示改用带范围约束的搜索或数据库动作。全部笔记本可读时，聚合、分组、CTE 和普通结果都不再逐行查询归属。
- 搜索结果会在适用时按笔记本权限过滤。
- `semantic` 与 `knowledge` 均需要思源 3.8.0+，并且已经配置嵌入模型。自然语言查询会发送给该模型提供商，可能产生费用。
- `semantic` 是低层候选检索，基本保留思源原生语义命中；`knowledge` 是 LLM Wiki 编排入口，会先过滤权限，再把仅含块引用的命中折叠到目标块，优先返回具有 `name` 的内容原子，并附带引用该原子的可读文档。
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
- `query_sql`
- `get_backlinks`
- `search_refs`
- `find_replace`
- `search_assets`
- `fulltext_asset_content`
- `list_invalid_refs`

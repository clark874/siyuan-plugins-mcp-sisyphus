# search

这个工具覆盖全文搜索、反链、SQL 只读查询、资源搜索，以及受控的查找替换操作。

适用场景：你需要在整个工作区查找内容，或者查询已索引的数据。

相关页面：

- [权限模型](../permissions.md)
- [错误类型](../error-types.md)

## 常见 Action

| 分组 | Actions |
|------|---------|
| 文本搜索 | `fulltext`, `search_tag`, `search_refs` |
| 图谱 / 引用关系 | `get_backlinks`, `get_backmentions`, `list_invalid_refs` |
| SQL / 资源 | `query_sql`, `search_assets`, `get_asset_content`, `fulltext_asset_content` |
| 修改类 | `find_replace` |

## 安全规则

- `find_replace` 是这个工具里的写操作特例，调用前仍需要显式确认
- `query_sql` 仅允许只读 `SELECT` / `WITH`
- 适用时，搜索结果会受笔记本权限过滤
- 刚写入的内容在全文索引和标签索引中可能会有短暂延迟

## 示例

MCP：

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
siyuan search fulltext --query "meeting notes" --method-name keyword --sort-by relevance
siyuan search query-sql --sql "SELECT id, content, type FROM blocks LIMIT 10"
```

给 AI 调用方的提示：

- 优先使用语义化别名参数：`methodName`、`sortBy`、`query`、`sql`，尽量不要直接用数字型 `method` / `orderBy` 或简写字段 `k`。
- `fulltext` 现在默认返回 `plainContent` 和 `excerpt`，仅仅为了拿纯文本内容时不再需要 `stripHtml=true`。
- 当使用 `parentId`、`hasTags`，或者结果经过权限过滤时，`kernel*` 元数据表示思源原始搜索页，`returned*` 元数据表示当前响应里后过滤后的数据窗口。

## Action 列表

- `fulltext`
- `query_sql`
- `search_tag`
- `get_backlinks`
- `get_backmentions`
- `search_refs`
- `find_replace`
- `search_assets`
- `get_asset_content`
- `fulltext_asset_content`
- `list_invalid_refs`

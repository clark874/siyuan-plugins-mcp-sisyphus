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

- `find_replace` 需要显式确认
- `query_sql` 仅允许只读 `SELECT` / `WITH`
- 适用时，搜索结果会受笔记本权限过滤

## 示例

MCP：

```json
{
  "action": "fulltext",
  "query": "meeting notes"
}
```

```json
{
  "action": "query_sql",
  "stmt": "SELECT * FROM blocks LIMIT 10"
}
```

CLI：

```bash
siyuan search fulltext --query "meeting notes"
siyuan search query-sql --stmt "SELECT * FROM blocks LIMIT 10"
```

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

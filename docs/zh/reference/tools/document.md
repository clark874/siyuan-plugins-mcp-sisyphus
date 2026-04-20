# document

这个工具覆盖文档 CRUD、树结构查询，以及与日记/转换相关的文档操作。

适用场景：你需要创建、移动、查询或转换文档。

相关页面：

- [路径语义](../path-semantics.md)
- [权限模型](../permissions.md)

## 常见 Action

| 分组 | Actions |
|------|---------|
| 创建与读取 | `create`, `create_empty`, `get_doc`, `get_path`, `get_hpath`, `get_ids` |
| 树结构查询 | `get_child_blocks`, `get_child_docs`, `list_tree`, `search_docs` |
| 修改 | `rename`, `move`, `remove`, `remove_batch`, `duplicate` |
| 展示 | `set_icon`, `set_cover` |
| 日记 / 转换 | `create_daily_note`, `heading_to_doc`, `doc_to_heading` |

## 参数与语义

- `create` 和 `create_empty` 使用人类可读 `path`
- `rename`、`remove`、`move` 在非 ID 模式下通常需要存储路径
- `move` 同时支持 ID 模式和路径模式
- `set_cover` 省略 `source` 时表示清空封面

## 安全规则

- `remove`、`move`、`remove_batch` 都需要显式确认
- 按路径修改前先确认路径类型

## 示例

MCP：

```json
{
  "action": "create",
  "notebook": "<notebook-id>",
  "path": "/Inbox/Weekly Note",
  "markdown": "# Weekly Report"
}
```

```json
{
  "action": "get_path",
  "id": "<doc-id>"
}
```

CLI：

```bash
siyuan document create --notebook <notebook-id> --path "/Inbox/Weekly Note" --markdown "# Weekly Report"
siyuan document get-path --id <doc-id>
```

## Action 列表

- `create`
- `rename`
- `remove`
- `move`
- `get_path`
- `get_hpath`
- `get_ids`
- `get_child_blocks`
- `get_child_docs`
- `set_icon`
- `set_cover`
- `list_tree`
- `search_docs`
- `get_doc`
- `create_daily_note`
- `duplicate`
- `remove_batch`
- `create_empty`
- `heading_to_doc`
- `doc_to_heading`

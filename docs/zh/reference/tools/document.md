# document 工具

这个工具覆盖文档 CRUD、树结构查询、元数据，以及与日记/转换相关的文档操作。

适用场景：你需要创建、移动、查询或转换文档。

相关页面：

- [路径语义](../path-semantics.md)
- [权限模型](../permissions.md)

## 常见动作

| 分组 | 动作 |
|------|---------|
| 创建与读取 | `create`, `lookup`, `get_doc` |
| 树结构查询 | `get_child_blocks`, `get_child_docs`, `list_tree`, `search_docs` |
| 元数据与修改 | `rename`, `move`, `remove`, `set_attr`, `duplicate` |
| 日记 / 转换 | `create_daily_note`, `heading_to_doc`, `doc_to_heading` |

## 参数与语义

- `create` 支持人类可读 `path`，也支持 `parentPath` + `title`；省略 `markdown` 即创建空文档。创建子文档时优先使用 `path`。`parentPath` + `title` 可传人类可读父路径，也可传 `lookup` 返回的 `.sy` 结尾 storage path。
- `lookup` 可按 `id`、存储 `path`、人类可读 `hpath` / `hPath` 查找；用 `include` 请求 `id`、`ids`、`path`、`hpath` 或 `docInfo`。
- `rename`、`remove`、`move` 在非 ID 模式下通常需要存储路径。
- `get_child_docs` 必须传文档 `id`，不接受 `notebook + path`。
- `list_tree` 使用 `notebook + path`，其中 `path` 是 `/` 或 `/20240318112233-abc123.sy` 这类存储路径，不是人类可读路径。
- 如果批量 `remove` 遇到思源短暂的 `indexing` 窗口，请改用 `notebook + storage path` 逐个删除并重试。
- `set_attr` 按文档 ID 写入文档元数据属性。

## 安全规则

- `remove`、`move` 需要显式确认。
- 按路径修改前先确认路径类型。

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
  "action": "lookup",
  "id": "<doc-id>",
  "include": "path"
}
```

CLI：

```bash
siyuan document create --notebook <notebook-id> --path "/Inbox/Weekly Note" --markdown "# Weekly Report"
siyuan document lookup --id <doc-id> --include path
```

## 动作列表

- `create`
- `lookup`
- `rename`
- `remove`
- `move`
- `get_child_blocks`
- `get_child_docs`
- `set_attr`
- `list_tree`
- `search_docs`
- `get_doc`
- `create_daily_note`
- `duplicate`
- `heading_to_doc`
- `doc_to_heading`

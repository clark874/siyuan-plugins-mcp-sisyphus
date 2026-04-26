# av

这个工具覆盖属性视图和数据库风格的操作。

适用场景：你需要读取或修改真实的 SiYuan 属性视图，而不是 Markdown 表格。

相关页面：

- [常见任务](../common-tasks.md)
- [权限模型](../permissions.md)

## 常见 Action

| 分组 | Actions |
|------|---------|
| 读取 | `get`, `render_attribute_view`, `get_attribute_view_keys`, `get_attribute_view_filter_sort`, `search`, `get_primary_key_values` |
| 行操作 | `add_rows`, `remove_rows` |
| 列操作 | `add_column`, `remove_column` |
| 单元格更新 | `set_cells` |
| 结构 | `duplicate_block` |

## 参数与语义

- `render_attribute_view` 在 `createIfNotExist=true` 时也可创建并实体化 AV
- `set_cells` 的字段结构由 `valueType` 决定，可传单格字段或 `cells` 数组
- `rowID` 指的是行项目 ID，不是源 block ID

## 安全规则

- 这些操作是真实数据库操作，不是 Markdown 表格编辑
- 需要结构化数据时优先使用 `av`，不要用 Markdown 伪装数据库

## 示例

MCP：

```json
{
  "action": "get",
  "id": "<attribute-view-id>"
}
```

```json
{
  "action": "add_column",
  "avID": "<attribute-view-id>",
  "keyName": "Status",
  "keyType": "select"
}
```

CLI：

```bash
siyuan av get --id <attribute-view-id>
siyuan av add-column --av-id <attribute-view-id> --key-name Status --key-type select
siyuan av add-rows --av-id <attribute-view-id> --block-ids <block-id>
siyuan av add-rows --av-id <attribute-view-id> --primary-key-texts "纯文本行"
```

## Action 列表

- `get`
- `render_attribute_view`
- `get_attribute_view_keys`
- `get_attribute_view_filter_sort`
- `search`
- `add_rows`
- `remove_rows`
- `add_column`
- `remove_column`
- `set_cells`
- `duplicate_block`
- `get_primary_key_values`

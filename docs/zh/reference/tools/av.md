# av

这个工具覆盖属性视图与数据库式操作。

适用场景：你需要查看或修改真实的思源属性视图，而不是用 Markdown 表格模拟数据库。

相关页面：

- [常见任务](../common-tasks.md)
- [权限模型](../permissions.md)

## 常见 Action

| 分组 | Actions |
|------|---------|
| 读取 | `get`, `render`, `get_attribute_view_keys`, `get_attribute_view_filter_sort`, `search`, `get_primary_key_values` |
| 行操作 | `add_rows`, `remove_rows` |
| 列操作 | `add_column`, `remove_column` |
| 单元格更新 | `set_cells` |
| 结构 | `duplicate` |

## 参数与语义

- `render` 在 `createIfNotExist=true` 且传入 `blockID` 时，也可创建并实体化 AV。
- 保留 `render(createIfNotExist=true)` 返回的 `blockID`。如果新建空 AV 后仅用 `avID` 读取或写入时报权限范围无法解析，请在后续 AV 读写中显式传入该 `blockID`，直到 AV 有行数据或 mirror 注册完成。
- `set_cells` 由 `valueType` 决定值类型，既支持单格字段，也支持 `cells` / `items` 数组。
- `rowID` 指行 item ID，不是源块 ID。
- `duplicate` 会复制属性视图定义，也可通过 `previousID` 指定复制出的数据库块插入位置。

## 安全规则

- AV 操作是真实数据库操作，不是 Markdown 表格编辑。
- 结构化数据应使用 `av`，不要在 Markdown 中模拟数据库行为。

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
siyuan av add-rows --av-id <attribute-view-id> --primary-key-texts "Plain text row"
```

## Action 列表

- `get`
- `render`
- `get_attribute_view_keys`
- `get_attribute_view_filter_sort`
- `search`
- `add_rows`
- `remove_rows`
- `add_column`
- `remove_column`
- `set_cells`
- `duplicate`
- `get_primary_key_values`

# block 工具

这个工具覆盖块插入、块更新、块移动、元数据、引用与文档上下文辅助操作。

适用场景：你需要直接操作块内容，而不是在整篇文档级别工作。

相关页面：

- [权限模型](../permissions.md)
- [document 工具](./document.md)

## 常见动作

| 分组 | 动作 |
|------|---------|
| 插入与更新 | `insert`, `prepend`, `append`, `update` |
| 移动与结构 | `move`, `set_fold_state`, `get_children`, `breadcrumb` |
| 元数据 | `set_attrs`, `get_attrs`, `info`, `dom`, `get_kramdown` |
| 引用 / 工具类 | `transfer_references`, `word_count`, `recent_updated` |
| 日记辅助 | `add_to_daily_note` |
| 文档上下文 | `docs_info` |

## 参数与语义

- `dataType` 通常是 `markdown` 或 `dom`。
- `prepend` 和 `append` 既可以作用于文档，也可以作用于块的子列表。
- `update` 更适合单块替换。
- `move` 至少需要一个目标定位字段，例如 `parentID` 或 `previousID`。
- `add_to_daily_note` 通过 `position` 把内容追加或前置到当天日记。

## 安全规则

- `delete` 和 `move` 需要显式确认。
- 多行内容优先使用 `append`、`prepend` 或 `insert`，不要滥用 `update`。

## 示例

MCP：

```json
{
  "action": "append",
  "parentID": "<doc-id>",
  "dataType": "markdown",
  "data": "- [ ] Todo item"
}
```

CLI：

```bash
siyuan block append --parent-id <doc-id> --data-type markdown --data "- [ ] Todo item"
```

## 动作列表

- `insert`
- `prepend`
- `append`
- `update`
- `delete`
- `move`
- `set_fold_state`
- `get_kramdown`
- `get_children`
- `transfer_references`
- `set_attrs`
- `get_attrs`
- `info`
- `breadcrumb`
- `dom`
- `recent_updated`
- `word_count`
- `add_to_daily_note`
- `docs_info`

# tag

这个工具覆盖全工作区标签的查看与修改。

适用场景：你需要检查、重命名或删除整个工作区里的标签。

相关页面：

- [权限模型](../permissions.md)

## Actions

| Action | 必填字段 | 说明 |
|--------|----------|------|
| `list` | 无 | 可选排序和列表控制参数 |
| `rename` | `oldLabel`, `newLabel` | 全局重命名 |
| `remove` | `label` | 需要确认 |

## 说明

- 标签是 Markdown 内联语义，不是块属性
- 没有单独的创建 action；通过在内容里写 `#tag#` 创建

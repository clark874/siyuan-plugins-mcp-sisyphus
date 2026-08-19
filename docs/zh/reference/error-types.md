# 错误类型

这个页面列出 MCP 服务返回的常见高层错误分类。

适用场景：调用失败后，你需要快速判断问题出在参数、权限还是运行时环境。

相关页面：

- [权限模型](./permissions.md)
- [故障排查](../getting-started/troubleshooting.md)

| 错误类型 | 含义 |
|----------|------|
| `validation_error` | 参数无效或缺少必填字段 |
| `not_found` | 块、文档、笔记本或数据库不存在；具体资源类型见 `error.code` |
| `permission_denied` | 笔记本权限不允许当前操作 |
| `api_error` | 思源 API 返回错误 |
| `internal_error` | MCP 服务内部失败 |
| `action_disabled` | 工具或 action 在配置中被禁用 |

## 排查顺序

1. 先检查必填字段、ID 和路径类型
2. 对 `not_found` 按 `error.code` 与提示重新定位资源
3. 再检查笔记本权限
4. 再检查思源连通性和 token 配置
5. 最后检查 action 是否被禁用或受限

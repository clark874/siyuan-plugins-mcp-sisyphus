# 错误类型

这个页面列出 MCP 服务返回的常见高层错误分类。

适用场景：调用失败后，你需要快速判断问题出在参数、权限还是运行时环境。

相关页面：

- [权限模型](./permissions.md)
- [故障排查](../getting-started/troubleshooting.md)

| 错误类型 | 含义 |
|----------|------|
| `validation_error` | 参数无效或缺少必填字段 |
| `invalid_arguments` | action 有效，但 ID、路径或字段组合不兼容 |
| `invalid_path` | 工作区路径或存储路径无法安全解析 |
| `not_found` | 块、文档、笔记本或数据库不存在；具体资源类型见 `error.code` |
| `permission_denied` | 笔记本权限不允许当前操作 |
| `api_error` | 思源 API 返回错误 |
| `internal_error` | MCP 服务内部失败 |
| `action_disabled` | 工具或 action 在配置中被禁用 |

严格写入拒绝还会保留稳定的 `error.code`。执行前、Agent 可自行修正的
`precondition_required`、`invalid_request_id`、`request_id_expired`、
`preflight_lease_invalid` 等错误使用 `type: validation_error`；写入竞态和
结果不确定分别使用 `state_changed`、`readback_mismatch`、
`outcome_unknown` 等硬错误类型，绝不进入软化通道。

## 排查顺序

1. 先检查必填字段、ID 和路径类型
2. 对 `not_found` 按 `error.code` 与提示重新定位资源
3. 再检查笔记本权限
4. 再检查思源连通性和 token 配置
5. 最后检查 action 是否被禁用或受限

## 内核连接与写入恢复

- `kernel_timeout`：请求超过时限，不能据此断言内核离线。读请求不自动重放超时调用；先缩小范围，再用 `system.get_current_time` 核对连接。
- `kernel_http_error`：接口已返回 HTTP 状态码，应检查认证、地址和服务端错误。
- `kernel_unreachable`：连接拒绝、地址解析或网络连接失败；需要重启时由用户执行。
- 严格写入的 `transactionState=unknown`：该请求编号已登记，必须先回读目标确认实际效果，禁止直接换编号重试。确认仍需补写后重新预检，使用新签发的 `issuedRequestId`。已提交操作的同参重放仍返回账本结果，不会再次执行。

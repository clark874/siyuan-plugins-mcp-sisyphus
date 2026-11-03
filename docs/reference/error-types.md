# Error Types

This page lists common high-level error categories returned by the MCP server.

When to read this page: a call failed and you need to classify whether the problem is in parameters, permissions, or runtime behavior.

Related pages:

- [Permissions](./permissions.md)
- [Troubleshooting](../getting-started/troubleshooting.md)

| Error Type | Meaning |
|------------|---------|
| `validation_error` | Invalid parameters or missing required fields |
| `invalid_arguments` | A valid action received an incompatible ID, path, or field combination |
| `invalid_path` | A workspace or storage path cannot be resolved safely |
| `not_found` | A block, document, notebook, or attribute view does not exist; inspect `error.code` for the resource kind |
| `permission_denied` | Notebook permission does not allow the operation |
| `api_error` | SiYuan API returned an error |
| `internal_error` | MCP server internal failure |
| `action_disabled` | Tool or action is disabled in config |

Strict-write rejections also include a stable `error.code`. Before execution,
agent-correctable codes such as `precondition_required`, `invalid_request_id`,
`request_id_expired`, and `preflight_lease_invalid` use
`type: validation_error`. Write races and uncertain outcomes use hard types such
as `state_changed`, `readback_mismatch`, or `outcome_unknown` and are never
softened.

## Triage Order

1. Check required fields, IDs, and path type
2. For `not_found`, use the detailed `error.code` and hint to resolve the resource again
3. Check notebook permission
4. Check SiYuan connectivity and token configuration
5. Check whether the action is disabled or gated

## 内核连接与写入恢复

- `kernel_timeout`：请求超过时限，不能据此断言内核离线。读请求不自动重放超时调用；先缩小范围，再用 `system.get_current_time` 核对连接。
- `kernel_http_error`：接口已返回 HTTP 状态码，应检查认证、地址和服务端错误。
- `kernel_unreachable`：连接拒绝、地址解析或网络连接失败；需要重启时由用户执行。
- 严格写入的 `transactionState=unknown`：该请求编号已登记，必须先回读目标确认实际效果，禁止直接换编号重试。确认仍需补写后重新预检，使用新签发的 `issuedRequestId`。已提交操作的同参重放仍返回账本结果，不会再次执行。

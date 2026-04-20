# system

这个工具覆盖系统信息、配置读取、通知，以及环境相关查询。

适用场景：你需要查看版本、当前时间、系统配置，或者向前端推送通知。

相关页面：

- [权限模型](../permissions.md)
- [Troubleshooting](../../getting-started/troubleshooting.md)

## Actions

| 分组 | Actions |
|------|---------|
| 通知 | `push_msg`, `push_err_msg` |
| 基础信息 | `get_version`, `get_current_time`, `boot_progress` |
| 环境 | `workspace_info`, `network`, `changelog` |
| 配置读取 | `conf`, `sys_fonts` |

## 安全规则

- `workspace_info` 属于高风险操作，因为会暴露工作区绝对路径

## 说明

- `conf` 支持 summary-first 的配置读取方式，以及通过 `keyPath` 读取子树
- `sys_fonts` 支持摘要模式和分页列表模式

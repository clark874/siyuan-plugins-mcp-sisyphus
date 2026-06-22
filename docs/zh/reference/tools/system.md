# system 工具

这个工具覆盖思源系统读取、网络状态、配置读取、用户通知与主动触发同步。

适用场景：你需要运行时状态，而不是笔记本或文档内容。

相关页面：

- [权限模型](../permissions.md)

## 动作

| 分组 | 动作 |
|------|---------|
| 基础信息 | `get_version`, `get_current_time`, `changelog` |
| 配置 / 环境 | `conf`, `network`, `workspace_info` |
| 通知 | `notify` |
| 同步 | `perform_sync` |

## 安全规则

- `workspace_info` 属于高风险操作，因为会暴露工作区绝对路径，需要确认。
- `conf` 是只读操作。用 `mode="summary"` 获取紧凑概览，或用 `mode="get"` + `keyPath` 读取具体字段。
- `changelog` 是只读操作。插件升级后可传 `fromVersion` 查看更新内容，并识别可能影响用户规则、`/AGENTS.md` 记忆、权限、外观、连接片段、时间线设置或工具配置的变更。
- `notify` 通过 `msg`、`level` 和可选 `timeout` 显示思源通知。
- `perform_sync` 会通过 `/api/sync/performSync` 立即触发思源同步。该动作需要确认后执行。

## 动作列表

- `workspace_info`
- `network`
- `conf`
- `notify`
- `changelog`
- `perform_sync`
- `get_version`
- `get_current_time`

# system 工具

这个工具覆盖思源系统读取、网络状态、配置读取、用户通知与主动触发同步。

适用场景：你需要运行时状态，而不是笔记本或文档内容。

相关页面：

- [权限模型](../permissions.md)

## 动作

| 分组 | 动作 |
|------|---------|
| 基础信息 | `bootstrap`, `get_version`, `get_current_time`, `changelog` |
| 配置 / 环境 | `conf`, `network`, `workspace_info`, `audit_environment`, `list_packages` |
| 通知 | `notify` |
| 同步 | `perform_sync` |

## 安全规则

- `bootstrap` 是新 Agent 的首选调用。它会刷新笔记本权限，隐藏权限为 `none` 的笔记本身份，并从当前 MCP 工具配置生成能力和后续调用。存在 `/AGENTS.md` 且 `fs.read` 已启用时，读取该路由记忆位于 `nextCalls` 首位；若 `fs.read` 被禁用，只返回记忆状态与提示，不生成不可执行调用。`memory.status` 仅按保存时间判断，`contentVerified=false` 明确表示路径、数量和项目状态仍需实时核验。`operation.readOnly=true` 只表示本动作不写入；连接仍可能依据权限和 action 配置开放写入。若 `toolConfiguration.current=false`，能力摘要来自默认退化配置，不应视为实时健康检查。
- `workspace_info` 属于高风险操作，因为会暴露工作区绝对路径，需要确认。
- `conf` 是只读操作。用 `mode="summary"` 获取紧凑概览，或用 `mode="get"` + `keyPath` 读取具体字段。
- `changelog` 是只读操作。插件升级后可传 `fromVersion` 查看更新内容，并识别可能影响用户规则、`/AGENTS.md` 记忆、权限、外观、连接片段、时间线设置或工具配置的变更。
- `audit_environment` 是只读操作，返回脱敏配置概览、各类已安装扩展包数量及插件状态统计。
- `list_packages` 是只读操作，分页返回已安装扩展包的精简元数据，不读取第三方插件配置文件。
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
- `bootstrap`
- `audit_environment`
- `list_packages`

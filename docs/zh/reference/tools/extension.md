# `extension`

`extension` 用于桥接思源 3.7.0 起由其他内核插件通过官方 MCP 端点注册的工具。

## 发现工具

```json
{
  "action": "list",
  "refresh": true
}
```

响应会给出官方 MCP 连接状态、发现和暴露数量、schema 体积、只读声明、影响范围、降级 schema，以及在 Sisyphus 设置中被屏蔽的工具。

只接收 `source="plugin"` 的工具。思源原生工具、从外部 MCP Server 导入的工具以及本插件自身命名空间都会被排除。

## 调用插件工具

官方完整工具名直接成为 action，下游参数统一放在 `arguments` 中：

```json
{
  "action": "plugin__example_plugin__search",
  "arguments": {
    "action": "query",
    "keyword": "MCP"
  }
}
```

嵌套结构可以避免下游插件工具自身也有 `action` 参数时发生冲突。对应 CLI 调用为：

```bash
siyuan extension plugin__example_plugin__search \
  --arguments-json '{"action":"query","keyword":"MCP"}'
```

## 安全与生命周期

- 未声明 `readOnlyHint=true` 的工具，调用前必须取得用户明确确认。
- 插件工具调用只发送一次，绝不自动重试；发送后发生传输错误时会报告“执行状态未知”。
- 工具发现属于只读操作，会话失效时允许重连并重试一次。
- 刷新失败时保留最后一次成功缓存。
- 外层 `tools/list` 会刷新发现结果；`extension(action="list", refresh=true)` 可显式刷新，并在 action 集合变化时发送工具列表变更通知。
- 设置页提供总开关和按工具屏蔽。

官方发现需要思源 3.7.0 或更高版本、管理员会话和有效 API Token。

## 官方 MCP 与 Sisyphus 的关系

| 关注点 | 思源官方 MCP | Sisyphus |
|---|---|---|
| 注册方式 | 插件分别注册独立工具 | 按工具类别和 action 聚合 |
| 命名空间 | `plugin__<plugin>__<tool>` | 官方完整名称成为 `extension` action |
| 元数据 | `source`、`readOnlyHint`、`effectScope` | 保留到发现结果、帮助和安全提示 |
| 变更通知 | 官方注册表声明 `listChanged=false` | 在刷新点比较缓存，并通知外层客户端 |
| CLI | 官方注册表不提供 | 通过 `siyuan extension ...` 使用同一桥接层 |
| 调用 | 直接执行官方 `tools/call` | 单次转发且不重放 |

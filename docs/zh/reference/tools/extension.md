# `extension`

`extension` 用于桥接思源 3.7.0 起通过官方 MCP 端点暴露的工具。

## 发现工具

```json
{
  "action": "list",
  "refresh": true
}
```

当 `extension.includeNativeTools=false` 时，响应会刻意保持紧凑：只返回连接状态、plugin/native 来源数量、暴露数量、schema 体积以及 `detailsIncluded=false`，不会返回完整 `tools` 数组，避免已关闭的原生工具发现结果占用 Agent 上下文。

启用原生工具后，响应中的 `detailsIncluded=true`，并额外返回各工具的名称、描述、只读声明、影响范围、降级 schema，以及在 Sisyphus 设置中被屏蔽的状态。`extension` 总览帮助遵循相同规则；仍可通过 `help(topic="<tool>")` 按需查看一个明确指定的工具。

默认接收 `source="plugin"` 的工具。启用 `extension.includeNativeTools=true` 后，Sisyphus 对原生工具同时执行“工具名白名单 + action 白名单”：`search`、`ref`、`outline`、`history`、`repo`、`inbox` 只允许配置中列明的读取动作，`web_fetch` 与 `web_search` 只允许无 `action` 的读取调用。原生 `image`、`document`、`block`、`file`、`database`、`system` 以及未列明动作，即使持久化屏蔽列表为空，也会被策略层拒绝。缺失 source 时按官方兼容规则视为 native。从外部 MCP Server 导入的 `source="mcp"` 工具和本插件自身命名空间仍会被排除。

全新安装默认启用这条窄化的只读桥接，用官方发现与网络读取补充 Sisyphus，同时不建立第二条笔记写入路径。
若官方工具名为 `help` 或 `list`，发现结果会标记保留 action 冲突，但不会暴露该工具。

## 调用官方工具

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

启用原生工具后，直接使用其不带前缀的官方名称：

```json
{
  "action": "search",
  "arguments": {
    "action": "semantic",
    "query": "知识图谱"
  }
}
```

```bash
siyuan extension search \
  --arguments-json '{"action":"semantic","query":"知识图谱"}'
```

## 安全与生命周期

- 连接 `/mcp` 前会先通过 `/api/system/version` 检查思源版本；低于 3.7.0 时直接标记不支持，不访问官方端点。
- 只有启用 `extension`、查看扩展工具设置或主动刷新时才建立连接。
- 未声明 `readOnlyHint=true` 的工具，调用前必须取得用户明确确认。
- 原生工具的下游 `action` 必须命中固定白名单；未知、缺失或未列明动作在转发前失败关闭。原生 `image` 工具不进入白名单；`search`、`ref`、`outline`、`history`、`repo` 在存在任一 `none` 笔记本时整体拒绝，避免绕开 Sisyphus 的逐笔记本权限边界。
- 官方 MCP 工具调用只发送一次，绝不自动重试；发送后发生传输错误时会报告“执行状态未知”。
- 工具发现属于只读操作，会话失效时允许重连并重试一次。
- 首次发现由外层 MCP Server 在后台执行，不阻塞其余工具列表；发现成功后缓存结果并发送工具列表变更通知。
- 后续外层 `tools/list` 直接复用缓存，不会强制访问 `/mcp`；`extension(action="list", refresh=true)` 可显式刷新。
- `/mcp` 不可用或显式刷新失败时只隐藏动态扩展 action，不影响其他 Sisyphus 工具或外层 MCP Server。
- 设置页提供总开关、原生工具来源开关和按工具屏蔽。

官方发现需要思源 3.7.0 或更高版本、管理员会话和有效 API Token。该要求只属于 `extension`；Sisyphus 插件的 `minAppVersion` 仍为 2.9.0。

> [!WARNING]
> 原生工具桥接无法对每条结果重新执行 Sisyphus 的笔记本过滤。因此工作区读取类原生工具只有在全部笔记本均可读时才允许转发；笔记、块、数据库、文件、配置、导入导出及其他修改类工具，在 Schema 暴露和调用前都会被拒绝。`web_search` 与 `web_fetch` 仍会把查询或网址发送给外部服务，因此只应向可信本地客户端开放。

## 官方 MCP 与 Sisyphus 的关系

Sisyphus 自带的 `fs`、时间线、权限管理、CLI、文档工具和其他聚合能力始终只走 `/api/*`。官方 `/mcp` 是 `extension` 的独立旁路，不作为任何自带能力的底层实现。

外部客户端应只注册 Sisyphus 的 `http://127.0.0.1:36806/mcp`。思源官方 `http://127.0.0.1:6806/mcp` 已随思源内核安装，只作为本节所述的内部扩展总线；同时注册两者会制造重复工具，并使官方原生工具绕过 Sisyphus 权限边界。

| 关注点 | 思源官方 MCP | Sisyphus |
|---|---|---|
| 注册方式 | 原生工具和插件分别注册独立工具 | 按工具类别和 action 聚合 |
| 命名空间 | 原生名称或 `plugin__<plugin>__<tool>` | 官方名称成为 `extension` action |
| 元数据 | `source`、`readOnlyHint`、`effectScope` | 保留到发现结果、帮助和安全提示 |
| 变更通知 | 官方注册表声明 `listChanged=false` | 在刷新点比较缓存，并通知外层客户端 |
| CLI | 官方注册表不提供 | 通过 `siyuan extension ...` 使用同一桥接层 |
| 调用 | 直接执行官方 `tools/call` | 单次转发且不重放 |

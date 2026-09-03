# 快速开始

这一组页面说明如何安装插件、选择传输方式，以及在连接失败时如何排查。

适用场景：你正在配置插件、连接 MCP 客户端，或者在 HTTP 与 stdio 之间做选择。

相关页面：

- [部署指南](./deployment.md)
- [HTTPS 配置](./https.md)
- [故障排查](./troubleshooting.md)
- [常见任务](../reference/common-tasks.md)

## 建议阅读顺序

1. [部署指南](./deployment.md)
2. 如果需要 TLS，再看 [HTTPS 配置](./https.md)
3. 如果连接失败，再看 [故障排查](./troubleshooting.md)

## 唯一外部入口

外部 Agent 只注册 `http://127.0.0.1:36806/mcp`。思源内置的 `http://127.0.0.1:6806/mcp` 是官方 MCP 扩展总线，由 Sisyphus `extension` 按需使用；不要并列注册。给另一台本地 Agent 交接时，提供固定版本的 `agent-kit/START-HERE.md`，由其安装 Skill 和客户端配置，然后通过 `system(action="bootstrap")` 验收。

## 本节覆盖内容

- 从集市或源码安装
- HTTP、stdio 与 `mcp-remote` 桥接的选择
- 环境变量与默认端口
- Docker、WSL、局域网场景
- 工具不可见或调用失败时的快速检查

## 场景 Skill 与 MCP Prompt

连接成功后，MCP 客户端可以通过标准 Resource 发现按场景组织的操作指南：

- `siyuan://skills/index` 用于把任务路由到最匹配、范围最窄的 Skill。
- `siyuan://skills/{name}` 返回选定场景的工作流与安全指南。

这些 Resource 由 MCP Server 直接提供，无需在客户端安装。Server 还会暴露带可选 `task` 参数的对应 Prompt。Prompt 是由用户显式调用的工作流入口，客户端不应假定它会自动运行。

如果 Agent 支持安装 `SKILL.md` 包，可以通过 npm CLI 安装等价的本地套件：

```bash
# 既有默认行为：CLI 命令约定
siyuan-sisyphus skill install

# MCP 工具调用约定
siyuan-sisyphus skill install --bundle mcp

# 同时安装两套
siyuan-sisyphus skill install --bundle all
```

`skill list` 和 `skill read` 同样接受 `--bundle cli|mcp|all`。Skill 描述任务流程、路径语义和安全规则，但不替代 action schema。精确且最新的参数应读取 `siyuan://help/action/{tool}/{action}`，或调用对应工具的 `help` action。

如果只希望通过公共 `skills` 安装器安装十五个 MCP 工作流 Skill，应指定经过筛选的子目录，不要指向仓库根目录：

```bash
npx -y skills add https://github.com/clark874/siyuan-plugins-mcp-sisyphus/tree/main/skills/siyuan-mcp --skill '*' -g -a codex -y
```

该命令只安装工作流说明，不会安装思源插件、注册 `http://127.0.0.1:36806/mcp` 或配置 Bearer 认证。使用这些 Skill 前仍须保证 Sisyphus MCP 可访问且认证有效，并通过 `system(action="bootstrap")` 验收连接。

## MCP 2026-07-28 与旧客户端

- `stdio` 自动接受新旧两代协议。
- HTTP 将 2026-07-28 请求路由到逐请求无状态 handler，同时为旧客户端保留带 `mcp-session-id` 的有状态会话。
- modern 高危 action 会先通过 MCP 多轮 elicitation 请求确认；modern 客户端必须声明 elicitation 能力才能执行这些操作。
- 带 `Origin` 的浏览器请求只允许 localhost 及 `SIYUAN_MCP_ALLOWED_ORIGINS` 中用逗号分隔的主机名。
- 内置思源官方 MCP 客户端使用自动版本协商。

SEP-2640 仍是草案扩展，但在 HTTP 与 stdio 传输中均默认开启，并发布全部内置工作流 Skill。插件内置 HTTP 服务可在“连接配置 → HTTP/HTTPS 连接 → Skills over MCP”中开关。独立启动时可设置 `SIYUAN_MCP_SKILLS_EXTENSION=false` 显式关闭。服务端会声明 `io.modelcontextprotocol/skills`，并开放 `skills/list`、`skills/get` 与全部内置 `skill://` 资源。无论是否启用该扩展，既有 `siyuan://skills/*` Resource 都继续工作。

仓库内通过校验的 Codex 包装位于 `agent-plugin/siyuan-sisyphus`。其中 MCP 配置只指向 `http://127.0.0.1:36806/mcp`；若服务端要求 `SIYUAN_MCP_TOKEN`，需在客户端侧补充 Bearer 认证。通用本地安装从 `agent-kit/START-HERE.md` 开始。

## 下一步

配置完成后，前往 [常见任务](../reference/common-tasks.md) 页面尝试 MCP/CLI 快速示例。

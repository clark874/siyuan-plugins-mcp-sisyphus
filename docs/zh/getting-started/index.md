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

## 下一步

配置完成后，前往 [常见任务](../reference/common-tasks.md) 页面尝试 MCP/CLI 快速示例。

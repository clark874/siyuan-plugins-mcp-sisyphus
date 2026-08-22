# 思源 Agent 接入入口

本包只把一个唯一外部 MCP 注册给 Agent：

```text
Sisyphus MCP：http://127.0.0.1:36806/mcp
```

思源内核还提供 `http://127.0.0.1:6806/mcp`。它是随思源安装的官方 MCP 总线，由 Sisyphus 的 `extension` 按需桥接；不要把它作为第二个思源 MCP 并列注册到外部客户端。

## 只安装工作流 Skill

支持 Agent Skills 规范的客户端可以单独安装12个 MCP 工作流 Skill：

```bash
npx -y skills add https://github.com/clark874/siyuan-plugins-mcp-sisyphus/tree/main/skills/siyuan-mcp --skill '*' -g -a codex -y
```

这条命令只安装 Skill，不会注册 `36806/mcp`，不会配置 Bearer token，也不会安装思源插件。首次接入仍须完成下方的 MCP 注册和本地认证；其他受支持客户端可将 `codex` 替换为对应的 Agent 标识。

## 自动安装

仅当当前 Agent 运行在本机、能够执行命令并修改其宿主客户端配置时，才执行安装。普通网页聊天不能安装本机 MCP，应直接说明宿主不具备本地工具接入能力。

1. 读取稳定通道清单：

```text
https://raw.githubusercontent.com/clark874/siyuan-plugins-mcp-sisyphus/codex/local-maintenance/release-channel.json
```
2. 使用清单中的 `agentKit.url` 下载并解压当前稳定版，不要从本文猜测或拼接版本号。
3. 阅读解压目录中的 `delivery.json`，确认其 `packageVersion` 与稳定通道一致，且唯一外部 endpoint 为 `36806/mcp`。
4. 在解压目录中按宿主执行：

```bash
# Kimi Code
SIYUAN_MCP_TOKEN='<由用户在本地提供的 token>' node scripts/install-agent-kit.mjs --client kimi

# ZCode
SIYUAN_MCP_TOKEN='<由用户在本地提供的 token>' node scripts/install-agent-kit.mjs --client zcode
```

若目标客户端已经保存了有效的 Sisyphus Bearer token，可省略环境变量，安装器会在受支持的本地客户端配置中复用它。安装器不读取思源工作区正文，不输出 token，也不删除检测到的官方 MCP 配置。

5. 在启动 Agent 会话前执行真实 MCP 验收：

```bash
node bin/check-sisyphus.cjs --client zcode --json
# 或
node bin/check-sisyphus.cjs --client kimi --json
```

检查器依次执行 initialize、tools/list 和 `system.bootstrap`。如果思源未运行，先启动思源并等待检查结果为 `ready`；随后必须重启或重新加载宿主客户端。当前会话不会因为端点稍后上线而自动获得 MCP 工具。

6. 重启或重新加载宿主客户端，确认只出现一组 Sisyphus 聚合工具。
7. 首次调用：

```text
system(action="bootstrap")
```

只有满足以下条件时，才可报告接入完成：`schemaVersion=2`、`toolConfiguration.current=true`，并且返回了当前可读笔记本和能力摘要。

## 后续统一更新

首次接入与后续更新是两件事。各 Agent 只需保存一次 `36806/mcp` 和本地 Bearer token；插件升级时不要反复改写 Kimi、ZCode、Codex、Cursor、Claude 或 Hermes 的客户端配置。

在任意一份本机 Agent Kit 解压目录中执行：

```bash
# 默认只检查，不修改插件
node scripts/update-sisyphus.mjs

# 用户确认后，校验 SHA-256、备份并替换思源中的唯一插件实例
node scripts/update-sisyphus.mjs --apply
```

更新器只操作 `data/plugins/siyuan-plugins-mcp-sisyphus`，不会读取笔记正文、Bearer token 或客户端配置。完成后重启思源，各 Agent 重新连接并调用 `system(action="bootstrap")`；无需逐个重新安装 MCP。

稳定通道清单：

```text
https://raw.githubusercontent.com/clark874/siyuan-plugins-mcp-sisyphus/codex/local-maintenance/release-channel.json
```

当前稳定版发布页：

```text
https://github.com/clark874/siyuan-plugins-mcp-sisyphus/releases/latest
```

后续交给其他本地 Agent 时，优先提供本文件的常青地址；需要审计具体发布物时，再以稳定通道中的版本化地址和 SHA-256 为准：

```text
https://raw.githubusercontent.com/clark874/siyuan-plugins-mcp-sisyphus/codex/local-maintenance/agent-kit/START-HERE.md
```

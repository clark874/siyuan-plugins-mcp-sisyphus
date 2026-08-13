# 思源 Agent 接入入口

本包只把一个唯一外部 MCP 注册给 Agent：

```text
Sisyphus MCP：http://127.0.0.1:36806/mcp
```

思源内核还提供 `http://127.0.0.1:6806/mcp`。它是随思源安装的官方 MCP 总线，由 Sisyphus 的 `extension` 按需桥接；不要把它作为第二个思源 MCP 并列注册到外部客户端。

## 自动安装

仅当当前 Agent 运行在本机、能够执行命令并修改其宿主客户端配置时，才执行安装。普通网页聊天不能安装本机 MCP，应直接说明宿主不具备本地工具接入能力。

1. 下载本版本发布资产并解压：

```text
https://github.com/clark874/siyuan-plugins-mcp-sisyphus/releases/download/v0.7.5-local.19/siyuan-agent-kit.zip
```
2. 阅读 `delivery.json`，确认唯一外部 endpoint 为 `36806/mcp`。
3. 在解压目录中按宿主执行：

```bash
# Kimi Code
SIYUAN_MCP_TOKEN='<由用户在本地提供的 token>' node scripts/install-agent-kit.mjs --client kimi

# ZCode
SIYUAN_MCP_TOKEN='<由用户在本地提供的 token>' node scripts/install-agent-kit.mjs --client zcode
```

若目标客户端已经保存了有效的 Sisyphus Bearer token，可省略环境变量，安装器会在受支持的本地客户端配置中复用它。安装器不读取思源工作区正文，不输出 token，也不删除检测到的官方 MCP 配置。

4. 重启或重新加载宿主客户端，确认只出现一组 Sisyphus 聚合工具。
5. 首次调用：

```text
system(action="bootstrap")
```

只有满足以下条件时，才可报告接入完成：`schemaVersion=2`、`toolConfiguration.current=true`，并且返回了当前可读笔记本和能力摘要。

固定版本发布页：

```text
https://github.com/clark874/siyuan-plugins-mcp-sisyphus/releases/tag/v0.7.5-local.19
```

后续交给其他本地 Agent 时，优先提供本文件的固定版本地址：

```text
https://raw.githubusercontent.com/clark874/siyuan-plugins-mcp-sisyphus/v0.7.5-local.19/agent-kit/START-HERE.md
```

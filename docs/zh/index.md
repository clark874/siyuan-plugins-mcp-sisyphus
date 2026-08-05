# SiYuan Sisyphus MCP & CLI 文档

SiYuan Sisyphus MCP & CLI 在这个仓库里同时提供两种产物：

- 一个内嵌 MCP Server 的思源插件
- 一个独立 CLI：`siyuan-sisyphus`

## 选择你的入口

### 我要把它接到 AI 客户端

先看：

- [快速开始](./getting-started/index.md)
- 然后到 [常见任务](./reference/common-tasks.md) 做只读验证

适用于 Claude Desktop、Codex、Cherry Studio、Cursor、Cline 等 MCP 客户端。

### 我要直接用 CLI

先看：

- [快速开始](./getting-started/index.md)
- [常见任务](./reference/common-tasks.md)

适用于命令行单次调用，例如 `siyuan notebook list`。

### 我要参与开发

先看：

- [架构首页](./architecture/index.md)
- [开发首页](./development/index.md)

适用于修改工具实现、API 封装、构建目标或文档本身。

## 推荐阅读顺序

1. [快速开始](./getting-started/index.md)
2. [参考首页](./reference/index.md)
3. [架构首页](./architecture/index.md)
4. [开发首页](./development/index.md)

## 这个项目包含什么

- 14 个聚合工具，按 action 路由
- 笔记本级权限控制：`none`、`r`、`rw`、`rwd`
- HTTP 和 stdio 两种传输模式
- MCP 与 CLI 共用的一套核心实现

## 相关页面

- [项目 README](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/README_zh_CN.md)
- [英文文档](/)
- [架构洞察](/zh/insights)

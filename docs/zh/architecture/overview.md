# Overview

这个页面描述系统最顶层的分层关系和运行形态。

适用场景：你需要快速建立 MCP 到 SiYuan 的边界认知。

## 三层视图

1. AI Agent / MCP Client
2. MCP 服务与插件运行时
3. SiYuan HTTP API 与数据模型

## 关键事实

- 仓库同时产出插件和独立 CLI
- 插件可以通过 HTTP 或 stdio 相关方式暴露 MCP 能力
- 两个入口共用同一套工具注册表和 API 封装层

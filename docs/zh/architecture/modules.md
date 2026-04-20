# Modules

这个页面按职责划分核心模块。

适用场景：你需要知道哪一块文件负责 transport、tools、config 或 API 行为。

## 核心区域

- `src/index.ts`
  - 插件生命周期
  - 设置 UI 挂载
  - 内嵌 HTTP launcher 接线

- `src/mcp/server.ts`
  - MCP 服务创建
  - tool/resource handler
  - server instructions

- `src/mcp/tool-registry.ts`
  - 把每个聚合工具类别映射到 list/call handler

- `src/mcp/tool-lifecycle.ts`
  - 在工具执行外层注入 analytics、telemetry、mascot 事件

- `src/mcp/permissions.ts`
  - 笔记本级权限读取与校验
  - 通过 SiYuan API-backed 插件存储路径持久化数据

- `src/api/*`
  - 轻量的 SiYuan HTTP API 封装

- `src/cli/*`
  - 独立 CLI 的参数解析、派发、渲染与配置读取

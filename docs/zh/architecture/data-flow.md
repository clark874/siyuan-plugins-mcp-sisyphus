# Data Flow

这个页面描述请求从 MCP 客户端到 SiYuan 的流转路径。

适用场景：你在排查某个工具调用为什么成功、失败，或者为什么结果被过滤。

## 典型流转

1. 客户端发起 tool call
2. `server.ts` 解析工具名和 action
3. 工具配置决定该 tool 是否启用
4. PermissionManager 在适用时检查笔记本访问权限
5. 类别工具 handler 完成校验和派发
6. `src/api/*` 发出 SiYuan HTTP 请求
7. lifecycle wrapper 记录 analytics / telemetry / mascot 状态
8. 结果返回给客户端

## 重要旁路

- 帮助文档通过 MCP resources 提供，不走普通 tool call
- CLI dispatch 不经过 MCP transport，但仍复用同一套 tool registry 和 lifecycle 逻辑

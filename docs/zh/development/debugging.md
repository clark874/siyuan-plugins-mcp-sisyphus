# Debugging

这个页面汇总最常用的调试入口。

适用场景：你需要日志、客户端配置检查，或者排查 SiYuan 运行时行为。

## 常见入口

- 先检查插件和客户端配置
- 检查 `6806` 上的 SiYuan API 是否可达
- 检查 `36806` 上的 MCP HTTP 是否可达

## 常用技巧

- 当前端或插件行为不清楚时，使用 SiYuan remote debugging
- 先排查 MCP 客户端配置里的 transport mismatch
- 需要端到端信号时，运行 smoke tests

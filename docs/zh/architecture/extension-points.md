# Extension Points

这个页面说明安全的扩展区域，以及需要注意的边界。

适用场景：你要新增工具、修改 transport，或扩展 docs/config。

## 可扩展区域

- 新的工具类别
- 现有工具类别中的新 action
- 新的帮助资源
- CLI 渲染和命令表面
- 设置 UI 与工具配置存储

## 边界

- 文件访问应通过 SiYuan API，确保远程场景安全
- 笔记本权限必须继续在 notebook-scoped 数据上生效
- 工具文档应和 `src/mcp/config.ts` 中的 action 列表保持一致

## 安全说明

- `workspace_info` 和本地文件上传属于高风险面
- HTTP 绑定到非 loopback 时必须启用 token 鉴权

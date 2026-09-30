# 架构总览

SiYuan Sisyphus 通过 MCP 与 CLI 共同暴露一个明确收敛的文本工作流工具面。

## 分层

1. MCP 客户端通过 stdio 或带认证的 HTTP(S) 连接；CLI 直接调用同一注册表。
2. `TOOL_REGISTRY` 发布 14 个聚合工具，并路由其中 103 个动作。
3. 每次调用依次经过权限检查、严格安全写入预检、响应整形和可选界面刷新。
4. `SiYuanClient` 使用思源 HTTP API；`file` 工具只额外读取已经登记并列入清单的本地项目文本；`literature` 只通过回环地址连接本地 Zotero MCP 的固定只读白名单。

14 个聚合工具是 `fs`、`notebook`、`document`、`block`、`av`、`file`、`project`、`search`、`literature`、`provenance`、`tag`、`timeline`、`system` 和 `extension`。唯一事实源是 `src/core/config.ts`。

## 边界

- 猫猫、反馈、闪卡、统计、遥测、资源/OCR、模板/导入导出、时间线回退与删除均不属于 MCP 或 CLI 工具面。
- 思源本地版本控制面板仍可执行本地回退和删除时间线节点；它与 MCP 暴露相互独立。
- `extension` 只转发官方只读白名单：`search.semantic`、`ref.backlinks`、`ref.forwardlinks`、`outline.get`、`web_fetch` 和 `web_search`。
- `literature` 只允许论文读取相关的 8 个 Zotero 上游工具；Zotero 写入、语义索引管理和本地附件绝对路径不对外暴露。
- 启用严格模式时，所有有状态写入均同时受笔记本权限和预检—回读协议约束。

## 产物

插件构建思源渲染端、MCP 服务端和时间线 MCP App。独立的 `siyuan-sisyphus` 包构建自包含 CLI，并复用相同的 schema 与处理器。

支持的扩展方式见[扩展点](./extension-points.md)。

# Project 工具

`project` 为共享项目记忆提供一个有界、只读的机器接口。

## `snapshot`

必须在 `cwd`、`projectId`、`projectName` 中且仅选择一个。返回项目身份、进度投影、最近事件、会话、知识产物、已登记产物、服务端诊断和宿主本地探针基线。

响应不返回 `workspaceRoot`。绝对路径只为项目产物索引中已经登记的条目解析。`query_embed` 仍是面向人的界面视图，不作为机器真相源。

事件先以稳定的单表查询取得最多 501 个块，再在 TypeScript 中按事实时间排序：优先使用 `custom-progress-occurred-at`，其次使用 `custom-provenance-occurred-at`，最后回退到块创建时间；同一事实时间按登记时间和块 ID 稳定排序。分页只在排序后执行。

每个事件返回 `occurredAt`、`recordedAt` 和 `timeBasis`。`chronology` 同时返回项目头部、工作线头部、扫描数量和完整性。若事件窗口超过 500 条，响应返回 `event_chronology_truncated`，将 `chronology.complete` 设为 `false`，并停止输出权威的投影滞后判断；客户端不得据此更新当前状态投影。

## 项目知识目录与续接

`knowledgeCatalogs` 返回项目明确登记的知识 AV 和数据库块链接，与响应中的文献目录独立。用 `search.knowledge` 的 `catalog` 参数筛选项目知识。快照的 `knowledgeCounts` 分列当前列表中的来源和原子数量，`includeRelations=true` 按需查看有界的一跳关系。

`knowledgeUpdate` 报告项目中枢批次的阶段和已覆盖来源数量。使用统一 `siyuan` 入口完成增量更新；批次尚待续接时延后已启用导图的自动刷新。关闭时回读真实事件、关系和知识 AV，导图冲突单独回报。

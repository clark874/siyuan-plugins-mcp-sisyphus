# Project 工具

`project` 为共享项目记忆提供一个有界、只读的机器接口。

## `snapshot`

必须在 `cwd`、`projectId`、`projectName` 中且仅选择一个。返回项目身份、进度投影、最近事件、会话、知识产物、已登记产物、服务端诊断和宿主本地探针基线。

响应不返回 `workspaceRoot`。绝对路径只为项目产物索引中已经登记的条目解析。`query_embed` 仍是面向人的界面视图，不作为机器真相源。

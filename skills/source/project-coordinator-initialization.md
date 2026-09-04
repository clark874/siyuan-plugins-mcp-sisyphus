# 项目进度页初始化

仅当 `project.snapshot` 返回 `needs_initialization`，且用户明确同意初始化时读取并执行本文件。禁止因标题相似而重复创建。

## 页面结构

在项目中枢下创建唯一“项目进度协作”文档，包含以下稳定区：

1. 项目概览；
2. 阶段台账；
3. 权威产物索引，仅保存项目内相对路径；
4. 当前项目状态；
5. 工作线状态；
6. 普通进度事件；
7. 最近登记 `query_embed`，按块创建时间显示追加审计顺序，不作为项目事实时间线；
8. 本项目知识产物 `query_embed`。

项目概览、阶段台账和权威产物索引只从项目中枢、既有知识原子及已登记项目清单生成。证据不足的字段写“待确认”，不得从文件名推断事实，也不得回填历史聊天。

## 必要属性

- 文档：`custom-progress-role=project-progress-page`、`custom-progress-schema=1`、`custom-progress-project-id`；
- 稳定投影：`custom-progress-role=project-profile|stage-ledger|artifact-index`、项目 ID、更新时间；
- 项目状态：`custom-progress-role=project-state`、项目 ID、`workstream=project`、更新时间、最近事件 ID；
- 工作线状态：`custom-progress-role=workstream-state`、项目 ID、工作线、更新时间、最近事件 ID。

元数据必须通过 `block.set_attrs` 写入。先建立文档级时间线节点，再逐块严格预检、执行和回读。页面查询嵌入只服务人类界面；机器恢复与“最近实质更新”一律调用 `project.snapshot`，按事件 `occurredAt` 排序。

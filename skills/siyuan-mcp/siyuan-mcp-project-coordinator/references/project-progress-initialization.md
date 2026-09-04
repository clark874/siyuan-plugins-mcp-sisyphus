# 项目首次接入与进度页初始化

仅在以下任一情形读取本文件：当前目录尚未登记且用户已经明确同意首次接入；或 `project.snapshot` 返回 `needs_initialization` 且用户明确同意初始化。禁止因标题相似而重复创建。

## 首次接入顺序

首次接入不是普通收尾写入。先说明将进入“首次接入”子流程，然后按以下阶段执行；每一阶段完成后立即回读，失败时保留已完成阶段并停止，下一次从权威回读结果继续：

1. 调用 `file.list_project_sources`，并在目标父路径下查询同名中枢，排除已有登记、同名文档和歧义候选；
2. 创建只含项目标题与“待初始化”说明的最小中枢并回读，禁止在首次文档创建中同时批量写入知识原子；
3. 使用该中枢块 ID 调用 `file.register_project_source`，随后扫描用户明确指定的核心文件并回读项目登记；
4. 调用 `project.snapshot`；仅当返回 `needs_initialization` 时建立下述进度页与状态投影；
5. 再次调用 `project.snapshot` 确认项目可恢复后，才把本轮可复用增量交给既有知识流程创建或合并原子；
6. 最后执行常规收尾的事件登记和状态投影更新。

重新执行时，依次以项目源登记、中枢稳定块、进度页属性和知识原子 `name` 判断阶段是否已经完成；已完成阶段只回读，不重复创建。所有严格写入优先复制预检返回的 `issuedRequestId`，禁止手工构造 UUIDv7。

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

元数据必须通过 `block.set_attrs` 写入。先建立文档级时间线节点，再逐块严格预检、复制返回的 `issuedRequestId` 与凭据、执行和回读。页面查询嵌入只服务人类界面；机器恢复与“最近实质更新”一律调用 `project.snapshot`，按事件 `occurredAt` 排序。

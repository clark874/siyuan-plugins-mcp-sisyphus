# Project 工具

`project` 为共享项目记忆提供一个有界、只读的机器接口。

## `snapshot`

必须在 `cwd`、`projectId`、`projectName` 中且仅选择一个。返回项目身份、进度投影、最近事件、会话、知识产物、已登记产物、服务端诊断和宿主本地探针基线。

响应不返回 `workspaceRoot`。绝对路径只为项目产物索引中已经登记的条目解析。`query_embed` 仍是面向人的界面视图，不作为机器真相源。

事件先以稳定的单表查询取得最多 501 个块，再在 TypeScript 中按事实时间排序：优先使用 `custom-progress-occurred-at`，其次使用 `custom-provenance-occurred-at`，最后回退到块创建时间；同一事实时间按登记时间和块 ID 稳定排序。分页只在排序后执行。

每个事件返回 `occurredAt`、`recordedAt` 和 `timeBasis`。`chronology` 同时返回项目头部、工作线头部、扫描数量和完整性。若事件窗口超过 500 条，响应返回 `event_chronology_truncated`，将 `chronology.complete` 设为 `false`，并停止输出权威的投影滞后判断；客户端不得据此更新当前状态投影。

### 项目源版本核对

`sourceFreshness.declared` 分别记录项目状态或概况上的 `custom-progress-code-version`、`custom-progress-published-version`、`custom-progress-installed-version` 和 `custom-progress-runtime-version`。这些字段是项目声明。快照从已登记的 Git 清单读取根目录 `package.json`，将实读版本及提交核验结果放在 `sourceFreshness.checkout`。

绑定版本与明确声明的代码版本不符时报告 `project_checkout_version_mismatch`。文件读到了版本，但提交或清单未通过核验时报告 `project_checkout_version_unverified`。同时检查状态与概况对同一版本字段的声明冲突。只有代码版本参与工作树比对，发布、磁盘安装、运行各有独立字段。历史正文中的版本叙述可供阅读，机器比较使用明确属性。

## 项目知识目录与续接

`knowledgeCatalogs` 返回项目明确登记的知识 AV 和数据库块链接，与响应中的文献目录独立。用 `search.knowledge` 的 `catalog` 参数筛选项目知识。快照的 `knowledgeCounts` 分列当前列表中的来源和原子数量，`includeRelations=true` 按需查看有界的一跳关系。

`knowledgeUpdate` 报告项目中枢批次的阶段和已覆盖来源数量。使用统一 `siyuan` 入口完成增量更新；批次尚待续接时延后已启用导图的自动刷新。关闭时回读真实事件、关系和知识 AV，导图冲突单独回报。

## 知识协议与原块格式

`knowledgeProtocol` 返回协议 2、契约 1.6 及统一技能指针。知识产物的 `formattedExcerpt` 来自内核 Markdown，`textBasis=kernel-markdown`，摘要视图仍受截断规则约束。数学符号须回读原块，纯文本标题不能代替格式保真。

知识目录继续管理来源；原子可通过同次写入的 `custom-knowledge-project-id` 与 `custom-knowledge-workstream` 发现，无须重复建 AV 行。既有原子行与属性原子去重后确定性分页，类型及核验状态取原块。无目录行的原子没有 `compileStatus`，编译状态筛选只匹配真实目录记录。授权入口缺失时不会绕过目录枚举原子。

`search.knowledge` 默认提供顶层 `supersededBy` 映射，键为旧命中的块 ID，值为新原子与关系块 ID 列表。该字段是接替声明，不能代替来源和适用范围核对；多个接替者全部保留。`supersessionWindow.hasMore` 表示有界窗口仍需继续核读，查询不可用时明确报告 unavailable。

目录本次最多读取 2,000 个属性原子，超过范围明确报告不可用；减少写入不等于保证读取提速。

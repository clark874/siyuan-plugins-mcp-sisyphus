# search

当前检索工具包含 12 个文本知识 action：

- 检索：`fulltext`、`semantic`、`knowledge`、`query_sql`。
- 治理与引用：`check_anchor`、`get_backlinks`、`search_refs`、`list_invalid_refs`。
- 受控修改：`find_replace`、`criteria_save`、`criteria_remove`。
- 已保存搜索读取：`criteria_list`。

自然语言治理检索优先使用 `knowledge`，候选检查使用 `semantic`，结构分析使用带明确 `LIMIT` 的只读 `query_sql`。`check_anchor` 是写入前命名冲突检查，不是检索捷径。工具不再暴露资产文件名检索或资产内容/OCR 检索。

## 混合召回、上下文与文本精排

探索性问题可使用：

```json
{"action":"knowledge","query":"哪些笔记解释这个方法的适用条件？","retrievalMode":"hybrid","includeContext":true,"rerank":true,"pageSize":10,"candidateSize":20}
```

- `retrievalMode` 默认 `auto`，保留本地名称及关键词预检；`hybrid` 并行召回并按倒数排名融合；`semantic` 跳过关键词预检。唯一名称直达和名称歧义保护仍生效，纯语义对照须显式 `namespaceMode=off`。优先使用当前项目的真实存储路径限定范围。
- 两路候选按真实块 ID 去重，再沿用引用折叠与命名治理。`channelCandidateCounts`、`semanticCandidateCount`、`hybridCandidateCount` 区分通道与融合数量；混合结果使用 `fusionRank` 和 `retrievalSources`。两路之一失败时检查 `retrievalDiagnostics` 和 `partial`。
- `candidateCounts` 明确各阶段：`recalledBlocks` 是融合后的召回块数，`namespaceSeeds` 是名称种子数，`resolvedTargets` 是引用展开、归并后的目标数；`beforeDeduplication` 是种子与目标合并前的数量，`afterDeduplication` 是按目标 ID 去重后的总数。`deduplicatedCount` 保留为后者的同义字段，未按页截断；`showing` 才是本页数量，`truncated` 按最终唯一候选数计算。一个召回块可指向多个目标，种子也会补入，因此最终目标数可以大于 `hybridCandidateCount`，不能据此认定去重失效。
- `includeContext=true` 为前20项补齐文档标题、同级标题和相邻块；检查 `contextStatus.attachedCount` 与各项 `context.complete`。片段最长1000字符，返回原始块 ID 与截断标记。上下文不参与写入。
- `rerank=true` 自动请求上下文，使用思源 AI→决策配置中已启用的 TypeSafe 账户。默认不启用；每次只发前10个候选、每项正文最多1000字符、前后邻块各400字符，使用一次文本评分请求。先核对实时块身份及权限，已知凭据脱敏，不接入图片。
- 精排5秒超时、不重试。`rerank.status=applied` 才表示使用了模型排序；`fallback` 保留原候选顺序并报告原因。`decisionScore` 是候选相关性分数，不是事实正确率或证据认证。模型版本、用量与输入限制会随结果返回。
- Jev 原生接口为 TypeSafe System One，不能只把模型名填进普通重排接口。插件复用思源现有凭据配置，以受限文本接口调用，不新增通用决策工具或第二套配置。
- 语义内核请求单次等待上限15秒，其他普通请求仍用既有时限；超时不自动重放。空候选不等于证明文库不存在相关内容，仍须按稳定 ID 与来源回读。

## 按项目知识目录筛选

从 `project.snapshot.knowledgeCatalogs` 选择已登记目录。将 `catalogBlockId`、可选 `projectId`、`offset` 及 `filters` 放入 `catalog`。字段包括 `workstream`、`objectRole`、`atomType`、`verificationStatus`、`compileStatus`。同字段接受单值或多个可选值，不同字段同时满足。此时 `query` 记录提问意图，实际候选由目录字段确定，返回可直接回读的稳定块 ID。核验状态来自原块；返回的 `catalog.nextOffset` 用于继续读。

`includeRelations=true` 对本页候选附上一跳有向关系，包括关系块 ID、起点和终点。可分别从任一端继续查询；`hasUnresolvedLegacy` 表示有仍待核定端点的历史关系。

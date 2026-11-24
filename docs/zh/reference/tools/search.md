# search

当前检索工具包含 14 个文本知识 action：

- 检索：`fulltext`、`semantic`、`knowledge`、`query_sql`、`sql_schema`。
- 治理与引用：`lint`、`check_anchor`、`get_backlinks`、`search_refs`、`list_invalid_refs`。
- 受控修改：`find_replace`、`criteria_save`、`criteria_remove`。
- 已保存搜索读取：`criteria_list`。

自然语言治理检索优先使用 `knowledge`，候选检查使用 `semantic`，结构分析使用带明确 `LIMIT` 的只读 `query_sql`。`check_anchor` 是写入前命名冲突检查，不是检索捷径。工具不再暴露资产文件名检索或资产内容/OCR 检索。

## 全文查询与原文匹配

`search.fulltext` 查思源的块索引，适合跨文档定位。`fs.search` 匹配指定范围内的 Markdown 原文，可限定行、块或单文档。两种入口的命中口径不同。

普通关键词查询首窗无可读结果时，使用最多 8 个字面词元做一次 `OR` 查询。`keywordFallback` 记录实际查询和状态，设 `keywordFallback=false` 可只查原查询。继续翻页使用返回的查询及 `methodName=query_syntax`。`matchedTokens` 和 `unmatchedTokens` 只描述本次返回结果的字面覆盖。`confidence=strong` 表示一个结果覆盖全部词元，`weak` 表示部分覆盖或其他召回信号，`none` 表示当前未命中。信号均不代表证据强度。

普通块正文回读相同时，当前结果窗口折叠重复项并保留较短路径、来源 ID 和 `duplicatesCollapsed`。需要逐条核对时用 `dedupe=false`。带独立名称、别名或核验状态的块保留。`contentOmittedChars` 和 `markdownOmittedChars` 记录插件从内核返回内容中进一步省略的字符数，原块仍按稳定 ID 回读。`check_anchor` 一次支持拆分后 50 个候选。

## 核查已有成果

撰写新颖性主张前，调用 `search.knowledge`，用 `query` 传主张、`retrievalMode=prior_art` 选核查模式、用 `notebooks` 或 `paths` 限定项目范围。它使用混合召回，按配置访问向量服务，并保留候选窗口内具有 `execution-verified` 或 `evidence-verified` 状态且记录凭据的结果。逐块回读正文、核验凭据及 `supersededBy`，核对假设与适用范围。无命中时继续按术语、别名和项目目录查找。该查询不能建立库内或学术新颖性结论。

## 混合召回、上下文与文本精排

探索性问题可使用：

```json
{"action":"knowledge","query":"哪些笔记解释这个方法的适用条件？","retrievalMode":"hybrid","includeContext":true,"rerank":true,"pageSize":10,"candidateSize":20}
```

- `retrievalMode` 默认 `auto`，保留本地名称及关键词预检；`hybrid` 并行召回并按倒数排名融合；`semantic` 跳过关键词预检。唯一名称直达和名称歧义保护仍生效，纯语义对照须显式 `namespaceMode=off`。优先使用当前项目的真实存储路径限定范围。
- 两路候选按真实块 ID 去重，再沿用引用折叠与命名治理。`channelCandidateCounts`、`semanticCandidateCount`、`hybridCandidateCount` 区分通道与融合数量；混合结果使用 `fusionRank` 和 `retrievalSources`。两路之一失败时检查 `retrievalDiagnostics` 和 `partial`。
- `candidateCounts` 明确各阶段：`recalledBlocks` 是融合后的召回块数，`namespaceSeeds` 是名称种子数，`resolvedTargets` 是引用展开、归并后的目标数；`beforeDeduplication` 是种子与目标合并前的数量，`afterDeduplication` 是目标 ID 和相同正文折叠后的候选数。`deduplicatedCount` 保留为后者的同义字段，未按页截断；`showing` 才是本页数量，`truncated` 按最终候选数计算。一个召回块可指向多个目标，种子也会补入，因此最终目标数可以大于 `hybridCandidateCount`，不能据此认定去重失效。
- `includeContext=true` 为前20项补齐文档标题、同级标题和相邻块；检查 `contextStatus.attachedCount` 与各项 `context.complete`。片段最长1000字符，返回原始块 ID 与截断标记。上下文不参与写入。
- `rerank=true` 自动请求上下文，使用思源 AI→决策配置中已启用的 TypeSafe 账户。默认不启用；每次只发前10个候选、每项正文最多1000字符、前后邻块各400字符，使用一次文本评分请求。先核对实时块身份及权限，已知凭据脱敏，不接入图片。
- 精排5秒超时、不重试。`rerank.status=applied` 才表示使用了模型排序；`fallback` 保留原候选顺序并报告原因。`decisionScore` 是候选相关性分数，不是事实正确率或证据认证。模型版本、用量与输入限制会随结果返回。
- Jev 原生接口为 TypeSafe System One，不能只把模型名填进普通重排接口。插件复用思源现有凭据配置，以受限文本接口调用，不新增通用决策工具或第二套配置。
- 语义内核请求单次等待上限15秒，其他普通请求仍用既有时限；超时不自动重放。空候选不等于证明文库不存在相关内容，仍须按稳定 ID 与来源回读。

## 按项目知识目录筛选

从 `project.snapshot.knowledgeCatalogs` 选择已登记目录。将 `catalogBlockId`、可选 `projectId`、`offset` 及 `filters` 放入 `catalog`。字段包括 `workstream`、`objectRole`、`atomType`、`verificationStatus`、`compileStatus`。同字段接受单值或多个可选值，不同字段同时满足。此时 `query` 记录提问意图，实际候选由目录字段确定，返回可直接回读的稳定块 ID。核验状态来自原块；返回的 `catalog.nextOffset` 用于继续读。

`includeRelations=true` 对本页候选附上一跳有向关系，包括关系块 ID、起点和终点。可分别从任一端继续查询；`hasUnresolvedLegacy` 表示有仍待核定端点的历史关系。

## 知识库巡检

`search(action="lint", documentId="文档根块ID")` 检查单篇文档。也可传 `notebook` 扫描一个可读笔记本。返回 `findings`、`scannedBlocks`、`scanComplete` 和 `totalFindings`。`maxBlocks` 限制扫描量，`maxFindings` 限制返回量，`atomCharLimit` 设置过长原子的字符阈值。出现部分扫描时可缩小到单篇文档。别名碰撞和孤儿只作为复核候选，陈旧溯源只比较已登记的同类版本。以块回读确定修改范围。

`search.fulltext` 查思源索引并返回块候选，`fs.search` 按路径查 Markdown 原行，可定位公式、代码和标记。可分别用语义明确的别名 `search.search_index` 和 `fs.search_markdown`，原调用仍可使用。只有普通关键词的第一个结果窗口内没有可读命中且可提取至少两个词元时，会额外调用一次词元 OR；有可读命中时保持原查询和排序。零结果的 `absenceEstablished=false` 表示当前查询及范围内未找到证据。

增量巡检传入 `updatedSince`，格式为思源内核本地时间的 `YYYYMMDDHHMMSS`。巡检包含水位和起扫所在秒。若返回 `nextCursor`，以同一文档或笔记本原样传回 `cursor` 来读下一页。每页使用固定上界，按更新时间加块 ID 排序，同秒更新不会因时间相同被整页跳过。仅在 `scanComplete=true` 的最终页保存 `nextUpdatedSince`。下一轮带最多 60 秒重叠，处理常见的索引延迟。该窗口内的报告可按规则与块 ID 去重。长期索引滞后、删除和关联方变化仍须定期跑全量，去掉 `updatedSince` 即回到全量。

定时任务可运行如下本地只读命令。首次全量省去 `--updated-since`，后续将上次返回的水位替换到命令中。第二页起把 `--updated-since` 换成 `--cursor-json '<原样 nextCursor>'`。脚本先存当页报告，全部读完再原子替换该范围的水位文件。若无新水位保留旧值，并将未完成报告交给维护者复核。

```bash
siyuan search lint --notebook '<笔记本 ID>' --updated-since '20261121120000' --json
```

`referenceScanComplete=false` 表示部分引用无法完整核对。名称、别名和重复原子以可读范围内最多 2,000 个具名或原子块为增量对照，`comparisonComplete=false` 时可缩小到单篇文档。某页超过问题回传上限时，提高 `maxFindings` 或缩小 `maxBlocks` 后重扫该页。

可在已确认例外的块上通过既有 `block.set_attrs` 写入 `custom-lint-exempt`。值为按规则命名的 JSON 对象，`reason` 必填，`until` 为可选的包含当日的截止日期。例如：

```json
{"orphan_atom_candidate":{"reason":"保留为独立历史判例","until":"2026-12-31"}}
```

报告的 `exemptions` 保留原问题、负责豁免的块 ID、原因及期限。重名、别名碰撞和重复内容涉及多块，需相关块分别声明豁免才会移出待处理列表。过期或格式错误会在 `exemptionDiagnostics` 中显示，对应问题继续报告。引用缺失或当前权限不可核对统一标记为 `missing_or_unreadable`。豁免只影响问题分类，无法补足引用扫描覆盖。

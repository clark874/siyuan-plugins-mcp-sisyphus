# search

The maintained search surface contains 12 text-knowledge actions:

- Retrieval: `fulltext`, `semantic`, `knowledge`, `query_sql`.
- Governance and references: `check_anchor`, `get_backlinks`, `search_refs`, `list_invalid_refs`.
- Controlled mutation: `find_replace`, `criteria_save`, `criteria_remove`.
- Saved search inspection: `criteria_list`.

Use `knowledge` for governed natural-language retrieval, `semantic` for candidate inspection, and read-only `query_sql` with an explicit `LIMIT` for structured analysis. `check_anchor` is a pre-write collision check, not a retrieval shortcut. Asset filename search and indexed asset-content/OCR search are not exposed.

`search.fulltext` 查思源的块索引。指定文档的 Markdown 原行匹配使用 `fs.search`。普通多词关键词首窗为空时，`keywordFallback` 报告字面词元 `OR` 回退。`matchedTokens`、`unmatchedTokens` 和 `confidence` 仅反映当前结果；未命中时可用核心术语或别名重查。相同正文的重复普通块保留来源 ID，可用 `dedupe=false` 检查各命中。`check_anchor` 接受拆分后最多 50 个候选。

撰写新颖性主张前使用 `search.knowledge` 的 `retrievalMode=prior_art`，将主张放入 `query`，用 `notebooks` 或 `paths` 限定范围。该模式调用已配置的向量服务，返回召回窗口内有凭据的执行或证据核验结果。回读原块、核验凭据和接替关系后再作比较，空结果不足以建立新颖性结论。

## 混合召回、上下文与文本精排

探索性问题可使用：

```json
{"action":"knowledge","query":"哪些笔记解释这个方法的适用条件？","retrievalMode":"hybrid","includeContext":true,"rerank":true,"pageSize":10,"candidateSize":20}
```

- `retrievalMode` 默认 `auto`，保留本地名称及关键词预检；`hybrid` 并行召回并按倒数排名融合；`semantic` 跳过关键词预检。唯一名称直达和名称歧义保护仍生效，纯语义对照须显式 `namespaceMode=off`。优先使用当前项目的真实存储路径限定范围。
- 两路候选按真实块 ID 去重，再沿用引用折叠与命名治理。`channelCandidateCounts`、`semanticCandidateCount`、`hybridCandidateCount` 区分通道与融合数量；混合结果使用 `fusionRank` 和 `retrievalSources`。两路之一失败时检查 `retrievalDiagnostics` 和 `partial`。
- `candidateCounts` 明确各阶段：`recalledBlocks` 是融合后的召回块数，`namespaceSeeds` 是名称种子数，`resolvedTargets` 是引用展开、归并后的目标数；`beforeDeduplication` 是种子与目标合并前的数量，`afterDeduplication` 是目标 ID 与相同正文折叠后的候选数。`deduplicatedCount` 是后者的同义字段；`showing` 才是本页数量。一个召回块可指向多个目标，也可能有名称种子补入。
- `includeContext=true` 为前20项补齐文档标题、同级标题和相邻块；检查 `contextStatus.attachedCount` 与各项 `context.complete`。片段最长1000字符，返回原始块 ID 与截断标记。上下文不参与写入。
- `rerank=true` 自动请求上下文，使用思源 AI→决策配置中已启用的 TypeSafe 账户。默认不启用；每次只发前10个候选、每项正文最多1000字符、前后邻块各400字符，使用一次文本评分请求。先核对实时块身份及权限，已知凭据脱敏，不接入图片。
- 精排5秒超时、不重试。`rerank.status=applied` 才表示使用了模型排序；`fallback` 保留原候选顺序并报告原因。`decisionScore` 是候选相关性分数，不是事实正确率或证据认证。模型版本、用量与输入限制会随结果返回。
- Jev 原生接口为 TypeSafe System One，不能只把模型名填进普通重排接口。插件复用思源现有凭据配置，以受限文本接口调用，不新增通用决策工具或第二套配置。
- 语义内核请求单次等待上限15秒，其他普通请求仍用既有时限；超时不自动重放。空候选不等于证明文库不存在相关内容，仍须按稳定 ID 与来源回读。

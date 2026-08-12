---
name: siyuan-sisyphus-knowledge-governance
description: CLI-only 思源知识治理工作流。用于把专题材料编译为带 name/alias 的知识原子，审计覆盖缺口与歧义，维护专题中枢，并安全执行跨引用、嵌入查询和正文副本的改名。
---

# 思源知识原子编译与治理 with the CLI

把 `/AGENTS.md` 当作稳定路由表，不把专题原子清单、动态数量、一次性实验或兼容性结论写入全局记忆。专题事实进入对应知识中枢；可重复的治理步骤由本 Skill 执行；数量和冲突以实时 SQL 为准。

## 一、发现与候选队列

先读取工作区入口，再用专题词定位知识中枢和候选块。不要先遍历整个笔记本：

```bash
siyuan-sisyphus fs read --path '/AGENTS.md' --block-start '0' --block-limit '80' --token-budget '2000' --json
```
```bash
siyuan-sisyphus search fulltext --query 'topic keyword' --page '1' --page-size '20' --json
```
```bash
siyuan-sisyphus search query-sql --stmt 'SELECT id, name, alias, hpath, substr(content, 1, 80) AS preview FROM blocks WHERE name LIKE '"'"'%topic%'"'"' OR alias LIKE '"'"'%topic%'"'"' ORDER BY updated DESC LIMIT 100' --max-rows '100' --json
```

按任务选择审计队列：

```bash
siyuan-sisyphus search query-sql --stmt 'SELECT b.id, b.hpath, substr(b.content, 1, 80) AS preview, COUNT(*) AS indegree FROM refs r JOIN blocks b ON b.id = r.def_block_id WHERE COALESCE(b.name, '"'"''"'"') = '"'"''"'"' GROUP BY b.id, b.hpath, b.content ORDER BY indegree DESC LIMIT 100' --max-rows '100' --json
```
```bash
siyuan-sisyphus search query-sql --stmt 'SELECT name, COUNT(*) AS uses FROM blocks WHERE COALESCE(name, '"'"''"'"') != '"'"''"'"' GROUP BY name HAVING COUNT(*) > 1 ORDER BY uses DESC, name LIMIT 100' --max-rows '100' --json
```
```bash
siyuan-sisyphus search query-sql --stmt 'WITH RECURSIVE alias_parts(id, hpath, rest, alias_token) AS (SELECT id, hpath, replace(COALESCE(alias, '"'"''"'"'), '"'"'，'"'"', '"'"','"'"') || '"'"','"'"', '"'"''"'"' FROM blocks WHERE COALESCE(alias, '"'"''"'"') != '"'"''"'"' UNION ALL SELECT id, hpath, substr(rest, instr(rest, '"'"','"'"') + 1), trim(substr(rest, 1, instr(rest, '"'"','"'"') - 1)) FROM alias_parts WHERE rest != '"'"''"'"') SELECT lower(alias_token) AS normalized_alias, COUNT(DISTINCT id) AS uses, GROUP_CONCAT(DISTINCT id) AS block_ids FROM alias_parts WHERE alias_token != '"'"''"'"' GROUP BY lower(alias_token) HAVING COUNT(DISTINCT id) > 1 ORDER BY uses DESC, normalized_alias LIMIT 100' --max-rows '100' --json
```
```bash
siyuan-sisyphus search query-sql --stmt 'SELECT b.id, b.name, b.hpath, COUNT(*) AS indegree FROM refs r JOIN blocks b ON b.id = r.def_block_id GROUP BY b.id, b.name, b.hpath ORDER BY indegree DESC LIMIT 50' --max-rows '50' --json
```

SQL 结果是待审查候选，不是语义裁决。被引用、入度高或正文命中只能说明优先级，不能自动证明该块应成为知识原子。

## 二、编译知识原子

读取候选块及必要上下文，确认它满足以下条件：单块自包含、只表达一个可复用主张或操作、边界与适用版本清楚、脱离原文仍可理解。项目过程、来源登记、临时结论和长篇叙述不应强行原子化。

命名采用稳定命名空间和语义后缀；`name` 用于确定性解析，`alias` 保存逗号分隔的中文同义词。审计时必须先把英文逗号和中文逗号分隔的别名拆成单个词元并去除空白，不能对整串 `alias` 做 `GROUP BY`，也不能用 `LIKE '%词%'` 代替精确词元比较。写入前把建议名称和每个建议别名分别放入 `candidates`，同时检查两个字段：

```bash
siyuan-sisyphus search query-sql --stmt 'WITH RECURSIVE candidates(value) AS (VALUES ('"'"'proposed-name'"'"'), ('"'"'proposed-alias-1'"'"'), ('"'"'proposed-alias-2'"'"')), alias_parts(id, rest, alias_token) AS (SELECT id, replace(COALESCE(alias, '"'"''"'"'), '"'"'，'"'"', '"'"','"'"') || '"'"','"'"', '"'"''"'"' FROM blocks WHERE COALESCE(alias, '"'"''"'"') != '"'"''"'"' UNION ALL SELECT id, substr(rest, instr(rest, '"'"','"'"') + 1), trim(substr(rest, 1, instr(rest, '"'"','"'"') - 1)) FROM alias_parts WHERE rest != '"'"''"'"') SELECT DISTINCT b.id, b.name, b.alias, b.hpath FROM blocks b LEFT JOIN alias_parts a ON a.id = b.id WHERE lower(b.name) IN (SELECT lower(value) FROM candidates) OR lower(a.alias_token) IN (SELECT lower(value) FROM candidates) LIMIT 100' --max-rows '100' --json
```

没有冲突后，设置属性并按稳定块 ID 回读：

```bash
siyuan-sisyphus block set-attrs --id '<block-id>' --attrs-json '{"name":"stable-topic-step","alias":"中文同义词,替代说法"}' --json
```
```bash
siyuan-sisyphus block get-kramdown --id '<block-id>' --json
```

批量编译时先输出候选、建议名称、别名、理由和歧义风险。除非用户已经明确授权该批写入，否则不要直接落地语义命名。

## 三、专题中枢与数据库分工

- 知识中枢保存人工精选入口、块引用、适用范围和实时嵌入查询。
- 知识原子保存在原始上下文或专题操作库中，通过稳定块 ID 和 `name` 被复用。
- AV 保存来源、成熟度、状态、责任范围和人工审查队列；不要把 Markdown 表格或一段 SQL 代码冒充数据库。
- `/AGENTS.md` 只指向中枢和本 Skill，不复制原子枚举或统计结果。

专题中枢若已有 AV，先读取真实标识和视图，再更新行或单元格：

```bash
siyuan-sisyphus av get --id '<av-id>' --json
```
```bash
siyuan-sisyphus av render --id '<av-id>' --page '1' --page-size '100' --json
```

## 四、安全改名

`name` 是查询契约。先审计四层影响：块属性、引用锚文本、`query_embed` 硬编码模式、正文字面量副本，并从结果中的 `root_id` 汇总所有受影响文档。

```bash
siyuan-sisyphus search query-sql --stmt 'SELECT id, root_id, name, alias, hpath FROM blocks WHERE name = '"'"'old-name'"'"' LIMIT 100' --max-rows '100' --json
```
```bash
siyuan-sisyphus search query-sql --stmt 'SELECT r.block_id, b.root_id, r.content, b.hpath FROM refs r JOIN blocks b ON b.id = r.block_id WHERE r.def_block_id IN (SELECT id FROM blocks WHERE name = '"'"'old-name'"'"') LIMIT 200' --max-rows '200' --json
```
```bash
siyuan-sisyphus search query-sql --stmt 'SELECT id, root_id, hpath, markdown FROM blocks WHERE type = '"'"'query_embed'"'"' AND markdown LIKE '"'"'%old-name%'"'"' LIMIT 200' --max-rows '200' --json
```
```bash
siyuan-sisyphus search query-sql --stmt 'SELECT id, root_id, hpath, substr(markdown, 1, 200) AS preview FROM blocks WHERE type != '"'"'query_embed'"'"' AND markdown LIKE '"'"'%old-name%'"'"' LIMIT 200' --max-rows '200' --json
```

写入前报告每个受影响文档的 `root_id`、路径和计划修改数量。若用户先前的授权没有覆盖这份精确清单，必须再次取得明确授权；跨文档改名不得从单文档授权推断。随后为**每一个**受影响文档分别执行：

```bash
siyuan-sisyphus timeline create-node --name 'Before knowledge atom rename' --scope 'document' --document-id '<document-id>' --json
```

只有所有时间线节点都创建成功后才能逐项修改；任一文档无法建立恢复点时停止整批写入。修改后逐文档回读。不要只为一个入口文档建立快照，也不要只改块属性后假设引用、查询和副本会自动同步。

先用 `set_attrs` 更新定义块的 `name`。对引用锚文本、`query_embed` 和正文字面量副本，逐个稳定块 ID 读取完整 Kramdown，只替换已经审核的精确旧词元，再更新该单块并立即回读；不要对整篇文档做无边界替换：

```bash
siyuan-sisyphus block set-attrs --id '<definition-block-id>' --attrs-json '{"name":"new-name"}' --json
```
```bash
siyuan-sisyphus block get-kramdown --id '<affected-block-id>' --json
```
```bash
siyuan-sisyphus block update --id '<affected-block-id>' --data-type 'markdown' --data '<reviewed full single-block markdown with only the exact old token replaced>' --json
```
```bash
siyuan-sisyphus block get-kramdown --id '<affected-block-id>' --json
```

## 五、验证

写入或改名后重新执行精确查询，验证名称唯一、别名歧义可解释、专题中枢能够命中、引用和嵌入查询没有遗留旧名。报告实测结果与未覆盖范围，不用“成功”替代核验。

```bash
siyuan-sisyphus search query-sql --stmt 'WITH RECURSIVE alias_parts(id, rest, alias_token) AS (SELECT id, replace(COALESCE(alias, '"'"''"'"'), '"'"'，'"'"', '"'"','"'"') || '"'"','"'"', '"'"''"'"' FROM blocks WHERE id = '"'"'<block-id>'"'"' UNION ALL SELECT id, substr(rest, instr(rest, '"'"','"'"') + 1), trim(substr(rest, 1, instr(rest, '"'"','"'"') - 1)) FROM alias_parts WHERE rest != '"'"''"'"') SELECT b.id, b.name, b.alias, b.hpath FROM blocks b WHERE b.id = '"'"'<block-id>'"'"' AND lower(b.name) = lower('"'"'stable-topic-step'"'"') AND EXISTS (SELECT 1 FROM alias_parts a WHERE a.id = b.id AND lower(a.alias_token) = lower('"'"'中文同义词'"'"')) LIMIT 1' --max-rows '1' --json
```

---
name: siyuan-mcp-knowledge-governance
description: 思源知识治理工作流。用于把专题材料编译为带 name/alias 的知识原子，审计覆盖缺口与歧义，维护专题中枢，并安全处理跨引用改名。普通检索应使用 search-query，外部来源入库应使用 knowledge-ingest。
compatibility: "Requires a reachable SiYuan Sisyphus MCP server already registered in the client; installing this Skill alone does not configure the MCP endpoint or bearer token."
---

# 思源知识原子编译与治理 with MCP

把 `/AGENTS.md` 当作稳定路由表，不把专题原子清单、动态数量、一次性实验或兼容性结论写入全局记忆。专题事实进入对应知识中枢；可重复的治理步骤由本 Skill 执行；数量和冲突以实时 SQL 为准。

## 一、发现与候选队列

先读取工作区入口，再用专题词定位知识中枢和候选块。自然语言发现优先调用 `search.knowledge`；若去重前 3 名已出现带 `name`、路径明确且与任务一致的专题中枢或知识原子，立即按稳定 ID 读取该目标并停止目录级发现。只有候选歧义、偏题或未命名时，才继续全文或 SQL 定位。不要先遍历整个笔记本、展开上级目录、运行探索性 SQL 或无过滤渲染完整 AV：

```text
fs(action="read", path="/AGENTS.md", blockStart=0, blockLimit=80, tokenBudget=2000)
```
```text
search(action="knowledge", query="natural-language topic or project question", pageSize=10, candidateSize=30)
```
```text
search(action="fulltext", query="topic keyword", page=1, pageSize=20)
```
```text
search(action="query_sql", stmt="SELECT id, name, alias, hpath, substr(content, 1, 80) AS preview FROM blocks WHERE name LIKE '%topic%' OR alias LIKE '%topic%' ORDER BY updated DESC LIMIT 100", maxRows=100)
```

按任务选择审计队列：

```text
search(action="query_sql", stmt="SELECT b.id, b.hpath, substr(b.content, 1, 80) AS preview, COUNT(*) AS indegree FROM refs r JOIN blocks b ON b.id = r.def_block_id WHERE COALESCE(b.name, '') = '' GROUP BY b.id, b.hpath, b.content ORDER BY indegree DESC LIMIT 100", maxRows=100)
```
```text
search(action="query_sql", stmt="SELECT name, COUNT(*) AS uses FROM blocks WHERE COALESCE(name, '') != '' GROUP BY name HAVING COUNT(*) > 1 ORDER BY uses DESC, name LIMIT 100", maxRows=100)
```
```text
search(action="query_sql", stmt="WITH RECURSIVE alias_parts(id, hpath, rest, alias_token) AS (SELECT id, hpath, replace(COALESCE(alias, ''), '，', ',') || ',', '' FROM blocks WHERE COALESCE(alias, '') != '' UNION ALL SELECT id, hpath, substr(rest, instr(rest, ',') + 1), trim(substr(rest, 1, instr(rest, ',') - 1)) FROM alias_parts WHERE rest != '') SELECT lower(alias_token) AS normalized_alias, COUNT(DISTINCT id) AS uses, GROUP_CONCAT(DISTINCT id) AS block_ids FROM alias_parts WHERE alias_token != '' GROUP BY lower(alias_token) HAVING COUNT(DISTINCT id) > 1 ORDER BY uses DESC, normalized_alias LIMIT 100", maxRows=100)
```
```text
search(action="query_sql", stmt="SELECT b.id, b.name, b.hpath, COUNT(*) AS indegree FROM refs r JOIN blocks b ON b.id = r.def_block_id GROUP BY b.id, b.name, b.hpath ORDER BY indegree DESC LIMIT 50", maxRows=50)
```

SQL 结果是待审查候选，不是语义裁决。被引用、入度高或正文命中只能说明优先级，不能自动证明该块应成为知识原子。

## 二、编译知识原子

读取候选块及必要上下文，确认它满足以下条件：单块自包含、只表达一个可复用主张或操作、边界与适用版本清楚、脱离原文仍可理解。项目过程、来源登记、临时结论和长篇叙述不应强行原子化。

命名采用稳定命名空间和语义后缀。`name` 是全库唯一的确定性逻辑地址；`alias` 是自然语言召回词，真实同义、多义或跨专题同形时可以多命中，不得把它误当唯一键。alias 与现有 name 相撞、alias 多命中或 name 重复时必须显示候选并裁决，不得静默选取。

合法多义可用 `custom-anchor-scope` 声明受控解析范围；该属性允许英文逗号或中文逗号分隔多个值。只有当前上下文范围与候选 scope 相交且恰好命中一个候选时，才可自动解析；无命中或多候选相交都保持歧义。宽泛 alias 若有召回价值但污染编辑器虚拟引用，应保留 alias，并通过思源编辑器设置 `virtualBlockRefExclude` 抑制显示；`data/.siyuan/refsearchignore` 是反链 SQL 条件文件，不是 alias 词元排除清单，不得用于该目的。

审计时必须先把英文逗号和中文逗号分隔的别名拆成单个词元并去除空白，不能对整串 `alias` 做 `GROUP BY`，也不能用 `LIKE '%词%'` 代替精确词元比较。

`search.check_anchor` 只用于写入或修改 `name`/`alias` 前的碰撞预检，不是既有内容定位器。调用必须同时提供 `candidates` 数组与 `candidateKind`；任何 `validation_error` 都表示预检没有执行，绝不能报告为 `available`、缺失或通过。写入前分别检查建议 name 与每个建议 alias：

```text
search(action="check_anchor", candidates=["proposed-name"], candidateKind="name", excludeBlockIds=["<block-id>"])
```
```text
search(action="check_anchor", candidates=["proposed-alias-1","proposed-alias-2"], candidateKind="alias", excludeBlockIds=["<block-id>"], activeScopes=["<current-topic-scope>"])
```

没有冲突后，设置属性并按稳定块 ID 回读：

```text
block(action="set_attrs", id="<block-id>", attrs={"name":"stable-topic-step","alias":"中文同义词,替代说法"})
```
```text
block(action="get_kramdown", id="<block-id>")
```

批量编译时先输出候选、建议名称、别名、理由和歧义风险。除非用户已经明确授权该批写入，否则不要直接落地语义命名。

## 三、专题中枢与数据库分工

- 知识中枢保存人工精选入口、块引用、适用范围和实时嵌入查询。
- 知识原子保存在原始上下文或专题操作库中，通过稳定块 ID 和 `name` 被复用。
- AV 保存来源、成熟度、状态、责任范围和人工审查队列；不要把 Markdown 表格或一段 SQL 代码冒充数据库。
- `/AGENTS.md` 只指向中枢和本 Skill，不复制原子枚举或统计结果。

专题中枢若已有 AV，先用 `ignoreRows=true` 读取字段结构，再以 `query` 或主键接口定位目标行并窄化渲染，最后更新行或单元格；禁止无过滤全量渲染：

```text
av(action="get", id="<av-id>")
```
```text
av(action="render", id="<av-id>", page=1, pageSize=10, query="<target row keyword>")
```

## 四、安全改名

`name` 是查询契约。先审计四层影响：块属性、引用锚文本、`query_embed` 硬编码模式、正文字面量副本，并从结果中的 `root_id` 汇总所有受影响文档。

```text
search(action="query_sql", stmt="SELECT id, root_id, name, alias, hpath FROM blocks WHERE name = 'old-name' LIMIT 100", maxRows=100)
```
```text
search(action="query_sql", stmt="SELECT r.block_id, b.root_id, r.content, b.hpath FROM refs r JOIN blocks b ON b.id = r.block_id WHERE r.def_block_id IN (SELECT id FROM blocks WHERE name = 'old-name') LIMIT 200", maxRows=200)
```
```text
search(action="query_sql", stmt="SELECT id, root_id, hpath, markdown FROM blocks WHERE type = 'query_embed' AND markdown LIKE '%old-name%' LIMIT 200", maxRows=200)
```
```text
search(action="query_sql", stmt="SELECT id, root_id, hpath, substr(markdown, 1, 200) AS preview FROM blocks WHERE type != 'query_embed' AND markdown LIKE '%old-name%' LIMIT 200", maxRows=200)
```

写入前报告每个受影响文档的 `root_id`、路径和计划修改数量。若用户先前的授权没有覆盖这份精确清单，必须再次取得明确授权；跨文档改名不得从单文档授权推断。随后为**每一个**受影响文档分别执行：

```text
timeline(action="create_node", name="Before knowledge atom rename", scope="document", documentId="<document-id>")
```

只有所有时间线节点都创建成功后才能逐项修改；任一文档无法建立恢复点时停止整批写入。修改后逐文档回读。不要只为一个入口文档建立快照，也不要只改块属性后假设引用、查询和副本会自动同步。

先用 `set_attrs` 更新定义块的 `name`。对引用锚文本、`query_embed` 和正文字面量副本，逐个稳定块 ID 读取完整 Kramdown，只替换已经审核的精确旧词元，再更新该单块并立即回读；不要对整篇文档做无边界替换：

```text
block(action="set_attrs", id="<definition-block-id>", attrs={"name":"new-name"})
```
```text
block(action="get_kramdown", id="<affected-block-id>")
```
```text
block(action="update", id="<affected-block-id>", dataType="markdown", data="<reviewed full single-block markdown with only the exact old token replaced>")
```
```text
block(action="get_kramdown", id="<affected-block-id>")
```

## 五、验证

写入或改名后重新执行精确查询，验证名称唯一、别名歧义可解释、专题中枢能够命中、引用和嵌入查询没有遗留旧名。报告实测结果与未覆盖范围，不用“成功”替代核验。

```text
search(action="query_sql", stmt="WITH RECURSIVE alias_parts(id, rest, alias_token) AS (SELECT id, replace(COALESCE(alias, ''), '，', ',') || ',', '' FROM blocks WHERE id = '<block-id>' UNION ALL SELECT id, substr(rest, instr(rest, ',') + 1), trim(substr(rest, 1, instr(rest, ',') - 1)) FROM alias_parts WHERE rest != '') SELECT b.id, b.name, b.alias, b.hpath FROM blocks b WHERE b.id = '<block-id>' AND lower(b.name) = lower('stable-topic-step') AND EXISTS (SELECT 1 FROM alias_parts a WHERE a.id = b.id AND lower(a.alias_token) = lower('中文同义词')) LIMIT 1", maxRows=1)
```

---
name: siyuan-sisyphus-cross-project-relation-closure
description: CLI-only 思源跨项目方法复用关系闭合工作流。用于审计并建立研究项目到公共方法原子的真实复用关系；不用于项目内语义边、name/alias 日常治理或公共方法原子迁移。
compatibility: "Requires the maintained siyuan-sisyphus CLI to be installed and configured for the target SiYuan workspace."
---

# 思源跨项目方法复用关系闭合 with the CLI

## Resolve the CLI entry first

Before the first SiYuan CLI call in every new session, verify that the local command is available:

```bash
command -v siyuan-sisyphus
siyuan-sisyphus --version
```

If the command is missing, resolve a locally installed or user-provided maintained CLI entry before continuing. Do not use `npx` as an implicit fallback. A public npm package may lag the locally maintained plugin and silently omit custom actions or safety contracts.

After resolving the entry, start with the read-only live bootstrap:

```bash
siyuan-sisyphus system bootstrap --json
```

本工作流只维护“研究项目 → /04 公共方法知识原子”的真实语义关系。中枢收录、文字提及、虚拟引用、项目内语义边和跨项目复用必须分别统计。

## 一、开工与候选

先读取实时能力、工作区规则和《知识编译契约》：

```bash
siyuan-sisyphus system bootstrap --json
```
```bash
siyuan-sisyphus fs read --path '/AGENTS.md' --block-start '0' --block-limit '80' --token-budget '3000' --json
```
```bash
siyuan-sisyphus fs read --path '/USER_RULES.md' --block-start '0' --block-limit '80' --token-budget '2000' --json
```
```bash
siyuan-sisyphus fs read --path '/工作日志/00 导航与说明/知识编译契约' --block-start '0' --block-limit '100' --token-budget '8000' --json
```

从项目中枢的正式引用解析研究项目入口，不把过程笔记或子文档误当独立项目。公共方法目标限定于 `/04 研究方法与数字工具` 下具有唯一 name、完整内容、现行验证状态且未被接替的可复用原子。

`custom-reuse-scope=public-candidate` 只是项目编译阶段留下的治理候选，不是公共方法原子。候选仍位于项目目录、需要创建/合并/迁移公共原子，或 name/alias/scope 存在歧义时，只列入待裁清单并交给 knowledge-governance，不得自动建立跨项目边。

## 二、证据与关系类型

完整读取项目入口及必要的方法上下文。先用 name/alias 精确定位公共原子，只有精确通道不能解决时才用 knowledge 发现候选。语义相似和关键词共现不能证明复用；若项目有已登记来源映射，只读核对已经定位的脚本、配置、参数、输入输出和版本，不得自动注册、扩大扫描或修改本地文件。

只允许三类关系：

- `active-reuse`：当前项目实际使用目标方法的核心操作、接口或判断规则；
- `compatibility-reference`：只能确认同一方法体系的兼容、迁移或边界参考；
- `historical-compatibility`：过去使用过，但当前路径已废弃、被替代或不再作为依据。

概念类比、可能借鉴或关系类型冲突一律待裁。

## 三、A/B 分类与写入

A 类自动写入必须同时满足：目标唯一且现行；项目有明确使用证据；输入、输出、关键调用、参数或判断规则相符；关系类型唯一；没有同义重复边；不需要新建、改名、移动、合并、接替或改写既有关系。

每条边使用独立关系块，只引用一个公共方法原子，正文说明项目实际应用、实现差异、适用边界与未验证部分，并声明关系不自动提升项目统计结论的验证状态：

```bash
siyuan-sisyphus timeline create-node --name '跨项目关系闭合前恢复点-<date>' --scope 'document' --document-id '<project-document-id>' --json
```
```bash
siyuan-sisyphus block append --parent-id '<project-document-id>' --data-type 'markdown' --data '**关系：active-reuse。** 本项目实际复用 ((<method-atom-id> '"'"'public-method-name'"'"')) 所规定的规则；项目实现差异与适用边界是……。该关系不自动提升项目统计结论的验证状态。' --json
```
```bash
siyuan-sisyphus block set-attrs --id '<relation-block-id>' --attrs-json '{"custom-relation-kind":"active-reuse"}' --json
```

任一目标文档恢复点失败即停止整批写入。只做块级增量修改；严格写入按实时 action schema 执行。追加只执行一次，取得稳定块 ID 后再设置 `custom-relation-kind`。

以下均为 B 类：只有语义相似；目标或 scope 歧义；项目证据不足；需要公共化候选迁移；需要修改/删除既有关系；关系类型冲突；目标 historical/deprecated/failed/被接替；读取不完整或来源不可用。

## 四、验收

```bash
siyuan-sisyphus block get-kramdown --id '<relation-block-id>' --json
```
```bash
siyuan-sisyphus search query-sql --stmt 'SELECT r.block_id, r.def_block_id, b.root_id, b.hpath FROM refs r JOIN blocks b ON b.id = r.block_id WHERE r.block_id = '"'"'<relation-block-id>'"'"' AND r.def_block_id = '"'"'<method-atom-id>'"'"' LIMIT 20' --max-rows '20' --json
```
```bash
siyuan-sisyphus search get-backlinks --id '<method-atom-id>' --mode 'both' --json
```
```bash
siyuan-sisyphus search knowledge --query '哪些研究项目实际使用了这个方法？' --page-size '10' --candidate-size '30' --json
```

逐边确认正文、属性、refs、反向链接、无重复边和目标唯一性。代表性自然语言问题中，方法应进入去重后前 10，项目应能通过引用折叠或反向链接被发现。若语义索引尚未更新但 refs 和反向链接已通过，只报告“结构关系已建立，语义索引待更新”。

统计 `reuse_indegree` 时排除中枢、目录索引、纯编目边和项目内语义边。相同输入复跑不得新增重复关系块。最终报告项目范围、完整审计数、自动新增数、幂等跳过、待裁、失败、恢复点及逐边验收证据。

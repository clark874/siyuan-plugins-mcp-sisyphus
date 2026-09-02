---
name: siyuan-sisyphus-project-knowledge-compile
description: CLI-only 思源研究项目知识编译工作流。用于把本地项目全量文件包编译为可追溯知识原子、项目内语义关系与公共方法候选；不用于外部网页摄取、普通编辑或跨项目复用关系写入。
compatibility: "Requires the maintained siyuan-sisyphus CLI to be installed and configured for the target SiYuan workspace."
---

# 思源研究项目知识编译 with the CLI

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

本工作流处理“本地研究项目全量文件包 → 思源知识化”。外部网页、教程或发布说明的差量摄取应交给 knowledge-ingest；既有原子的 name/alias 治理和安全改名应交给 knowledge-governance；跨项目实际复用关系由 cross-project-relation-closure 独立执行。

## 一、开工与范围账本

依次读取实时能力、工作区入口、用户规则和《知识编译契约》：

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

先建立项目对象账本，覆盖项目根、正式交付物、脚本、输入、输出、配置、文档、历史版本、符号链接、受限数据与排除项。状态只能按“已发现 → 已完整读取 → 已编译/明确排除 → 已回读验证”推进。文件名、标题、哈希、目录层级或抽样读取不能替代完整读取。

若项目已经登记本地来源映射，先列出登记项，再只读已进入清单且明确定位的文件：

```bash
siyuan-sisyphus file list-project-sources --page '1' --page-size '20' --json
```
```bash
siyuan-sisyphus file read-project-source --project-id '<registered-project-id>' --relative-path '<manifest-relative-path>' --offset '0' --limit '12000' --json
```

不得自动登记新项目源、扫描整个目录、扩大清单或修改本地文件。来源映射不可用时，报告缺口；不要把未读取文件记为已覆盖。

## 二、编译计划与证据边界

用知识检索定位既有项目中枢，读取完整中枢和必要上下文；命中只当候选：

```bash
siyuan-sisyphus search knowledge --query '<project name> 项目中枢' --page-size '10' --candidate-size '30' --json
```

逐项决定形成哪类原子：

- `summary`：项目、子线或方法概览；
- `recipe`：可复用操作流程；
- `evidence`：统计结果或原始证据；
- `decision`：项目选择及理由；
- `warning`：失败方案、版本冲突或适用边界。

每个原子必须单块自包含、来源范围明确、验证状态与证据一致。统计主张必须核对“脚本 → 输出 → 样本定义/阈值 → 叙述”；未核对不得提升为 evidence-verified。机器哈希、revision 和编译时间不得手填。

## 三、寻址与公共方法接口

项目特定原子使用项目命名空间；name 必须全库唯一。alias 只在存在真实自然语言召回价值时填写，写入前逐词元碰撞预检；alias 是发现接口，不是块引用或复用关系。

```bash
siyuan-sisyphus search check-anchor --candidates-json '["project-step"]' --candidate-kind 'name' --exclude-block-ids-json '["<block-id>"]' --json
```
```bash
siyuan-sisyphus search check-anchor --candidates-json '["自然语言召回词"]' --candidate-kind 'alias' --exclude-block-ids-json '["<block-id>"]' --active-scopes-json '["<project-scope>"]' --json
```

原子若具备项目无关的输入、输出、操作和边界，且可能被其他项目复用，可设置 `custom-reuse-scope=public-candidate` 并写明候选理由。该标记只表示待治理候选，不得据此：

- 宣称已经形成公共方法原子；
- 自动移动到 `/04 研究方法与数字工具`；
- 用宽泛 alias 代替公共化；
- 自动建立跨项目关系。

正式公共化须由 knowledge-governance 裁决：在公共方法区创建、合并或指定唯一现行原子，保留项目实现差异和历史边界；随后再由 cross-project-relation-closure 建立项目复用边。

## 四、项目内语义关系闭合

中枢→原子的收录是编目边，不是语义边。知识原子编译完成后，审计是否存在能够回答“如何产出、由何证据支持、受何约束、实现何方法、属于何子线”的真实关系。只允许以下五类有向关系：

| `custom-relation-kind` | 方向 | 含义 |
| --- | --- | --- |
| `produced-by` | evidence/output → recipe/process | 该证据或产物由目标流程生成 |
| `supports` | evidence → decision/claim | 该证据支持目标决策或主张，但不自动证明因果 |
| `constrained-by` | recipe/claim → warning/constraint | 该操作或主张受目标边界约束 |
| `implements` | project implementation → method | 项目实现了目标方法，并保留实现差异 |
| `part-of` | subline/subproject → project overview | 该子线属于目标项目结构 |

不自动建立“现状关联”“相关于”“概念相似”等方向含混的关系；不把所有文字提及变成引用，不建无实际语义的 evidence↔evidence 网，不重复中枢已有的纯导航边。

每条边使用一个独立关系块，只承载一个目标原子。正文必须写出关系类型、事实依据、差异或边界，并使用真实块引用；随后设置关系属性：

```bash
siyuan-sisyphus block append --parent-id '<source-atom-id>' --data-type 'markdown' --data '**关系：produced-by。** 本证据由 ((<target-atom-id> '"'"'target-method-name'"'"')) 所述流程产生；实现差异与适用边界是……。该关系不自动提升统计结论的验证状态。' --json
```
```bash
siyuan-sisyphus block set-attrs --id '<relation-block-id>' --attrs-json '{"custom-relation-kind":"produced-by"}' --json
```

关系只确认知识组织事实，不自动提升源原子、目标原子或项目结论的验证状态。

## 五、可恢复写入

每个受影响文档先建立文档级时间线节点。任一恢复点失败即停止整批写入：

```bash
siyuan-sisyphus timeline create-node --name '项目知识编译前恢复点-<date>' --scope 'document' --document-id '<document-id>' --json
```

只做稳定块 ID 下的追加、插入、单块更新与属性设置；禁止整篇覆写含 name、alias、custom-*、引用、AV 或 query_embed 的文档。严格写入模式下，按实时 action schema 区分 guarded 与 request-id-only 协议；追加类写入只执行一次，失败后先按返回的稳定 ID 或正文标识查找孤儿块，不得盲目重试。

## 六、Agent 会话溯源

写入前在发起知识化的 Agent 进程中捕获当前会话。优先使用客户端注入的会话环境变量或会话上下文；MCP 服务端不能按“最新文件”推断调用方。用户显式提供的会话标记为 `explicit`。只有确认没有并发会话时才可使用最近 rollout 兼容路径，并必须保留 `inferred_latest_rollout` 标记和风险提示。

客户端未注入会话变量时（ZCode 当前即为此类），先按下面的调用获取本机最近 rollout 候选，结合本会话发起时间与 recentlyActive 标记选定真实 sessionId；无法排除并发会话时按 `inferred_latest_rollout` 登记并保留误配警告。禁止自拟描述性字符串充当 sessionId：注册接口会对本机会话即时校验，描述性 ID 将触发告警。

```bash
siyuan-sisyphus provenance discover-session --provider 'zcode' --limit '10' --json
```

通过 Agent Kit 安装的本地客户端可执行 `node ~/.siyuan-sisyphus/bin/capture-agent-session.cjs`。命令未发现会话时应停止并请求显式会话标识。Hermes 优先读取 HERMES_SESSION_ID。`--provider zcode --infer-latest` 仅是经确认后的兼容路径。

交互式知识化把当前会话同时作为 `sourceSession` 和 `compileSession`。定时编译或跨 Agent 转交必须分别记录原始讨论会话与执行编译会话；原始来源未知时留待补录，不得用编译会话冒充来源会话。

原子和关系块完成后，以同一个稳定 `eventId` 登记一次知识化事件：

```bash
siyuan-sisyphus provenance record-event --project-block-id '<project-hub-block-id>' --project-id '<registered-project-id>' --event-id '<stable-event-id>' --operation 'project-knowledge-compile' --source-session-json '{"provider":"codex","sessionId":"<source-session-id>","hostAlias":"local","captureMethod":"environment"}' --compile-session-json '{"provider":"codex","sessionId":"<compile-session-id>","hostAlias":"local","captureMethod":"environment"}' --target-atom-ids-json '["<atom-id>","<relation-block-id>"]' --json
```

随后按项目与代表性原子回读。只有 `linkCapability=native` 才能表述为客户端原生深链；`launcher` 和 `resume_command` 必须保留能力分级：

```bash
siyuan-sisyphus provenance list-project-sessions --project-id '<registered-project-id>' --validate --limit '100' --json
```
```bash
siyuan-sisyphus provenance list-atom-events --atom-id '<atom-id>' --limit '100' --json
```

## 七、验收与幂等

逐项回读原子和关系块，并验证：

```bash
siyuan-sisyphus block get-kramdown --id '<relation-block-id>' --json
```
```bash
siyuan-sisyphus search query-sql --stmt 'SELECT r.block_id, r.def_block_id, b.root_id, b.hpath FROM refs r JOIN blocks b ON b.id = r.block_id WHERE r.block_id = '"'"'<relation-block-id>'"'"' AND r.def_block_id = '"'"'<target-atom-id>'"'"' LIMIT 20' --max-rows '20' --json
```
```bash
siyuan-sisyphus search get-backlinks --id '<target-atom-id>' --mode 'both' --json
```
```bash
siyuan-sisyphus search knowledge --query '这项证据通过什么方法产生？' --page-size '10' --candidate-size '30' --active-scopes-json '["<project-scope>"]' --json
```

完成门：

1. 范围分母、完整读取、排除、失败和截断均有账本；
2. 原子具备唯一 name、合格内容、来源清单和真实验证状态；
3. 中枢收录、项目内语义边、跨项目复用边分别统计；
4. 每条项目内关系有独立关系块、规范类型、真实 refs 边和反向链接；
5. 代表性“证据如何产生”“决策为何作出”问题能在前 10 结果或引用折叠中发现双方；
6. 相同输入复跑不增加重复原子、关系块或 AV 行；
7. public-candidate 只列入待治理清单，不虚报公共化或跨项目闭合。
8. 知识化事件能够反查来源/编译会话，项目会话列表明确 provider、captureMethod、linkCapability 与验证状态。

最终报告必须列出范围总数、已完整读取数、原子数、项目内关系数、公共候选数、排除/冲突/失败、恢复点、回读、refs、反向链接、检索复测和未完成项。

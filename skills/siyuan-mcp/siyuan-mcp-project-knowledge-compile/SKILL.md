---
name: siyuan-mcp-project-knowledge-compile
description: 思源研究项目知识编译工作流。用于把已授权项目增量或全量文件包保存为可追溯资料与知识原子、项目内语义关系与公共方法候选；不用于外部网页摄取、普通编辑或跨项目复用关系写入。
compatibility: "优先使用已连接的 SiYuan Sisyphus MCP；无 MCP 时按随包 CLI 后备规程使用已有本机入口。技能安装与 MCP 连接配置分别回验。"
---

# 思源研究项目知识编译 with MCP

本工作流处理“已授权的项目增量或本地研究项目全量文件包 → 思源资料与知识接续”。项目中的“更新思源笔记”先判断整合收益。资料需要组织、问题反复出现、跨项目复用或多版裁决满足任一时启动；一次性简单记录走既有资料保存和状态路径。尚未编译的来源不能写成 excluded。先读资料录入与接续契约的批次协议，比较已覆盖来源版本和待续接批次；无差量且无待办则零写入。用户指定的全文先保真保存。全量编译完整核对范围账本，日常只处理实际增量。外部网页、教程或发布说明交给 knowledge-ingest；既有名称治理交给 knowledge-governance；有实际复用证据时按 cross-project-relation-closure 的规则维护公共方法连接。

## 一、开工与范围账本

依次读取实时能力、工作区入口、用户规则和《知识编译契约》：

```text
system(action="bootstrap")
```
```text
fs(action="read", path="/AGENTS.md", blockStart=0, blockLimit=80, tokenBudget=3000)
```
```text
fs(action="read", path="/USER_RULES.md", blockStart=0, blockLimit=80, tokenBudget=2000)
```
```text
fs(action="read", path="/工作日志/00 导航与说明/知识编译契约", blockStart=0, blockLimit=100, tokenBudget=8000)
```

先建立项目对象账本，覆盖项目根、正式交付物、脚本、输入、输出、配置、文档、历史版本、符号链接、受限数据与排除项。状态只能按“已发现 → 已完整读取 → 已编译/明确排除 → 已回读验证”推进。文件名、标题、哈希、目录层级或抽样读取不能替代完整读取。

若项目已经登记本地来源映射，先列出登记项，再只读已进入清单且明确定位的文件：

```text
file(action="list_project_sources", page=1, pageSize=20)
```
```text
file(action="read_project_source", projectId="<registered-project-id>", relativePath="<manifest-relative-path>", offset=0, limit=12000)
```

不得自动登记新项目源、扫描整个目录、扩大清单或修改本地文件。来源映射不可用时，报告缺口；不要把未读取文件记为已覆盖。

## 二、编译计划与证据边界

用知识检索定位既有项目中枢，读取完整中枢和必要上下文；命中只当候选：

```text
search(action="knowledge", query="<project name> 项目中枢", pageSize=10, candidateSize=30)
```

新写入首选以下五类，优先复用完整原子。历史类型与教学卡保持可读，不设机械字数门槛，不按版本逐项拆卡：

- `summary`：项目、子线或方法概览；
- `recipe`：可复用操作流程；
- `evidence`：统计结果或原始证据；
- `decision`：项目选择及理由；
- `warning`：失败方案、版本冲突或适用边界。

每个原子必须单块自包含、来源范围明确、验证状态与证据一致。在正文原子块设置 `name`、有实际召回用途的 `alias`、`custom-atom-type`、`custom-verification-status` 、`custom-knowledge-project-id` 和 `custom-knowledge-workstream`；用 `custom-source-hash` 或 `custom-source-revision` 保存实际来源版本，`custom-source-range` 标明章节或行。正文同时保留可打开的原文块引用。统计主张必须核对“脚本 → 输出 → 样本定义/阈值 → 叙述”；未核对不得提升为 evidence-verified。机器哈希、revision 和编译时间不得手填。

## 三、寻址与公共方法接口

项目特定原子使用项目命名空间；name 必须全库唯一。alias 只在存在真实自然语言召回价值时填写，写入前逐词元碰撞预检；alias 是发现接口，不是块引用或复用关系。

```text
search(action="check_anchor", candidates=["project-step"], candidateKind="name", excludeBlockIds=["<block-id>"])
```
```text
search(action="check_anchor", candidates=["自然语言召回词"], candidateKind="alias", excludeBlockIds=["<block-id>"], activeScopes=["<project-scope>"])
```

原子若具备项目无关的输入、输出、操作和边界，且可能被其他项目复用，可设置 `custom-reuse-scope=public-candidate` 并写明候选理由。该标记只表示待治理候选，不得据此：

- 宣称已经形成公共方法原子；
- 自动移动到 `/04 研究方法与数字工具`；
- 用宽泛 alias 代替公共化；
- 自动建立跨项目关系。

正式公共化须由 knowledge-governance 裁决：在公共方法区创建、合并或指定唯一现行原子，保留项目实现差异和历史边界；随后再由 cross-project-relation-closure 建立项目复用边。

## 四、项目内语义关系闭合

中枢→原子的收录是编目边，不是语义边。知识原子编译完成后，审计是否存在能够回答“如何产出、由何证据支持、受何约束、实现何方法、属于何子线”的真实关系。新写入首选五类有向关系，旧类型保持原意，不将兼容性引用等同实际复用或自动退休：

| `custom-relation-kind` | 方向 | 含义 |
| --- | --- | --- |
| `produced-by` | evidence/output → recipe/process | 该证据或产物由目标流程生成 |
| `supports` | evidence → decision/claim | 该证据支持目标决策或主张，但不自动证明因果 |
| `constrained-by` | recipe/claim → warning/constraint | 该操作或主张受目标边界约束 |
| `supersedes` | 新原子 → 旧原子 | 有来源和范围依据的接替声明，不提升权威或验证等级 |
| `reuses` | 项目实现 → 复用方法 | 有实际使用依据，保留输入、实现差异和边界 |

同节相邻内容可直接正文引用，但相邻不能代替真实证据和约束。仅在改变后续读什么、边界或版本判断时建独立关系，禁止“延续执行”形式边。

不自动建立“现状关联”“相关于”“概念相似”等方向含混的关系；不把所有文字提及变成引用，不建无实际语义的 evidence↔evidence 网，不重复中枢已有的纯导航边。

每条边使用一个独立关系块。正文真实引用源原子和目标原子，并写明事实依据、差异或边界。随后同批设置关系类型与两端点属性。历史关系仅在两端经核实后补标；已有关系失效时保留原块并标记退出当前网络。不能从父块位置或引用顺序猜方向：

```text
block(action="append", parentID="<project-knowledge-document-id>", dataType="markdown", data="((<source-atom-id> '证据')) 由 ((<target-atom-id> '流程')) 产生。说明来源、实现差异与适用范围。")
```
```text
block(action="set_attrs", id="<relation-block-id>", attrs={"custom-relation-kind":"produced-by","custom-relation-from-id":"<source-atom-id>","custom-relation-to-id":"<target-atom-id>"})
```

关系只确认知识组织事实，不自动提升源原子、目标原子或项目结论的验证状态。

## 五、可恢复写入

为本批要修改的每个既有文档先建立文档级时间线节点；任一恢复点失败即停止这批既有内容修改。纯新增资料不适用既有文档恢复点，按录入契约先查重、保存并回读，不为未修改的中枢建快照；不要把纯资料保存升级为完整编译任务：

```text
timeline(action="create_node", name="项目知识编译前恢复点-<date>", scope="document", documentId="<document-id>")
```

只做稳定块 ID 下的追加、插入、单块更新与属性设置；禁止整篇覆写含 name、alias、custom-*、引用、AV 或 query_embed 的文档。严格写入模式下，按实时 action schema 区分 guarded 与 request-id-only 协议；追加类写入只执行一次，失败后先按返回的稳定 ID 或正文标识查找孤儿块，不得盲目重试。

## 六、Agent 会话溯源

写入前在发起知识化的 Agent 进程中捕获当前会话。优先使用客户端注入的会话环境变量或会话上下文；MCP 服务端不能按“最新文件”推断调用方。用户显式提供的会话标记为 `explicit`。只有确认没有并发会话时才可使用最近 rollout 兼容路径，并必须保留 `inferred_latest_rollout` 标记和风险提示。

客户端未注入会话变量时（ZCode 当前即为此类），先按下面的调用获取本机最近 rollout 候选，结合本会话发起时间与 recentlyActive 标记选定真实 sessionId；无法排除并发会话时按 `inferred_latest_rollout` 登记并保留误配警告。禁止自拟描述性字符串充当 sessionId：注册接口会对本机会话即时校验，描述性 ID 将触发告警。

```text
provenance(action="discover_session", provider="zcode", limit=10)
```

通过 Agent Kit 安装的本地客户端可执行 `node ~/.siyuan-sisyphus/bin/capture-agent-session.cjs`。命令未发现会话时应停止并请求显式会话标识。Hermes 优先读取 HERMES_SESSION_ID。`--provider zcode --infer-latest` 仅是经确认后的兼容路径。

交互式知识化把当前会话同时作为 `sourceSession` 和 `compileSession`。定时编译或跨 Agent 转交必须分别记录原始讨论会话与执行编译会话；原始来源未知时留待补录，不得用编译会话冒充来源会话。`record_event` 不再隐式登记会话，因此必须先分别登记两个真实会话并回读确认；两者相同时只登记一次：

```text
provenance(action="register_session", projectBlockId="<project-hub-block-id>", projectId="<registered-project-id>", session={"provider":"codex","sessionId":"<source-session-id>","hostAlias":"local","captureMethod":"environment"}, occurredAt="<source-session-time>")
```
```text
provenance(action="register_session", projectBlockId="<project-hub-block-id>", projectId="<registered-project-id>", session={"provider":"codex","sessionId":"<compile-session-id>","hostAlias":"local","captureMethod":"environment"}, occurredAt="<compile-session-time>")
```
```text
provenance(action="list_project_sessions", projectId="<registered-project-id>", validate=true, limit=100)
```

先回读原子、关系两端及真实引用，再用账本的 `batchId` 作为 `eventId` 登记唯一知识事件。协调器复用同一事件回执：

```text
provenance(action="record_event", projectBlockId="<project-hub-block-id>", projectId="<registered-project-id>", eventId="<stable-event-id>", operation="project-knowledge-compile", workstream="<project-workstream>", sourceSession={"provider":"codex","sessionId":"<source-session-id>","hostAlias":"local","captureMethod":"environment"}, compileSession={"provider":"codex","sessionId":"<compile-session-id>","hostAlias":"local","captureMethod":"environment"}, targetAtomIds=["<atom-id>","<relation-block-id>"])
```

随后按项目与代表性原子回读。会话登记后若列表尚未刷新，先按回执的会话块 ID 核对，再等待索引并重读列表；同一会话无需重建。只有 `linkCapability=native` 才能表述为客户端原生深链；`launcher` 和 `resume_command` 必须保留能力分级：

```text
provenance(action="list_project_sessions", projectId="<registered-project-id>", validate=true, limit=100)
```
```text
provenance(action="list_atom_events", atomId="<atom-id>", limit=100)
```

## 七、验收与幂等

逐项回读原文副本、原子和关系块，分别报告全文保存、知识编译和项目接续的实际状态。新裁决已获批准时同步当前状态和资源入口，保留旧事件。强验证状态附可回读的 custom-verification-evidence；缺少依据时保留 draft 或 source-checked。并验证：

```text
block(action="get_kramdown", id="<relation-block-id>")
```
```text
search(action="query_sql", stmt="SELECT r.block_id, r.def_block_id, b.root_id, b.hpath FROM refs r JOIN blocks b ON b.id = r.block_id WHERE r.block_id = '<relation-block-id>' AND r.def_block_id = '<target-atom-id>' LIMIT 20", maxRows=20)
```
```text
search(action="get_backlinks", id="<target-atom-id>", mode="both")
```
```text
search(action="knowledge", query="这项证据通过什么方法产生？", pageSize=10, candidateSize=30, activeScopes=["<project-scope>"])
```

完成门：

1. 范围分母、完整读取、排除、失败和截断均有账本；
2. 原子具备唯一 name、合格内容、来源清单和真实验证状态；
3. 中枢收录、项目内语义边、跨项目复用边分别统计；
4. 每条项目内关系有独立关系块、规范类型、真实 refs 边和反向链接；
5. 代表性“证据如何产生”“决策为何作出”问题能从正常入口发现双方，按分页和实际召回核读，不预设前 10 项；
6. 相同输入复跑不增加重复原子、关系块或 AV 行；
7. public-candidate 只列入待治理清单，不虚报公共化或跨项目闭合。
8. 知识化事件能够反查来源/编译会话，项目会话列表明确 provider、captureMethod、linkCapability 与验证状态。

最终报告必须列出范围总数、已完整读取数、原子数、项目内关系数、公共候选数、排除/冲突/失败、恢复点、回读、refs、反向链接、检索复测和未完成项。

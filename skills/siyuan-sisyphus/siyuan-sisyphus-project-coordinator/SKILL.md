---
name: siyuan-sisyphus-project-coordinator
description: CLI-only 思源多 Agent 项目协同工作流。仅在用户明确调用“启动”“交接”“知识化”或“收尾”时，读取或维护共享项目记忆。
compatibility: "Requires the maintained siyuan-sisyphus CLI to be installed and configured for the target SiYuan workspace."
---

# 思源多 Agent 项目协调 with the CLI

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

本 Skill 的中文可见名称是“项目协同”，底层稳定标识仍为英文。只在用户明确调用时运行，公开命令只有“启动”“交接”“知识化”“收尾”。未被明确调用时，不读取或写入项目进度。用户不需要知道 projectId、块 ID 或知识流程名称。

## 一、公开交互

- `启动`：识别项目、登记当前真实会话、读取全部当前进度，并输出详细“项目进度全景”；附带任务时，在全景之后继续执行任务。
- `交接`：随时重新读取真实数据并输出同规格“项目进度全景”；除必要的当前会话登记外，不写进度、状态或知识。
- `知识化`：只处理本轮可长期复用的决策、方法、证据、警告和否决结论；不代替收尾，不生成普通进度事件。
- `收尾`：先执行知识化判断，再登记从本次启动到收尾之间的非重复工作差量、更新状态投影，最后输出“本轮差量 + 更新后的项目进度全景”。

四个命令可以附带自然语言任务或范围。`启动`和`交接`的详细输出是面向用户的实时视图，只出现在响应中；不得另建交接文档，也不得把知识正文复制到进度页。

执行 `启动`、`交接`或`收尾`前，必须完整读取 [项目全景输出契约](references/project-panorama-output-contract.md)，严格使用其中的来源优先级、项目归属门、固定九节模板、默认隐藏项和输出前自检。不得依据本 Skill 中的字段枚举自由组织报告。

## 二、固定数据边界

项目中枢下最多有一个带 `custom-progress-role=project-progress-page` 和当前 `custom-progress-project-id` 的“项目进度协作”页。标题只用于人类阅读，属性才是机器定位契约。页面包含：项目概览、阶段台账、权威产物索引三个稳定投影，一个当前项目状态块、每条工作线一个状态块、普通进度事件追加区，以及“最近登记”“本项目知识产物”两个 `query_embed` 只读投影。“最近登记”按块创建时间展示追加审计顺序，不等同于项目事实时间线；机器时间线只以 snapshot 的 `occurredAt` 排序结果为准。

当前状态和工作线状态都只是可重建投影。每个状态块正文固定记录：项目目标、当前阶段、当前焦点、最近完成事项、唯一下一步、阻塞、已否决方案、关键产物和最近事件引用。知识正文只保存在知识原子；进度事件只写短摘要和真实块引用。

机器契约使用 custom 属性，不用标签：

- 进度页：`custom-progress-role=project-progress-page`、`custom-progress-schema=1`、`custom-progress-project-id`；
- 稳定投影：`custom-progress-role=project-profile|stage-ledger|artifact-index`、项目 ID、更新时间；其中产物索引只保存项目内相对路径；
- 状态块：`custom-progress-role=project-state|workstream-state`、项目 ID、工作线、更新时间、最近事件 ID；
- 普通事件：`custom-progress-role=event`、schema、项目 ID、事件 ID、工作线、事件类型、UTC 时间、provider、session ID；
- 事件类型只用 `progress|decision|blocker|handoff|milestone|knowledge`。

知识原子只使用既有 `custom-verification-status`、`custom-provenance-*`、name、alias 和原子类型。不要创建 `custom-knowledge-status`、`custom-progress-linked`、`custom-promotion-status` 或 stable 状态。

进度与知识的一切写入只经 Sisyphus MCP 完成。禁止通过 RepoPrompt、宿主文件工具或其他本地写入通道修改项目文件、进度页或知识原子；本地读取仅用于核验与差量取证。

## 三、项目接入与完整进度读取

先读取实时能力、工作区路由和知识契约：

```bash
siyuan-sisyphus system bootstrap --json
```
```bash
siyuan-sisyphus fs read --path '/AGENTS.md' --block-start '0' --block-limit '80' --token-budget '3000' --json
```
```bash
siyuan-sisyphus fs read --path '/工作日志/00 导航与说明/知识编译契约' --block-start '0' --block-limit '100' --token-budget '8000' --json
```

宿主能够提供绝对当前目录时，先以 `cwd` 调用项目快照；服务端与 `file.identify_project` 共用最长根路径匹配逻辑：

```bash
siyuan-sisyphus project snapshot --cwd '<absolute-current-working-directory-from-host>' --event-limit '10' --session-limit '20' --validate-sessions --json
```

收到命令时立即在当前运行内存中保存 `runStartedAt`。第一次 snapshot 返回后，在登记会话前保存当前 sessionId 原有的 `lastSeenAt`；恢复旧会话时，该值只作为历史事实时间的次级依据，不能作为本次运行基线。本次“启动→收尾”的差量基线始终是 `runStartedAt`。

没有本地目录或目录未命中时，若用户给出自然语言项目名，则以规范化精确名称重试：

```bash
siyuan-sisyphus project snapshot --project-name '<natural-language-project-name>' --event-limit '10' --session-limit '20' --validate-sessions --json
```

精确名称未命中后才调用项目源列表作候选发现；多个候选只展示项目名称，禁止要求用户输入内部 ID，也禁止猜测：

```bash
siyuan-sisyphus file list-project-sources --query '<natural-language-project-name>' --page '1' --page-size '20' --json
```

目录不存在于当前服务器主机、绑定过期或无法唯一匹配时不得自动登记或修复项目源。`snapshot` 返回 `needs_initialization` 时，先征得用户同意，再按需读取 [项目进度页初始化](references/project-progress-initialization.md)；主 Skill 不内嵌初始化模板，不自动创建页面。

随后捕获并登记当前真实 Agent 会话。先调用 `discover_session`；只有唯一捕获结果或宿主可信注入的真实 sessionId 才能登记，不得自拟描述性 ID：

```bash
siyuan-sisyphus provenance discover-session --provider '<current-provider>' --limit '10' --json
```
```bash
siyuan-sisyphus provenance register-session --project-block-id '<project-hub-block-id>' --project-id '<project-id>' --session-json '{"provider":"<current-provider>","sessionId":"<real-session-id>","hostAlias":"local","captureMethod":"inferred_latest_rollout"}' --occurred-at '2026-09-03T00:00:00.000Z' --json
```
```bash
siyuan-sisyphus project snapshot --project-id '<project-id>' --event-limit '10' --session-limit '20' --validate-sessions --json
```

`captureMethod` 只能使用 `environment|client_context|explicit|inferred_latest_rollout`。宿主注入时分别用 environment 或 client_context；用户明确提供时用 explicit；从唯一且无并发歧义的 rollout 捕获时用 inferred_latest_rollout。禁止把说明文字或复合短语写进该字段。`register_session` 是严格写入动作：不得直接执行示例参数；先用完全相同的业务参数加 `validateOnly=true` 取得 `expectedStateHash`，再用返回凭据和新的 UUIDv7 `requestId` 执行一次。随后再次调用 `project.snapshot(projectId=...)`，确认当前 sessionId 已出现在权威快照。捕获或登记失败时仍可只读恢复项目，但必须回复“当前会话未登记”；本次会话后续禁止写入，直至取得并验证真实 sessionId。

`启动`与`交接`共用以下读取流程。采用“索引 → 筛选 → 详情”，从权威块实时生成用户可见的项目进度全景：

1. 以第二次 `project.snapshot` 的项目身份、进度页、稳定投影、按事实时间排序的最近事件、`chronology` 头部、会话、知识产物、产物索引和服务端诊断作为唯一机器读取结果；不得再自行拼接 SQL、排序会话、解析产物或重做投影诊断；
2. 只对 `localProbeBaseline.tierA` 中已有哈希的权威文件计算当前 SHA-256，不对其他文件做全量哈希；
3. 以当前任务检索最多 12 个知识候选；
4. 综合语义、时间和 `custom-verification-status` 后，最多读取 5 个完整块，提炼核心观点、核心发现和解释边界；
5. 用输出契约的项目归属门排除工具开发、部署和协调器自测事件；
6. 检查旧状态、draft、来源冲突和未核验内容，不把检索命中直接当作当前事实。

```bash
siyuan-sisyphus search knowledge --query '<current project task>' --page-size '12' --candidate-size '30' --active-scopes-json '["<project-scope>"]' --json
```
```bash
siyuan-sisyphus block batch-kramdown --ids-json '["<filtered-block-id-1>","<filtered-block-id-2>"]' --mode 'md' --json
```

`启动`与`交接`在输出全景前执行启动核验。核验只读，异常时最多在全景之前追加两行警示；不写入、不阻断、不把警示写成事件：

1. 投影一致性、孤儿会话、知识引用、绑定陈旧、产物悬空、重复 name 与历史事件分级均直接使用 `snapshot.diagnostics`；Skill 不重复实现。`historical_repairable` 是可重放修复提示，不表述为数据损坏。若 `chronology.complete=false` 或出现 `event_chronology_truncated`，禁止更新项目或工作线状态投影。
2. 本地与共享记忆对账（宿主可执行本地命令时）：按“本地权威文件 ↔ 项目源清单 ↔ 思源投影/知识”三方核验。Tier A 文件的当前 SHA-256 与清单哈希相同且投影无冲突才可写“已核验一致”；哈希不同写“本地领先共享记忆”，文件缺失写“本地缺失”，命令失败或缺少哈希写“无法确认”，不得用 mtime 证明内容一致。
3. 增量新鲜度：使用 `localProbeBaseline.latestHandoffAt`，缺失时回退 `latestEventAt` 并标注“弱基线”。Git 项目执行 `git log --oneline --since=<baseline>` 与 `git status --porcelain`；非 Git 目录项目把 UTC 转为 `YYYY-MM-DD HH:MM:SS UTC` 后执行 `find . -type f -newermt "<UTC 文本时间>" -not -path "*/.git/*" -not -path "*/node_modules/*"`。先检查命令退出状态，再截取前 20 条，禁止用管道成功掩盖失败。非空时最多列出 3 个相对路径。
4. 思源不可用降级：`bootstrap` 或首个读取调用失败且重试一次仍失败时，停止访问共享记忆，提示“共享记忆不可用，本会话仅本地工作，恢复后请重新启动并收尾”；随后只执行不依赖思源的任务，降级状态下禁止任何项目写入。

宿主私有 memory、旧 rollout 和聊天记录不得用于补全当前项目事实；rollout 仅可用于发现或验证真实会话标识。恢复旧会话时，旧聊天中的成果只能作为待核验的历史补录候选，不能覆盖 snapshot 当前状态。同一实时查询在一次启动中只执行一次，后续筛选使用已有结果。

“项目进度全景”严格按输出契约的九节模板生成，不增加实现流水区。会话入口必须保留完整 sessionId、preferredUrl、launcherUrl 和 resumeCommand；不得截断、写成 `[blocked]` 或用块 ID 替代。自定义协议被宿主阻止时，仍输出完整地址并注明限制。用户明确要求审计全部会话时，才在正文后附加测试会话和历史 missing 会话。

`启动`先完成登记和上述全景输出；附带任务时随后继续执行。`交接`每次都重新调用 snapshot，不复用旧报告；它不创建进度事件、不更新状态投影、不写知识。若只读恢复成功但当前会话未登记，仍输出全景并明确标记“当前会话未登记，禁止写入”。页面中的 query_embed 仅供人类浏览，机器判断只以 snapshot 为准。

## 四、知识化

用户显式调用“知识化”即授权本轮必要的知识写入。若本轮没有先“启动”，先完成项目识别、会话发现、登记和回读。只有原子冲突、目标中枢歧义或事实无法确认时才中断询问。

写入前确认当前 sessionId 存在于项目会话注册表。普通事件核对 `custom-progress-provider/session-id`，知识事件核对 provenance source/compile session；当前会话未登记时，本 Skill 必须拒绝创建事件并报告孤儿事件风险。这是协调协议的写前义务，不是通用 `block.insert` 的服务端硬门。历史孤儿事件只在显式验收时通过 lint 报告。

写入前重新读取 snapshot，并按适用版本与范围、证据强度、验证状态、是否已被取代和事实时间，将每项候选裁决为以下四类：

- 当前增量：晚于当前项目或工作线头部且仍有效；允许知识化并推进当前状态投影；
- 历史补录：早于头部、与当前结论兼容且有独立证据或演化价值；以真实旧 `occurredAt` 登记，但不得更新 `project-state` 或 `workstream-state`；
- 历史冲突：与当前知识或状态矛盾；只路由既有知识治理，未解决前不得覆盖原子或状态；若今天正式裁决旧证据修正当前结论，则修订事件发生于今天，旧会话只作为 sourceSession；
- 重复内容：没有新增证据、决策理由或复用价值；零写入。

`occurredAt` 的依据顺序为：可验证的工具结果、文件证据或 Git 提交时间 → 登记前保存的原 session `lastSeenAt` → 用户明确提供的日期或时间。只有日期时按用户本地时区生成日期级时间，并在事件正文标注“日期级依据”。均不可得时不得默认填今天，停止事件登记并请用户提供大致时间。

只处理本轮新增或修订的研究决策、可复用方法、已核验证据、长期警告、失败原因和否决结论。没有知识增量时零写入，并直接说明“本轮没有需要知识化的增量”。

按来源读取并执行现有 Skill，不在这里复制其查重、写入、验证或来源协议：

- 本地项目文件、脚本、输出和研究结果：`siyuan-sisyphus-project-knowledge-compile`；
- 既有原子的查重、合并、改名和验证状态：`siyuan-sisyphus-knowledge-governance`；
- 网页、发布说明等外部来源：`siyuan-sisyphus-knowledge-ingest`。

待核验结论从一开始就在知识位置以 `custom-verification-status=draft` 保存，核验后原地更新，不在进度页保存候选正文。

知识落位后，以同一个稳定 eventId 和已经取证的 `occurredAt` 调用一次 provenance 事件。历史补录的 operation 正文必须明确写“历史补录”：

```bash
siyuan-sisyphus provenance record-event --project-block-id '<project-hub-block-id>' --project-id '<project-id>' --event-id '<stable-event-id>' --operation '<concise knowledge delta or 历史补录: ...>' --workstream '<workstream>' --occurred-at '<evidence-backed-event-time>' --source-session-json '{"provider":"<current-provider>","sessionId":"<real-session-id>","hostAlias":"local","captureMethod":"inferred_latest_rollout"}' --compile-session-json '{"provider":"<current-provider>","sessionId":"<real-session-id>","hostAlias":"local","captureMethod":"inferred_latest_rollout"}' --target-atom-ids-json '["<knowledge-atom-id>"]' --json
```

`record_event` 返回的事件块就是本次进度事件；服务端在同一次写入中固定建立 role、schema、workstream 和 `kind=knowledge` 四个进度属性并完成回读。事件的 `recordedAt` 来自思源块创建时间；Skill 不再拼装这些属性，不创建第二个检查点块，也不在知识原子上增加进度布尔值。回执必须说明原子摘要是 advanced、repaired 还是因较新/同时间/时间异常而保留。

知识写入成功而事件登记失败时，使用同一个 eventId 重试 record_event；其幂等重放不得重新创建知识原子。事件登记成功而状态更新失败时，保留事件并在下次调用时重建状态投影。

`知识化`只报告创建、合并或更新了哪些原子、原子类型、验证状态和唯一知识事件；不追加普通事件，不生成全局收尾报告。

## 五、收尾

`收尾`包含但不限于知识化：先执行第四节，复用已经成功登记的知识事件，不重复创建知识原子或知识事件；再汇总本次运行的工作差量。若本轮没有先执行“启动”，先完成项目识别和会话登记，以本次收尾命令的接收时间作为运行基线，并明确说明无法恢复更早的启动快照。

本轮差量以 `runStartedAt`、本次运行产生的事件、当前对话中的真实工具结果和项目文件差异为证据，不使用历史 `firstSeenAt` 重算整个旧会话。Git 项目可读取 `git status --short`、`git diff --stat` 与 `git diff --name-status`；非 Git 或宿主不能读取文件差异时，只报告已被工具结果证明的产物变化并标记该限制。旧聊天中的既往成果单列为历史补录候选；同时存在当前增量和历史补录时分别创建事件，不得混成一条。还要读取同一时段其他 Agent 的项目事件，单列“并发 Agent 更新”，不得把它们冒充本次运行成果。所有候选差量先通过输出契约的项目归属门；工具开发、部署或用当前项目作样本的协调器测试不得写入当前项目事件和状态。

有非重复进度差量时，在普通事件区追加一个 `kind=handoff` 的单段事件块；正文只记录本轮完成、下一步、阻塞、产物、知识事件引用和会话引用。知识正文仍只在原子中。生成一次 UUIDv7 事件 ID，重试前按事件 ID 查询；已有即复用：

```bash
siyuan-sisyphus block insert --next-id '<recent-activity-heading-id>' --data-type 'markdown' --data '**[<local-time>] <provider> · <workstream>**　完成：<durable delta>；下一步：<single next action>；阻塞：<none or blocker>；产物：<paths or block references>；会话：((<session-record-block-id> '"'"'Agent 会话'"'"'))' --json
```
```bash
siyuan-sisyphus block set-attrs --id '<progress-event-block-id>' --attrs-json '{"custom-progress-role":"event","custom-progress-schema":"1","custom-progress-project-id":"<project-id>","custom-progress-event-id":"<uuidv7>","custom-progress-workstream":"<workstream>","custom-progress-kind":"handoff","custom-progress-occurred-at":"2026-09-03T00:00:00.000Z","custom-progress-provider":"<current-provider>","custom-progress-session-id":"<real-session-id>"}' --json
```

只有当前增量事件晚于 snapshot 对应工作线头部且 `chronology.complete=true` 时，才更新相关工作线状态并根据全部工作线状态重算项目状态。历史补录与未解决的历史冲突只保留事件及必要的阶段台账关系，禁止更新当前状态投影。严格写入先 validateOnly，再使用凭据和新 requestId 单次执行；每块更新后立即回读：

```bash
siyuan-sisyphus block update --id '<state-list-block-id>' --data-type 'markdown' --data '- 项目目标：<goal>
- 当前阶段：<phase>
- 当前焦点：<focus>
- 最近完成：<latest completion>
- 下一步：<single next action>
- 阻塞：<blockers>
- 已否决方案：<rejected options>
- 关键产物：<artifacts>
- 最近事件：((<event-block-id> '"'"'最近事件'"'"'))' --json
```
```bash
siyuan-sisyphus block get-kramdown --id '<state-list-block-id>' --json
```

若哈希冲突，保留已追加事件，重读状态后只合并一次。第二次仍冲突则停止覆写并报告“状态投影待重建”。普通收尾不创建时间线节点；只有模板迁移、批量重建或高风险改写前才建立文档级节点：

```bash
siyuan-sisyphus timeline create-node --name '项目进度结构调整前-<date>' --scope 'document' --document-id '<progress-document-id>' --json
```

无普通进度差量且无知识增量时零写入，但仍输出收尾报告。收尾报告必须先列“本轮工作差量”，包括启动基线、收尾时间、完成事项、状态前后变化、知识变化、文件与产物变化、阻塞与否决、并发 Agent 更新；随后按第三节重新读取并输出更新后的完整“项目进度全景”。不得只返回一行计数。

## 六、完成门

`启动`、`交接`和`收尾`都必须实时读取会话列表。显式要求“验收”“复查”或“审计”时，在常规全景之外补充数据完整性诊断：

```bash
siyuan-sisyphus provenance list-project-sessions --project-id '<project-id>' --validate --limit '100' --json
```

逐项验证：进度页唯一；状态块与事件属性完整；普通事件无重复 eventId；启动核验（按工作线的投影一致性、Tier A 哈希、增量新鲜度、降级）在异常场景下能给出正确警示；知识型更新只有一个 provenance/进度事件；事件引用真实会话和原子；原子反链能返回事件；两个 query_embed 能显示相应记录；新会话能仅凭进度页、事件和原子恢复当前阶段、下一步与阻塞。报告成功、冲突、降级和未写入项，不以“工具调用成功”代替回读证据。

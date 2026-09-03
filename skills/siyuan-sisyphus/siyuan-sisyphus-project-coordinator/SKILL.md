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

## 二、固定数据边界

项目中枢下最多有一个带 `custom-progress-role=project-progress-page` 和当前 `custom-progress-project-id` 的“项目进度协作”页。标题只用于人类阅读，属性才是机器定位契约。页面包含：一个当前项目状态块、每条工作线一个状态块、普通进度事件追加区，以及“最近活动”“本项目知识产物”两个 `query_embed` 只读投影。

当前状态和工作线状态都只是可重建投影。每个状态块正文固定记录：项目目标、当前阶段、当前焦点、最近完成事项、唯一下一步、阻塞、已否决方案、关键产物和最近事件引用。知识正文只保存在知识原子；进度事件只写短摘要和真实块引用。

机器契约使用 custom 属性，不用标签：

- 进度页：`custom-progress-role=project-progress-page`、`custom-progress-schema=1`、`custom-progress-project-id`；
- 状态块：`custom-progress-role=project-state|workstream-state`、项目 ID、工作线、更新时间、最近事件 ID；
- 普通事件：`custom-progress-role=event`、schema、项目 ID、事件 ID、工作线、事件类型、UTC 时间、provider、session ID；
- 事件类型只用 `progress|decision|blocker|handoff|milestone|knowledge`。

知识原子只使用既有 `custom-verification-status`、`custom-provenance-*`、name、alias 和原子类型。不要创建 `custom-knowledge-status`、`custom-progress-linked`、`custom-promotion-status` 或 stable 状态。

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

宿主能够提供绝对当前目录时，首先调用项目识别 action：

```bash
siyuan-sisyphus file identify-project --cwd '<absolute-current-working-directory-from-host>' --json
```

精确项目根和子目录都可命中；嵌套项目由服务端按最长根路径裁决。任一宿主没有本地目录或目录未命中时，都回退到“启动”后的自然语言项目名查询登记项。用户未给项目名时只提示补充自然语言名称；多个候选时只展示项目名称请用户选择，不要求用户输入内部 ID：

```bash
siyuan-sisyphus file list-project-sources --query '<natural-language-project-name>' --page '1' --page-size '20' --json
```

目录不存在于当前服务器主机、映射过期、多个候选或无法唯一匹配时不得猜测，也不得自动登记或修复项目源。取得内部 projectId 与 hubBlockId 后，先按属性查找进度页；不得仅按标题创建：

```bash
siyuan-sisyphus search query-sql --stmt 'SELECT b.id, b.root_id, b.hpath FROM blocks b JOIN attributes r ON r.block_id=b.id AND r.name='"'"'custom-progress-role'"'"' AND r.value='"'"'project-progress-page'"'"' JOIN attributes p ON p.block_id=b.id AND p.name='"'"'custom-progress-project-id'"'"' AND p.value='"'"'<project-id>'"'"' LIMIT 2' --max-rows '2' --json
```

没有结果时，在项目中枢下创建“项目进度协作”页。初始 Markdown 使用单个列表块承载当前状态，并保留普通事件标题；两个 query_embed 按事件真实属性和 refs 动态查询，不复制知识正文：

```bash
siyuan-sisyphus document create --notebook '<notebook-id>' --parent-path '<project-hub-hpath>' --title '项目进度协作' --markdown '## 当前项目状态

- 项目目标：<待确认>
- 当前阶段：<待确认>
- 当前焦点：<待确认>
- 最近完成：<待确认>
- 下一步：<待确认>
- 阻塞：无
- 已否决方案：无
- 关键产物：无
- 最近事件：无

## 工作线状态

## 普通进度事件

## 最近活动

{{ SELECT b.id, substr(b.content, 1, 160) AS event, b.created FROM blocks b WHERE EXISTS (SELECT 1 FROM attributes r WHERE r.block_id=b.id AND r.name='"'"'custom-progress-role'"'"' AND r.value='"'"'event'"'"') AND (EXISTS (SELECT 1 FROM attributes p WHERE p.block_id=b.id AND p.name='"'"'custom-progress-project-id'"'"' AND p.value='"'"'<project-id>'"'"') OR EXISTS (SELECT 1 FROM attributes p WHERE p.block_id=b.id AND p.name='"'"'custom-provenance-project-id'"'"' AND p.value='"'"'<project-id>'"'"')) ORDER BY b.created DESC LIMIT 50 }}

## 本项目知识产物

{{ SELECT DISTINCT a.id, a.name, a.alias, v.value AS verification_status FROM refs rf JOIN blocks e ON e.id=rf.block_id JOIN blocks a ON a.id=rf.def_block_id JOIN attributes v ON v.block_id=a.id AND v.name='"'"'custom-verification-status'"'"' WHERE EXISTS (SELECT 1 FROM attributes k WHERE k.block_id=e.id AND k.name='"'"'custom-progress-kind'"'"' AND k.value='"'"'knowledge'"'"') AND EXISTS (SELECT 1 FROM attributes p WHERE p.block_id=e.id AND p.name='"'"'custom-provenance-project-id'"'"' AND p.value='"'"'<project-id>'"'"') ORDER BY a.updated DESC LIMIT 100 }}' --json
```

创建后立即给文档和状态列表块设置属性，再按 ID 回读：

```bash
siyuan-sisyphus block set-attrs --id '<progress-document-id>' --attrs-json '{"custom-progress-role":"project-progress-page","custom-progress-schema":"1","custom-progress-project-id":"<project-id>"}' --json
```
```bash
siyuan-sisyphus block set-attrs --id '<project-state-list-block-id>' --attrs-json '{"custom-progress-role":"project-state","custom-progress-project-id":"<project-id>","custom-progress-workstream":"project","custom-progress-updated-at":"2026-09-03T00:00:00.000Z","custom-progress-last-event-id":"<latest-event-block-id-or-empty>"}' --json
```

若已经存在同 projectId 的进度页，禁止创建第二份。首次基线只从当前中枢、既有原子和已登记项目文件形成草案；用户未认可草案时不写入实质研究状态，也不回填旧聊天。

随后捕获并登记当前真实 Agent 会话。先调用 `discover_session`；只有唯一捕获结果或宿主可信注入的真实 sessionId 才能登记，不得自拟描述性 ID：

```bash
siyuan-sisyphus provenance discover-session --provider '<current-provider>' --limit '10' --json
```
```bash
siyuan-sisyphus provenance register-session --project-block-id '<project-hub-block-id>' --project-id '<project-id>' --session-json '{"provider":"<current-provider>","sessionId":"<real-session-id>","hostAlias":"local","captureMethod":"inferred_latest_rollout"}' --occurred-at '2026-09-03T00:00:00.000Z' --json
```
```bash
siyuan-sisyphus provenance list-project-sessions --project-id '<project-id>' --validate --limit '100' --json
```

`captureMethod` 只能使用 `environment|client_context|explicit|inferred_latest_rollout`。宿主注入时分别用 environment 或 client_context；用户明确提供时用 explicit；从唯一且无并发歧义的 rollout 捕获时用 inferred_latest_rollout。禁止把说明文字或复合短语写进该字段。`register_session` 是严格写入动作：不得直接执行示例参数；先用完全相同的业务参数加 `validateOnly=true` 取得 `expectedStateHash`，再用返回凭据和新的 UUIDv7 `requestId` 执行一次。随后立即用 `list_project_sessions(validate=true)` 回读，确认当前 sessionId 已出现。捕获或登记失败时仍可只读恢复项目，但必须回复“当前会话未登记”；本次会话后续禁止写入，直至取得并验证真实 sessionId。

`启动`与`交接`共用以下读取流程。采用“索引 → 筛选 → 详情”，从权威块实时生成用户可见的项目进度全景：

1. 读取项目状态和相关工作线状态正文与属性；
2. 按块创建时间分页读取本项目全部事件元数据，并读取组成当前阶段时间线的事件正文；不得只看 query_embed；
3. 以当前任务检索最多 12 个知识候选；
4. 综合语义、时间和 `custom-verification-status` 后，最多读取 5 个完整块；
5. 读取按 `lastSeenAt DESC` 排序的项目会话表并核验当前会话；
6. 检查旧状态、draft、来源冲突和未核验内容，不把检索命中直接当作当前事实。

```bash
siyuan-sisyphus search query-sql --stmt 'SELECT b.id, b.content, b.updated FROM blocks b WHERE EXISTS (SELECT 1 FROM attributes p WHERE p.block_id=b.id AND p.name='"'"'custom-progress-project-id'"'"' AND p.value='"'"'<project-id>'"'"') AND EXISTS (SELECT 1 FROM attributes r WHERE r.block_id=b.id AND r.name='"'"'custom-progress-role'"'"' AND r.value IN ('"'"'project-state'"'"','"'"'workstream-state'"'"')) ORDER BY b.updated DESC LIMIT 50' --max-rows '50' --json
```
```bash
siyuan-sisyphus search query-sql --stmt 'SELECT b.id, b.content, b.created FROM blocks b WHERE EXISTS (SELECT 1 FROM attributes r WHERE r.block_id=b.id AND r.name='"'"'custom-progress-role'"'"' AND r.value='"'"'event'"'"') AND (EXISTS (SELECT 1 FROM attributes p WHERE p.block_id=b.id AND p.name='"'"'custom-progress-project-id'"'"' AND p.value='"'"'<project-id>'"'"') OR EXISTS (SELECT 1 FROM attributes p WHERE p.block_id=b.id AND p.name='"'"'custom-provenance-project-id'"'"' AND p.value='"'"'<project-id>'"'"')) ORDER BY b.created DESC LIMIT 200 OFFSET 0' --max-rows '200' --json
```
```bash
siyuan-sisyphus search knowledge --query '<current project task>' --page-size '12' --candidate-size '30' --active-scopes-json '["<project-scope>"]' --json
```
```bash
siyuan-sisyphus block batch-kramdown --ids-json '["<filtered-block-id-1>","<filtered-block-id-2>"]' --mode 'md' --json
```
```bash
siyuan-sisyphus provenance list-project-sessions --project-id '<project-id>' --validate --limit '100' --json
```

“项目进度全景”必须包含：项目目标、当前阶段与焦点、各工作线状态、最近完成、唯一下一步、阻塞、已否决方案、关键产物、按时间排序的任务事件时间线、最新知识变化及验证状态、全部已登记 Agent 会话、信息新鲜度与冲突提示。会话表列出 provider、sessionId、最后活动时间、验证状态、首选地址、launcher 地址和可用 resume 命令；首选地址按 `preferredUrl → launcherUrl`，验证为 missing 的旧会话保留并标记。

`启动`先完成登记和上述全景输出；附带任务时随后继续执行。`交接`每次都重新读数据，不复用旧报告；它不创建进度事件、不更新状态投影、不写知识。若只读恢复成功但当前会话未登记，仍输出全景并明确标记“当前会话未登记，禁止写入”。Agent 恢复直接读取 SQL、稳定块 ID 和 refs；页面中的 query_embed 仅供人类浏览，不能作为唯一机器数据源。

## 四、知识化

用户显式调用“知识化”即授权本轮必要的知识写入。若本轮没有先“启动”，先完成项目识别、会话发现、登记和回读。只有原子冲突、目标中枢歧义或事实无法确认时才中断询问。

写入前确认当前 sessionId 存在于项目会话注册表。普通事件核对 `custom-progress-provider/session-id`，知识事件核对 provenance source/compile session；当前会话未登记时，本 Skill 必须拒绝创建事件并报告孤儿事件风险。这是协调协议的写前义务，不是通用 `block.insert` 的服务端硬门。历史孤儿事件只在显式验收时通过 lint 报告。

只处理本轮新增或修订的研究决策、可复用方法、已核验证据、长期警告、失败原因和否决结论。没有知识增量时零写入，并直接说明“本轮没有需要知识化的增量”。

按来源读取并执行现有 Skill，不在这里复制其查重、写入、验证或来源协议：

- 本地项目文件、脚本、输出和研究结果：`siyuan-sisyphus-project-knowledge-compile`；
- 既有原子的查重、合并、改名和验证状态：`siyuan-sisyphus-knowledge-governance`；
- 网页、发布说明等外部来源：`siyuan-sisyphus-knowledge-ingest`。

待核验结论从一开始就在知识位置以 `custom-verification-status=draft` 保存，核验后原地更新，不在进度页保存候选正文。

知识落位后，以同一个稳定 eventId 调用一次 provenance 事件：

```bash
siyuan-sisyphus provenance record-event --project-block-id '<project-hub-block-id>' --project-id '<project-id>' --event-id '<stable-event-id>' --operation '<concise knowledge delta>' --source-session-json '{"provider":"<current-provider>","sessionId":"<real-session-id>","hostAlias":"local","captureMethod":"inferred_latest_rollout"}' --target-atom-ids-json '["<knowledge-atom-id>"]' --json
```

`record_event` 返回的事件块就是本次进度事件。只给该块补充无法由 provenance 推导的四个属性：role、schema、workstream 和 `kind=knowledge`；不创建第二个检查点块，也不在知识原子上增加进度布尔值：

```bash
siyuan-sisyphus block set-attrs --id '<provenance-event-block-id>' --attrs-json '{"custom-progress-role":"event","custom-progress-schema":"1","custom-progress-workstream":"<workstream>","custom-progress-kind":"knowledge"}' --json
```

知识写入成功而事件登记失败时，使用同一个 eventId 重试 record_event；其幂等重放不得重新创建知识原子。事件登记成功而状态更新失败时，保留事件并在下次调用时重建状态投影。

`知识化`只报告创建、合并或更新了哪些原子、原子类型、验证状态和唯一知识事件；不追加普通事件，不生成全局收尾报告。

## 五、收尾

`收尾`包含但不限于知识化：先执行第四节，复用已经成功登记的知识事件，不重复创建知识原子或知识事件；再汇总本次会话的工作差量。若本轮没有先执行“启动”，先完成项目识别和会话登记，并将本次可确认的最早会话活动作为基线，明确说明无法恢复更早的启动快照。

本轮差量以当前会话注册记录的 `firstSeenAt`、本会话事件、当前对话中的真实工具结果和项目文件差异为证据。Git 项目可读取 `git status --short`、`git diff --stat` 与 `git diff --name-status`；非 Git 或宿主不能读取文件差异时，只报告已被工具结果证明的产物变化并标记该限制。还要读取同一时段其他 Agent 的项目事件，单列“并发 Agent 更新”，不得把它们冒充本会话成果。

有非重复进度差量时，在普通事件区追加一个 `kind=handoff` 的单段事件块；正文只记录本轮完成、下一步、阻塞、产物、知识事件引用和会话引用。知识正文仍只在原子中。生成一次 UUIDv7 事件 ID，重试前按事件 ID 查询；已有即复用：

```bash
siyuan-sisyphus block insert --next-id '<recent-activity-heading-id>' --data-type 'markdown' --data '**[<local-time>] <provider> · <workstream>**　完成：<durable delta>；下一步：<single next action>；阻塞：<none or blocker>；产物：<paths or block references>；会话：((<session-record-block-id> '"'"'Agent 会话'"'"'))' --json
```
```bash
siyuan-sisyphus block set-attrs --id '<progress-event-block-id>' --attrs-json '{"custom-progress-role":"event","custom-progress-schema":"1","custom-progress-project-id":"<project-id>","custom-progress-event-id":"<uuidv7>","custom-progress-workstream":"<workstream>","custom-progress-kind":"handoff","custom-progress-occurred-at":"2026-09-03T00:00:00.000Z","custom-progress-provider":"<current-provider>","custom-progress-session-id":"<real-session-id>"}' --json
```

事件成功后更新相关工作线状态，再根据全部工作线状态重算项目状态。严格写入先 validateOnly，再使用凭据和新 requestId 单次执行；每块更新后立即回读：

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

逐项验证：进度页唯一；状态块与事件属性完整；普通事件无重复 eventId；知识型更新只有一个 provenance/进度事件；事件引用真实会话和原子；原子反链能返回事件；两个 query_embed 能显示相应记录；新会话能仅凭进度页、事件和原子恢复当前阶段、下一步与阻塞。报告成功、冲突、降级和未写入项，不以“工具调用成功”代替回读证据。

---
name: siyuan-mcp-project-coordinator
description: 思源多 Agent 项目协调工作流。仅在用户明确调用“启动”或“收尾”时，自动接入当前项目并维护共享进度记忆；“知识化”是“收尾”的同义词。
compatibility: "Requires a reachable SiYuan Sisyphus MCP server already registered in the client; installing this Skill alone does not configure the MCP endpoint or bearer token."
---

# 思源多 Agent 项目协调 with MCP

本 Skill 只在用户明确调用时运行，公开动作只有“启动”和“收尾”；“知识化”完全等同“收尾”。未被明确调用时，不读取或写入项目进度。用户不需要知道 projectId、块 ID 或知识流程名称。

## 一、公开交互

- `启动`：从宿主当前目录自动识别项目，登记真实 Agent 会话，静默恢复内部工作上下文，然后直接执行附带任务。
- `收尾` / `知识化`：判断本轮持久增量，按普通进度或知识增量分流；没有持久增量时零写入。
- `启动并复查`、`收尾并验收`等自然语言修饰语不构成第三种模式；只有用户明确要求复查、验收、审计或列出会话时才输出诊断详情。

`启动`附带任务时直接工作，不展示内部检索过程。只输入“启动”时，仅回复“已接入《项目名》，当前会话已登记”。普通响应不显示 projectId、块 ID 清单或默认交接简报。

## 二、固定数据边界

项目中枢下最多有一个带 `custom-progress-role=project-progress-page` 和当前 `custom-progress-project-id` 的“项目进度协作”页。标题只用于人类阅读，属性才是机器定位契约。页面包含：一个当前项目状态块、每条工作线一个状态块、普通进度事件追加区，以及“最近活动”“本项目知识产物”两个 `query_embed` 只读投影。

当前状态和工作线状态都只是可重建投影。每个状态块正文固定记录：项目目标、当前阶段、当前焦点、最近完成事项、唯一下一步、阻塞、已否决方案、关键产物和最近事件引用。知识正文只保存在知识原子；进度事件只写短摘要和真实块引用。

机器契约使用 custom 属性，不用标签：

- 进度页：`custom-progress-role=project-progress-page`、`custom-progress-schema=1`、`custom-progress-project-id`；
- 状态块：`custom-progress-role=project-state|workstream-state`、项目 ID、工作线、更新时间、最近事件 ID；
- 普通事件：`custom-progress-role=event`、schema、项目 ID、事件 ID、工作线、事件类型、UTC 时间、provider、session ID；
- 事件类型只用 `progress|decision|blocker|handoff|milestone|knowledge`。

知识原子只使用既有 `custom-verification-status`、`custom-provenance-*`、name、alias 和原子类型。不要创建 `custom-knowledge-status`、`custom-progress-linked`、`custom-promotion-status` 或 stable 状态。

## 三、启动

先读取实时能力、工作区路由和知识契约：

```text
system(action="bootstrap")
```
```text
fs(action="read", path="/AGENTS.md", blockStart=0, blockLimit=80, tokenBudget=3000)
```
```text
fs(action="read", path="/工作日志/00 导航与说明/知识编译契约", blockStart=0, blockLimit=100, tokenBudget=8000)
```

宿主能够提供绝对当前目录时，首先调用项目识别 action：

```text
file(action="identify_project", cwd="<absolute-current-working-directory-from-host>")
```

精确项目根和子目录都可命中；嵌套项目由服务端按最长根路径裁决。任一宿主没有本地目录或目录未命中时，都回退到“启动”后的自然语言项目名查询登记项。用户未给项目名时只提示补充自然语言名称；多个候选时只展示项目名称请用户选择，不要求用户输入内部 ID：

```text
file(action="list_project_sources", query="<natural-language-project-name>", page=1, pageSize=20)
```

目录不存在于当前服务器主机、映射过期、多个候选或无法唯一匹配时不得猜测，也不得自动登记或修复项目源。取得内部 projectId 与 hubBlockId 后，先按属性查找进度页；不得仅按标题创建：

```text
search(action="query_sql", stmt="SELECT b.id, b.root_id, b.hpath FROM blocks b JOIN attributes r ON r.block_id=b.id AND r.name='custom-progress-role' AND r.value='project-progress-page' JOIN attributes p ON p.block_id=b.id AND p.name='custom-progress-project-id' AND p.value='<project-id>' LIMIT 2", maxRows=2)
```

没有结果时，在项目中枢下创建“项目进度协作”页。初始 Markdown 使用单个列表块承载当前状态，并保留普通事件标题；两个 query_embed 按事件真实属性和 refs 动态查询，不复制知识正文：

```text
document(action="create", notebook="<notebook-id>", parentPath="<project-hub-hpath>", title="项目进度协作", markdown="## 当前项目状态\n\n- 项目目标：<待确认>\n- 当前阶段：<待确认>\n- 当前焦点：<待确认>\n- 最近完成：<待确认>\n- 下一步：<待确认>\n- 阻塞：无\n- 已否决方案：无\n- 关键产物：无\n- 最近事件：无\n\n## 工作线状态\n\n## 普通进度事件\n\n## 最近活动\n\n{{ SELECT b.id, substr(b.content, 1, 160) AS event, b.created FROM blocks b WHERE EXISTS (SELECT 1 FROM attributes r WHERE r.block_id=b.id AND r.name='custom-progress-role' AND r.value='event') AND (EXISTS (SELECT 1 FROM attributes p WHERE p.block_id=b.id AND p.name='custom-progress-project-id' AND p.value='<project-id>') OR EXISTS (SELECT 1 FROM attributes p WHERE p.block_id=b.id AND p.name='custom-provenance-project-id' AND p.value='<project-id>')) ORDER BY b.created DESC LIMIT 50 }}\n\n## 本项目知识产物\n\n{{ SELECT DISTINCT a.id, a.name, a.alias, v.value AS verification_status FROM refs rf JOIN blocks e ON e.id=rf.block_id JOIN blocks a ON a.id=rf.def_block_id JOIN attributes v ON v.block_id=a.id AND v.name='custom-verification-status' WHERE EXISTS (SELECT 1 FROM attributes k WHERE k.block_id=e.id AND k.name='custom-progress-kind' AND k.value='knowledge') AND EXISTS (SELECT 1 FROM attributes p WHERE p.block_id=e.id AND p.name='custom-provenance-project-id' AND p.value='<project-id>') ORDER BY a.updated DESC LIMIT 100 }}")
```

创建后立即给文档和状态列表块设置属性，再按 ID 回读：

```text
block(action="set_attrs", id="<progress-document-id>", attrs={"custom-progress-role":"project-progress-page","custom-progress-schema":"1","custom-progress-project-id":"<project-id>"})
```
```text
block(action="set_attrs", id="<project-state-list-block-id>", attrs={"custom-progress-role":"project-state","custom-progress-project-id":"<project-id>","custom-progress-workstream":"project","custom-progress-updated-at":"2026-09-03T00:00:00.000Z","custom-progress-last-event-id":"<latest-event-block-id-or-empty>"})
```

若已经存在同 projectId 的进度页，禁止创建第二份。首次基线只从当前中枢、既有原子和已登记项目文件形成草案；用户未认可草案时不写入实质研究状态，也不回填旧聊天。

随后捕获并登记当前真实 Agent 会话。先调用 `discover_session`；只有唯一捕获结果或宿主可信注入的真实 sessionId 才能登记，不得自拟描述性 ID：

```text
provenance(action="discover_session", provider="<current-provider>", limit=10)
```
```text
provenance(action="register_session", projectBlockId="<project-hub-block-id>", projectId="<project-id>", session={"provider":"<current-provider>","sessionId":"<real-session-id>","hostAlias":"local","captureMethod":"<environment-or-verified-discovery>"}, occurredAt="2026-09-03T00:00:00.000Z")
```
```text
provenance(action="list_project_sessions", projectId="<project-id>", validate=true, limit=100)
```

`register_session` 是严格写入动作：不得直接执行示例参数；先用完全相同的业务参数加 `validateOnly=true` 取得 `expectedStateHash`，再用返回凭据和新的 UUIDv7 `requestId` 执行一次。随后立即用 `list_project_sessions(validate=true)` 回读，确认当前 sessionId 已出现。捕获或登记失败时仍可只读恢复项目，但必须回复“当前会话未登记”；本次会话后续禁止写入，直至取得并验证真实 sessionId。

内部恢复采用“索引 → 筛选 → 详情”，不生成独立简报：

1. 读取项目状态和相关工作线状态正文与属性；
2. 按块创建时间读取最近 10 个事件；
3. 以当前任务检索最多 12 个知识候选；
4. 综合语义、时间和 `custom-verification-status` 后，最多读取 5 个完整块；
5. 检查旧状态、draft、来源冲突和未核验内容，只把通过判断的信息放入当前推理上下文；
6. 直接执行用户任务。

```text
search(action="query_sql", stmt="SELECT b.id, b.content, b.updated FROM blocks b WHERE EXISTS (SELECT 1 FROM attributes p WHERE p.block_id=b.id AND p.name='custom-progress-project-id' AND p.value='<project-id>') AND EXISTS (SELECT 1 FROM attributes r WHERE r.block_id=b.id AND r.name='custom-progress-role' AND r.value IN ('project-state','workstream-state')) ORDER BY b.updated DESC LIMIT 50", maxRows=50)
```
```text
search(action="query_sql", stmt="SELECT b.id, substr(b.content, 1, 240) AS preview, b.created FROM blocks b WHERE EXISTS (SELECT 1 FROM attributes r WHERE r.block_id=b.id AND r.name='custom-progress-role' AND r.value='event') AND (EXISTS (SELECT 1 FROM attributes p WHERE p.block_id=b.id AND p.name='custom-progress-project-id' AND p.value='<project-id>') OR EXISTS (SELECT 1 FROM attributes p WHERE p.block_id=b.id AND p.name='custom-provenance-project-id' AND p.value='<project-id>')) ORDER BY b.created DESC LIMIT 10", maxRows=10)
```
```text
search(action="knowledge", query="<current project task>", pageSize=12, candidateSize=30, activeScopes=["<project-scope>"])
```
```text
block(action="batch_kramdown", ids=["<filtered-block-id-1>","<filtered-block-id-2>"], mode="md")
```

Agent 恢复直接读取 SQL、稳定块 ID 和 refs；页面中的 query_embed 仅供人类浏览，不能作为唯一机器数据源。

## 四、收尾与知识化

用户显式调用“收尾”或“知识化”即授权本轮必要的进度与知识写入。若本轮没有先“启动”，先完成项目识别、会话发现、登记和回读。只有原子冲突、目标中枢歧义或事实无法确认时才中断询问。

写入前确认当前 sessionId 存在于项目会话注册表。普通事件核对 `custom-progress-provider/session-id`，知识事件核对 provenance source/compile session；当前会话未登记时，本 Skill 必须拒绝创建事件并报告孤儿事件风险。这是协调协议的写前义务，不是通用 `block.insert` 的服务端硬门。历史孤儿事件只在显式验收时通过 lint 报告。

先判断本轮是否有持久增量：

- 仅有进度变化：追加一个普通事件，再更新状态投影；
- 有研究决策、可复用方法、已核验证据或长期警告、失败原因、否决结论：先完成知识落位，再创建唯一知识事件；
- 无实质变化：不写项目进度和知识。

普通增量先在“普通进度事件”区末尾、下一节“最近活动”标题之前插入一个单段事件块，正文只记录完成、下一步、阻塞、产物和必要引用。不要拆成多个兄弟块，以免属性和引用脱离事件根块。生成一次 UUIDv7 事件 ID，重试前按事件 ID 查询；已经存在即复用，不重复追加：

```text
block(action="insert", nextID="<recent-activity-heading-id>", dataType="markdown", data="**[<local-time>] <provider> · <workstream>**　完成：<durable delta>；下一步：<single next action>；阻塞：<none or blocker>；产物：<paths or block references>；会话：((<session-record-block-id> 'Agent 会话'))")
```
```text
block(action="set_attrs", id="<progress-event-block-id>", attrs={"custom-progress-role":"event","custom-progress-schema":"1","custom-progress-project-id":"<project-id>","custom-progress-event-id":"<uuidv7>","custom-progress-workstream":"<workstream>","custom-progress-kind":"progress","custom-progress-occurred-at":"2026-09-03T00:00:00.000Z","custom-progress-provider":"<current-provider>","custom-progress-session-id":"<real-session-id>"})
```

事件成功后更新对应工作线状态，再依据所有工作线状态重算项目状态。严格写入时先 validateOnly，使用返回的预置条件凭据和新 requestId 单次执行；每次更新后立即按 ID 回读：

```text
block(action="update", id="<state-list-block-id>", dataType="markdown", data="- 项目目标：<goal>\n- 当前阶段：<phase>\n- 当前焦点：<focus>\n- 最近完成：<latest completion>\n- 下一步：<single next action>\n- 阻塞：<blockers>\n- 已否决方案：<rejected options>\n- 关键产物：<artifacts>\n- 最近事件：((<event-block-id> '最近事件'))")
```
```text
block(action="get_kramdown", id="<state-list-block-id>")
```

若哈希冲突，保留已追加事件，重读状态后只合并一次。第二次仍冲突则停止覆写并报告“状态投影待重建”。事件是权威历史，摘要暂时落后不等于进度丢失。

普通更新不创建时间线节点。只有进度模板迁移、批量重建或高风险改写前才建立文档级节点：

```text
timeline(action="create_node", name="项目进度结构调整前-<date>", scope="document", documentId="<progress-document-id>")
```

按来源读取并执行现有 Skill，不在这里复制其查重、写入、验证或来源协议：

- 本地项目文件、脚本、输出和研究结果：`siyuan-mcp-project-knowledge-compile`；
- 既有原子的查重、合并、改名和验证状态：`siyuan-mcp-knowledge-governance`；
- 网页、发布说明等外部来源：`siyuan-mcp-knowledge-ingest`。

待核验结论从一开始就在知识位置以 `custom-verification-status=draft` 保存，核验后原地更新，不在进度页保存候选正文。

知识落位后，以同一个稳定 eventId 调用一次 provenance 事件：

```text
provenance(action="record_event", projectBlockId="<project-hub-block-id>", projectId="<project-id>", eventId="<stable-event-id>", operation="<concise knowledge delta>", sourceSession={"provider":"<current-provider>","sessionId":"<real-session-id>","hostAlias":"local","captureMethod":"<environment-or-verified-discovery>"}, targetAtomIds=["<knowledge-atom-id>"])
```

`record_event` 返回的事件块就是本次进度事件。只给该块补充无法由 provenance 推导的四个属性：role、schema、workstream 和 `kind=knowledge`；不创建第二个检查点块，也不在知识原子上增加进度布尔值：

```text
block(action="set_attrs", id="<provenance-event-block-id>", attrs={"custom-progress-role":"event","custom-progress-schema":"1","custom-progress-workstream":"<workstream>","custom-progress-kind":"knowledge"})
```

知识写入成功而事件登记失败时，使用同一个 eventId 重试 record_event；其幂等重放不得重新创建知识原子。事件登记成功而状态更新失败时，保留事件并在下次调用时重建状态投影。

正常收尾只返回一行回执，例如“收尾完成：更新 1 条工作线，沉淀 2 条知识，登记 1 个事件。”

## 五、显式复查与完成门

只有用户明确要求“验收”“复查”“审计”或“列出会话”时，才实时调用会话列表并显示完整表格。表格按 `lastSeenAt` 降序，列出 Agent/provider、sessionId、最后活动时间、验证状态、首选地址、launcher 地址和可用的 resume 命令。首选地址按 `preferredUrl → launcherUrl`；resumeCommand 单独展示。验证为 missing 的旧会话保留并明确标记，不静默删除：

```text
provenance(action="list_project_sessions", projectId="<project-id>", validate=true, limit=100)
```

逐项验证：进度页唯一；状态块与事件属性完整；普通事件无重复 eventId；知识型更新只有一个 provenance/进度事件；事件引用真实会话和原子；原子反链能返回事件；两个 query_embed 能显示相应记录；新会话能仅凭进度页、事件和原子恢复当前阶段、下一步与阻塞。报告成功、冲突、降级和未写入项，不以“工具调用成功”代替回读证据。

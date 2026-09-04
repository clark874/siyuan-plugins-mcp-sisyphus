# Agent 会话溯源

`provenance` 用于记录知识来源于哪次 Agent 讨论，以及由哪次 Agent 会话执行思源写入。完整历史以项目中枢下的会话块和事件块持久保存，目标知识原子只保留最近一次溯源摘要属性。

## 动作

| action | 用途 |
|---|---|
| `register_session` | 登记或刷新一个项目会话记录 |
| `record_event` | 记录一次知识化事件并更新全部目标原子 |
| `list_project_sessions` | 罗列与项目关联的不同 Agent 会话 |
| `list_atom_events` | 罗列真实引用某个知识原子的全部知识化事件 |
| `resolve_session_link` | 返回经过能力判定的原生链接、启动链接或恢复命令 |
| `validate_session` | 检查本机 rollout 或会话文件是否仍然存在 |

## 数据模型

- 项目会话唯一键为 `projectId + provider + hostAlias + sessionId`。
- 事件分别记录 `sourceSession` 与 `compileSession`，不把讨论来源和执行写入者混为一谈。两个会话都必须事先登记；`record_event` 不再隐式登记。
- `record_event` 必须提供 `workstream`，并在同一次操作中写入进度角色、schema、工作线和 `kind=knowledge`。
- 事件块通过真实思源块引用连接全部目标原子，反向查询不依赖正文解析。
- 会话标识保存在自定义属性中。即使历史 rollout 被清理，知识原子正文仍保持自包含。
- 事件正文同时记录事实发生时间与块登记时间；`list_atom_events` 读取事件属性后按 `occurredAt` 排序，不以晚登记时间冒充最新事实。
- 目标原子的最新溯源摘要只允许单调前进。历史补录仍会创建事件和引用，但不会覆盖较新的摘要；返回值会逐原子标明 `advanced`、`repaired` 或对应的保留原因。

## 链接能力

- Codex 会话使用原生 `codex://threads/<sessionId>` 链接。
- Hermes 返回已核验的 `hermes --resume <sessionId>` 恢复命令。Hermes.app 当前没有注册 URL scheme，因此不生成 `hermes://` 或 `@session:` 原生深链。
- ZCode 与 Claude Code 当前只返回经过验证的 `--resume <sessionId>` 恢复命令；在客户端提供并核验会话原生深链前，不声明可直接跳转。
- 远程主机会返回会话元数据，但不会在当前设备上启动。

`register_session` 与 `record_event` 属于严格写入：先以 `validateOnly: true` 取得状态凭据，再携带该状态哈希和稳定请求标识执行正式写入。

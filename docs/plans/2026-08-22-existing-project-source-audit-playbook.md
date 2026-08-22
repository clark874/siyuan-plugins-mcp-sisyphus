# 存量项目文件映射审计手册

## 使用时点

本手册只在 Sisyphus `0.9.2-wiki.1` 或更高版本发布、安装并完成真实 MCP 验收后执行。若实时帮助中不存在项目源登记、清单、解析和读取动作，立即停止；不得用任意 shell 扫描、探索性 SQL 或全笔记本遍历替代缺失能力。

## 审计目标

为每个既有项目建立一条可核验链路：

项目知识中枢 → projectId → 来源清单 → 本机绑定 → revision/快照 → 相对文件路径 → 读取状态 → 对应知识块。

审计只证明映射覆盖与读取可达性。文件存在、哈希一致或能够读取，不等于文件内容已经成为知识证据，也不等于相关研究结论已经验证。

## 前置验收

1. 调用 `system(action="bootstrap")`，确认 `schemaVersion=2`、`toolConfiguration.current=true`，并记录实时插件版本。
2. 调用 `file(action="help")` 读取项目源相关动作；所有参数以实时 Schema 为准，不照抄旧文档。
3. 读取 `/AGENTS.md`；任务涉及用户偏好时再读取 `/USER_RULES.md`。
4. 确认外部 Agent 只连接 `http://127.0.0.1:36806/mcp`，未并列注册 `6806/mcp`。
5. 先选一个项目试运行；通过后再按批次扩展，不并发修改同一中枢或来源清单。

## 对象账本

每个项目必须维护以下字段：

| 字段 | 含义 |
| --- | --- |
| projectId | 稳定项目身份 |
| hubBlockId | 项目中枢稳定块 ID |
| manifestBlockId | 来源清单或其摘要块 ID |
| sourceKind | git 或 directory |
| repository | 可迁移仓库身份；非 Git 项目可为空 |
| revision | Git revision 或目录快照指纹 |
| hostBinding | available、missing、stale 或 ambiguous |
| coverage | tracked、complete、curated 或 partial |
| aCount / bCount / cCount | 核心、一般、排除文件的精确数量 |
| missingCore | 中枢提及但清单缺失的核心文件 |
| unreadable | 已登记但当前不可读取的文件 |
| conflicts | 多绑定、路径冲突、revision 冲突或角色冲突 |
| readback | 补录后的稳定块 ID、解析结果与读取结果 |

没有精确分母时，项目状态只能是 `partial`，不得填写“完整”。

## 单项目执行顺序

1. 使用 `search(action="knowledge", query="项目名称或用户问题")` 查找项目中枢。前三个去重结果已有明确命名中枢时，直接读取稳定块 ID，不展开上级目录。
2. 从中枢提取已有仓库、目录、revision、核心脚本、数据、输出、论文和配置线索；只记录明确文本，不推测路径。
3. 查询项目源登记状态。不存在时生成登记预检，由用户或已授权流程确认真实根目录后再登记；不得搜索主目录猜测根目录。
4. 生成或刷新项目清单，明确忽略规则、符号链接、缓存、构建产物、大文件和二进制文件的处理结果。
5. 将中枢提及的核心文件与清单 A 级文件双向比对：分别列出“笔记有、清单无”和“清单有、笔记无”。
6. 对 A 级文件逐项解析相对路径；仅在解析成功后测试受控读取。分别记录 `listed`、`readable`、`content_read` 和 `revision_verified`，不得合并为一个“已接入”状态。
7. 仅补录缺失的 projectId、来源身份、revision、相对路径、角色和稳定引用。禁止整篇覆写项目中枢，禁止复制完整文件内容进入笔记。
8. 所有写入先按实时 help 执行 `validateOnly`，取得所需前置条件后使用新的 UUIDv7 `requestId` 执行一次；任何 `validation_error` 或 `softened=true` 都是失败。
9. 按稳定块 ID 回读中枢和来源清单，再重新调用解析与读取动作，确认写入后的链路可用。
10. 用两个真实问题验收：一个要求从中枢定位核心文件，一个要求读取核心文件中的限定片段。报告答案所依据的块 ID、相对路径和 revision，不把读取结果升级为研究结论。

## 批次与停止条件

- 每批最多处理 5 个项目；每批结束后输出对象账本和失败清单。
- 遇到根目录不明、多重候选绑定、revision 不一致、符号链接越界、权限拒绝或中枢身份冲突时，将项目标为 `conflict` 并停止该项目。
- 任何动作返回待核验状态时，不重试写入；先读取目标并完成调和。
- 只读审计可以继续处理其他无冲突项目；不得为了提高完成率放宽根目录或文件类型限制。

## 可直接复制给外部 AI 的任务指令

```text
请通过本机 Sisyphus MCP 执行“既有项目文件映射审计”。

连接与冷启动：
1. 唯一外部 MCP 为 http://127.0.0.1:36806/mcp，使用客户端安全存储中的 Bearer token；禁止输出 token。
2. 先调用 system(action="bootstrap")，确认 schemaVersion=2、toolConfiguration.current=true，且插件版本不低于 0.9.2-wiki.1。
3. 读取 file(action="help")。若实时 Schema 中没有项目源登记、清单、解析和受控读取动作，停止并报告“版本能力不足”；不得自行扫描本机目录替代。
4. 读取 /AGENTS.md；涉及偏好时再读取 /USER_RULES.md。

审计范围与方法：
- 每批最多 5 个项目，先选 1 个项目试运行。
- 自然语言查找先用 search(action="knowledge")。前三个去重结果出现明确命名中枢时，直接读取稳定块 ID，不扫描上级目录、不做探索性 SQL、不做无过滤全量 AV。
- 为每个项目建立对象账本：projectId、hubBlockId、manifestBlockId、sourceKind、repository、revision、hostBinding、coverage、A/B/C 级数量、missingCore、unreadable、conflicts、readback。
- 不搜索用户主目录猜测项目根目录；根目录不明或有多个候选时标记 conflict 并停止该项目。
- 逐项区分 listed、readable、content_read、revision_verified；不得把 mapped 或 listed 报告为已读取。
- 只补录缺失的稳定身份、相对路径、角色、revision 和引用；禁止整篇覆写中枢，禁止把完整源文件复制进思源。
- 写入严格遵循实时 help：validateOnly 预检，取得所需前置条件后用新的 UUIDv7 requestId 执行一次，再按稳定 ID 回读。validation_error 和 softened=true 都表示失败。
- 文件存在或可读不等于研究结论已验证。结论证据必须另行审计。

每个项目的交付：
1. 对象账本；
2. 笔记有但清单无、清单有但笔记无的双向差异；
3. 已完成、待验证、冲突和后续任务；
4. 两个真实问答验收及其块 ID、相对路径、revision；
5. 精确分母。没有精确分母时只能报告 partial。
```

## 完成判据

一个项目只有同时满足以下条件才可标记为 `complete`：

- 中枢、projectId、来源清单和本机绑定均唯一；
- A 级核心文件具有精确分母，全部有相对路径与角色；
- 所有 A 级路径均完成解析，且不可读项已明确列出而非隐藏；
- 中枢与清单的差异已经处理或保留为明确冲突；
- 写入均完成稳定 ID 回读；
- 两个真实问答验收可复现；
- 报告明确区分知识映射、文件读取与研究证据三个层级。

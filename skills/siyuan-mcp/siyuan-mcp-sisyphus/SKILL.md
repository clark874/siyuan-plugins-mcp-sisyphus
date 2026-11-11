---
name: siyuan-mcp-sisyphus
description: 思源笔记统一入口：读取与检索资料、保存全文和知识、接续项目、查读文献与论文教学；自动选择必要规程。只读审阅不写入，不处理无关应用。
compatibility: "Requires a reachable SiYuan Sisyphus MCP server already registered in the client; installing this Skill alone does not configure the MCP endpoint or bearer token."
---

# SiYuan Sisyphus with MCP

本入口通过 SiYuan Sisyphus 操作思源笔记。用户只需说明要读什么、保存什么或接续哪个项目；由本入口选择操作规程，不要求记忆场景技能、四个命令、projectId 或 action。先判断是只读、方案还是已授权写入；审阅与方案本身不授权修改。

## 连接与资料发现

新连接先只读启动：

```text
system(action="bootstrap")
```

Sisyphus 是唯一外部思源 MCP 入口（http://127.0.0.1:36806/mcp）；原生 MCP（http://127.0.0.1:6806/mcp）仅作内部扩展总线，不重复注册。以实时笔记本权限、文献目录与能力为准；bootstrap 的 operation.readOnly 只适用于这次调用。

读取虚拟 /AGENTS.md 与 /USER_RULES.md；记忆为空时继续读取当前目录和契约指针，不先要求用户创建记忆。知识录入先读 [资料录入与接续契约](references/recording-contract.md)；既有工作区知识契约可按 name=knowledge-compile-contract 定位，规则正文与历史会话账本分别读取。

项目任务先用 project.snapshot 发现当前状态、资料与文献入口，判断来源和新旧裁决；文献查读先看 bootstrap.literature.libraries 或项目文献目录。summary 只是索引，按返回总数和截断说明继续读稳定块或 full，不把未读部分当作不存在。普通非项目笔记直接定位目标。先索引，再围绕任务读取必要全文；不预设只能读几篇论文或几个块。

## 按用户目标选择规程

| 用户要做的工作 | 入口内部读取的操作规程 |
| --- | --- |
| 查资料、读正文、搜索、追溯来源 | `siyuan-mcp-browse-read` 与 `siyuan-mcp-search-query`；命中后回读原文，名称和模型排序不提升证据状态 |
| 在项目中说“更新思源笔记”“同步本轮成果”或要求项目知识整合 | 读取项目快照和录入契约，按 `siyuan-mcp-project-knowledge-compile` 完成增量原子和关系，再用 `siyuan-mcp-project-coordinator` 提交项目状态。发现项目知识 AV 后同步绑定行，已启用导图在批次收尾后刷新。自然指令已授权本轮项目更新，无需再说“知识化” |
| 保存指定全文或普通文档编辑 | 用 `siyuan-mcp-create-edit` 保存正文和来源；外部网页差量使用 `siyuan-mcp-knowledge-ingest`。用户明确只保存时报告资料层结果 |
| 查项目知识类型、核验状态或待编译材料 | 优先从项目快照发现知识 AV，经 `siyuan-mcp-database` 或知识检索限定候选，再回读绑定块和按需读取有向关系 |
| 接续项目、更新进度、交接或收尾 | `siyuan-mcp-project-coordinator`；自然语言授权有效，四个命令只是快捷入口。明确只更新进度时按指定范围处理 |
| 查读文献、全文入库及三端接续 | `siyuan-mcp-literature-source`；先 AV 和全文，再按缺口用 Zotero／NotebookLM／Jev；开放式文献发现仍交独立学术技能 |
| 论文精读教学 | 仅此时读取 [教学规程](references/paper-teaching.md) 与其正负例，保留卡内完整讲解 |

安装包中的相对参考链接对应实时资源 skill://siyuan/references/<文件名>；无法直接读相对链接时按此 URI 读取。

上述操作规程通过实时资源 siyuan://skills/<场景标识> 按需读取，不安装成额外用户入口。参数不明时查 `siyuan://help/tool-overview` and the relevant `siyuan://help/action/{tool}/{action}` resource。数据库、项目源、时间线、原子治理等只在当前任务需要时读取相应规程，不为展示功能数量而调用。

## 已授权更新的完成条件

指定项目的更新包含思源资料维护时，本轮产生的重要全文、证明、脚本、输出、决策、失败边界和权威入口纳入交付清单；先明确范围，再分别验收完整资料副本、可调用原子、当前状态与入口。用户要求保留全文时，摘要不能替代原文。只读询问、纯方案与无关聊天不触发入库。

name 是确定地址，必须读到承担回答的正文；标题锚点、数据库一行、回读成功或入链数量不能代替内容质量。用户确认的新裁决更新当前状态，旧事件保留并明确接替关系。只报告实际完成的层次和未完成项。

## 安全与降级

- 写前读取；结构化文档按稳定块增量修改；受影响文档保留恢复点，写后回读。
- 严格写入按实时 schema 预检并原样使用 issuedRequestId 与所需凭据；不手造 UUIDv7，不假定所有追加动作都有哈希字段，结果未知先查回执。
- source-checked 表示来源核对；执行和证据核验各自有证据入口，原文写“闭环”不自动升级验证等级。
- 新项目源登记、敏感披露和不可逆操作仍按授权执行；仅暂停受影响步骤，不跳过其他已授权工作。
- 正常使用优先 MCP。没有 MCP 且用户明确要求使用本机 CLI 时，读取 [CLI 后备规程](references/cli.md)，先核对可用命令，禁止隐式 npx 下载。

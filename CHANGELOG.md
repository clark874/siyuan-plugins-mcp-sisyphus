# 更新日志

本文件记录项目的主要版本变更。

## v0.8.2-wiki.1 - 2026-08-18

- 新增可选的“软化可恢复错误”上报模式（设置面板默认关闭）：`validation_error`、`invalid_arguments`、`not_found`、`ambiguous_path`、`invalid_path`、`action_disabled` 六类 Agent 可自行修正的失败，在最外层 MCP 响应边界去除 `isError` 标记，结构化 `error` 载荷原样保留并标记 `softened: true`
- 动因：部分客户端（如 Devin CLI）在任一工具返回 `isError` 时会把整份 `tools/list`（本插件约 118KB / 3.3 万 token）重新注入对话作为纠错提示；软化后此类 dump 触发率趋近于零，而 `permission_denied`、`api_error`、`internal_error` 与写入安全竞态仍保持 `isError`，写入安全协调器与 MCP App 桥接基于原始 `isError` 的内部判断不受影响
- 路径解析类错误恢复语义类型：`not_found` / `ambiguous_path` / `invalid_path` 不再被通用捕获统一误标为 `internal_error`
- 开关开启后 server instructions 追加专门声明，明确无 `isError` 的软化结果不代表执行成功、不得当作写入已应用；新增 24 项单元与集成测试覆盖降级边界、语义码还原和声明文案

## v0.8.1-wiki.2 - 2026-08-16

- 修复 `v0.8.0` 引入读写语义分流后，最近更新侧栏和右侧“近期差异”仍向共享历史服务传递旧版 `request` 客户端，导致界面报错 `requestRead is not a function`
- 两个前端入口现统一提供只读 `requestRead` 适配器；MCP/CLI `timeline.compare_recent` 的既有只读路径保持不变
- 增加最近更新摘要和右侧 Diff 两条界面调用链的契约回归测试，防止客户端请求接口再次漂移

## v0.8.1-wiki.1 - 2026-08-14

- 修复原生 MCP 聚合工具仅按顶层 `readOnlyHint` 分类的问题；`extension → search.semantic/fulltext` 现在依据实际子动作白名单直接返回结果，不再触发不必要的交互确认，也不再被严格写入协调器替换成单独的安全元数据
- 新增稳定发布通道 `release-channel.json` 和中央插件更新器；默认只检查，`--apply` 才会下载或读取安装包、核对 SHA-256、拒绝路径穿越与符号链接、备份当前插件并原子替换，失败时恢复旧版本
- 明确“首次接入”和“后续更新”边界：Kimi、ZCode、Codex、Cursor、Claude、Hermes 等客户端只保存一次 `36806/mcp` 与本地 token，后续仅更新思源中的唯一插件实例并重连
- `system.bootstrap` 新增机器可读的严格写入协议、两阶段调用顺序、不变量和帮助资源，减少不同 Agent 因未加载本地 Skill 而误用写入租约
- CLI 同步提升至 `v0.3.1-wiki.1`

## v0.8.0-wiki.1 - 2026-08-14

- 将定制版正式定位为 LLM Wiki 分支；选择性吸收上游 `v0.6.3` 的原生 `search.semantic`、`fs.reorder` / `document.reorder` 与严格安全写入，不引入重复的嵌入模型设置界面
- 写入类调用默认采用“只读预检 → 当前状态 Hash 凭据 → UUIDv7 请求 ID → 单次写入 → 读回验证”；CLI 与 stdio 统一转发到插件 HTTP 进程内协调器，读请求可重试，写请求不自动重放
- 原生 MCP 桥接由工具名白名单收紧为 action 白名单；工作区读取类原生工具在存在受限笔记本时失败关闭，文档、块、数据库、文件和系统修改类入口继续拒绝
- 新增通用 `system.validate_source_audit`，只验证冻结的 `inventory.json`、`usage-map.json` 与 `baselines.md` 交接契约，不读取源码、不平行执行差异分析、不推断项目结论
- 补齐严格安全写入设置、双语动作文案、工具文档、Skill、API 读写语义、105 个测试文件与生产构建；CLI 提升至 `v0.3.0-wiki.1`

## v0.7.5-local.20 - 2026-08-14

- 新增 `search(action="knowledge")`：调用思源 3.8 嵌入检索后，先按笔记本权限过滤候选，再折叠仅含块引用的命中、去重并优先返回带 `name` 的内容原子，同时附带复用该原子的可读项目文档；响应显式标注查询会外发并可能产生模型费用
- 原生 MCP 桥接改为固定白名单，只开放 `search`、`ref`、`outline`、`web_fetch`、`web_search`；文档、块、文件、数据库、系统及其他写入或宽控制面工具在 Schema 和调用层均硬拒绝，全新安装默认启用这条窄化桥接
- `system.conf` 从默认动作中移除，环境盘点改用 `audit_environment`；兼容保留的精确读取补上递归字段级秘密遮蔽，直接请求 `apiKey`、令牌、密码、Cookie、凭据或私钥也不会返回原值
- 更新 bootstrap、内置 Search Skill、双语工具文档、设置界面与 Agent Kit；CLI 同步提升至 `v0.2.4-local.4`

## v0.7.5-local.19 - 2026-08-13

- 修复 `fs.write(overwrite=true)` 在块属性刚写入、SQL 索引尚未追平时可能放行整篇覆写的竞态：写入前从实时块树枚举全部将被删除的后代，并通过实时属性接口直接回读；思源 3.1.0+ 使用批量接口，旧版自动退回有限并发逐块读取，任一安全扫描异常均失败关闭
- 复杂块检测改为专用全后代遍历，覆盖列表、引述、超级块与表格深处的 `av`、`query_embed`、挂件、HTML 和媒体等思源原生结构
- 保护集合扩展到非空 `memo`、`bookmark`、`style`；文档根块因不会被正文覆写删除而明确排除，避免文档级属性误拒绝
- 新增索引延迟、不可见元数据、深层复杂块、扫描失败关闭、纯 Markdown 放行及文档根块排除回归测试

## v0.7.5-local.18 - 2026-08-13

- 修复 `fs.write(overwrite=true)` 结构化知识资产扫描：改为按 `blocks.root_id` 取文档全部后代，不再复用会在列表/引述/表格等自包含块处停止递归的 Markdown 树序遍历，避免嵌套列表项上的 `name`/`alias`/`custom-*` 与入链目标被漏检
- 明确只保护入链目标与块属性（调用方看不见的侧信道），不因正文出链 `((id))` 硬拒绝整篇覆写，避免误伤普通编辑
- 增加嵌套列表项锚点、嵌套引述入链两个失败回归测试；版本号与 `v0.7.5-local.17` 标签解耦，避免同版本异二进制

## v0.7.5-local.17 - 2026-08-12

- 将 `/AGENTS.md` 从启动提示全文注入改为路径与更新时间状态指针，Agent 通过 `fs.read` 按需读取，避免专题清单重复占用每次 MCP 连接上下文
- `system.bootstrap` 继续把工作区记忆放在 `nextCalls` 首位，同时明确 `fresh` 只按保存时间计算，不代表路径、数量、项目状态或索引已经实时核验
- 新增 MCP/CLI 双运行时 `knowledge-governance` Skill，封装知识原子候选审计、`name`/`alias` 冲突预检、专题中枢与 AV 分工、四层安全改名和 SQL 回读
- 别名审计按逗号分隔词元精确比较；跨文档改名要求逐文档时间线节点和精确范围授权；CLI 包同步提升至 `v0.2.4-local.3`
- 保留完整机器可读的 `plan_change` 判别联合 schema；拒绝用公开契约与运行时校验不一致的瘦身换取微小载荷下降
- 设置页同步说明工作区记忆是简洁路由而不是专题数据库，并补充双语文案、Skill、Prompt、CLI 安装和初始化回归测试

## v0.7.5-local.16 - 2026-08-12

- 将全部 Agent 交付入口统一为单一外部网关：客户端只注册 Sisyphus `http://127.0.0.1:36806/mcp`；思源内置 `http://127.0.0.1:6806/mcp` 仅作为 Sisyphus 可选转发的内部扩展总线，不再要求客户端重复注册
- 新增固定入口 `agent-kit/START-HERE.md` 与机器可读契约 `agent-kit/delivery.json`，明确本地运行前提、首次 `system.bootstrap` 验收标准、Kimi Code/Kimi Work 边界和秘密值规则
- 新增无依赖本地安装器，支持 Kimi Code 与 ZCode；安装器只从本机环境变量或既有受支持配置读取 Bearer token，原子写入 `0600` 配置，保留无关 MCP、生成变更前备份，并支持幂等复跑
- 便携资产统一命名为 `siyuan-agent-kit.zip`，同时保留无密钥 Skill、插件清单和人工配置模板；公开源码、文档与 ZIP 均不包含真实 token
- 增加 Kimi/ZCode 安装、秘密缺失失败关闭、既有配置保留、重复安装和双层 MCP 边界回归测试

## v0.7.5-local.15 - 2026-08-12

- 将 `system.bootstrap` 升级为 schema v2：调用时刷新笔记本权限，隐藏 `none` 笔记本身份，并明确区分“本动作只读”和“连接可能具有写权限”
- 能力摘要改为读取当前 MCP 工具配置；配置读取失败时显式标记 `toolConfiguration.current=false`，不再把默认值误报为实时健康状态
- 根据真实启用 action 生成 `nextCalls`，移除重复的 `notebook.list`，并将插件存储能力正确表述为受控、脱敏读取
- 新增无密钥 `agent-kit`：包含客户端无关启动指令、标准 Agent Skill、Kimi Code 插件清单、MCP 配置模板和 Kimi 安装说明
- 修正本地 ZCode Skill 的 SQL 与时间线 action 名称，移除固定版本和知识库统计，将 token 同步明确限定为用户维护动作
- 增加受限笔记本、实时配置、退化配置、Skill 同步、Kimi 清单与秘密扫描回归测试

## v0.7.5-local.14 - 2026-08-12

- 新增 system(action="bootstrap")一键接入:一次只读调用返回思源版本、可读笔记本与 MCP 权限、能力状态(fs/search/av/timeline)、路径类型指南、推荐后续调用和 Skill 入口
- bootstrap 面向跨客户端快速接入场景,不含 token、配置正文或插件秘密;新 Agent 接入时可作为首个调用,替代多次环境探测
- 配套交付:ZCode HTTP MCP 注册(token 由客户端 headers 承载)、本地入口 Skill siyuan-quick-start、思源 Agent 交接卡状态胶囊
- 补充 action 契约、单元测试与帮助快照;i18n 增加中英文动作标签

## v0.7.4-local.13 - 2026-08-12

- 保持最近更新默认按时间严格排列，新增不持久化的“目录聚合”辅助模式；重新加载插件或重启思源后自动恢复纯时间线
- 目录聚合仅在当前年、月或日时间分组内部生效，并且只聚合同一父文档下至少两篇子文档；单篇、根文档和跨笔记本同路径文档仍按原时间位置显示
- 从思源文档存储路径可靠解析父文档 ID；目录折叠箭头与标题分离，点击标题可直接打开作为目录的父文档，不触发子文档历史 Diff
- 为目录卡片增加独立折叠动画、完整路径、文档计数和双语提示，并补充父级解析、稳定排序、跨笔记本隔离和界面回调测试

## v0.7.3-local.12 - 2026-08-12

- 修复年、月、日折叠状态经辅助函数间接读取后未被 Svelte 模板识别为响应式依赖的问题；点击箭头现在立即更新，不再等待异步摘要碰巧触发重绘
- 为各级时间轴内容加入 160ms 展开与折叠过渡，折叠时保留卡片 DOM，避免重新创建数百张卡片；搜索结果仍强制展开，人工折叠状态保持不变
- 默认仅展开今天，自动分页最多加载两页，防止折叠操作使哨兵暴露后连续读取全库；更多历史仍可通过“加载更早文档”继续读取
- 增加直接状态依赖、动画、默认折叠与分页上限回归测试，并在真实思源窗口逐级验证年份、月份和日期交互

## v0.7.2-local.11 - 2026-08-12

- 修复“最近更新”首次显示时由可见性刷新和挂载刷新同时启动造成的请求竞态；过期请求不再遗留永久 `loading` 状态
- 刷新入口增加互斥保护，并固定每次请求对应的刷新版本，后续事件可在当前请求完成后正常触发新一轮刷新
- 增加首次加载只启动一次、重叠刷新被拒绝的回归测试，并在真实思源窗口核验 SQL 返回和卡片渲染

## v0.7.1-local.10 - 2026-08-11

- 将固定的近期列表改为 SQL 分页时间轴，支持按年、月、日切换粒度，并以独立卡片显示标题、目录、更新时间和懒加载差异摘要
- 修复折叠状态在响应式重算后失效的问题；已有分组保留人工展开或折叠状态，新出现的旧分组才采用默认折叠规则
- 将 `+0/-0` 拆分为正文变更、标题变更、现有检查点正文相同、无历史与历史基线不足五类状态，只有确有正文差异时才显示增删统计；历史归档路径不再被误判为修改前目录
- 重排统一与并排 Diff 的变更标签，使状态和章节路径占据独立行；窄窗口改为纵向布局，避免标签覆盖正文
- 在空白 Diff 面板及文档树右键菜单加入“比较最近历史”，任意当前文档无需先创建命名时间线节点即可进入只读历史比较
- 共享最近历史服务同步补充当前标题和存储路径读取；CLI 本地维护版本提升至 `v0.2.4-local.2`

## v0.7.0-local.9 - 2026-08-11

- 将“最近修改”按今天、昨天、近 7 日具体日期和较早月份分组，较早月份默认折叠，检索时自动展开命中分组
- 点击最近文档后同步打开正文与右侧 Diff，默认选择最近一个内容不同的思源原生文档历史检查点，不再为此创建工作区快照
- 复用块级 Diff 引擎显示修改、新增、删除状态、章节标题路径、增删行统计，并支持点击差异定位当前文档块
- 新增只读 `timeline.compare_recent`，返回基线时间、章节路径、修改前后内容与分页统计；沿用笔记本读取权限且不开放历史回滚
- 命名时间线继续作为长期人工基线，并在右侧与“近期差异”明确区分；近期差异模式隐藏全部回滚入口

## v0.6.4-local.8 - 2026-08-11

- 新增独立的“最近修改”左侧栏入口，直接使用思源原生文档更新时间序列，不依赖快照节点，也不改写父文档更新时间
- 列表按文档根块的实际 `updated` 时间降序显示，并补充文档路径、修改时间、搜索、手动刷新与单击打开能力
- 修改、重命名、移动、新建或删除文档后自动使列表失效并在侧栏可见时刷新；侧栏隐藏时不执行无效请求
- 新增独立设置开关和完整生命周期测试；关闭文档时间线不影响最近修改视图，关闭最近修改视图也不影响时间线

## v0.6.3-local.7 - 2026-08-11

- 新增 MCP 与 CLI 双运行时的知识摄取 Skill，将网页剪藏和 Agent 检索统一为来源规范化、既有知识盘点、差量决策、时间线保护、块与 AV 写入、SQL 回读和幂等复跑流程
- 新增来源网址规范化与正文 SHA-256 脚本，并提供重复输入、只捕获模式和版本冲突三类 Skill 评测样本
- 将辅助脚本纳入单一生成源和 Skills-over-MCP 完整性清单，收紧协议、凭据及秘密参数处理，并将独立 CLI 提升至 `v0.2.4-local.1`
- 使用 Scattertext 官方仓库、spaCy Universe 与 Penn Libraries 教程完成真实知识库试验：复用既有中枢，登记三个来源块和三行资产记录，不创建重复教程文档

## v0.6.2-local.6 - 2026-08-11

- 修复 `search.query_sql` 对聚合、`GROUP BY` 与递归 CTE 结果的静默吞行，全部笔记本可读时直接返回分析结果
- 收紧裸 SQL 安全边界：每次查询前实时重载权限；任一笔记本为 `none` 时拒绝整个裸 SQL 动作，避免通过隐藏或伪造来源列绕过权限
- 移除 SQL 结果逐行归属解析；其他可信搜索结果改用直接笔记本字段快路径和最多 8 路并发的归属解析
- 新增 `maxRows` 参数，默认 200、硬上限 1000，并保留显式截断元数据与 SQL `LIMIT/OFFSET` 指引
- 增加聚合、属性分组、递归 CTE、权限实时性、来源伪造风险和 100/300 行输出回归测试

## v0.6.2-local.5 - 2026-08-11

- 修复插件安装后的核验误判：兼容思源“已安装插件”接口不回传集市 `repoHash` 的实际行为
- 安装计划仍在执行前固定并核对集市修订号；执行后改为联合核对插件名、版本、仓库地址、`plugin.json` 与完整内容树
- 修复集市兼容性筛选：同时考虑 `bazaarIncompatible` 与 `disallowInstall`，排除因思源版本不足等原因被禁止安装的候选
- 对非空且冲突的已安装修订号继续拒绝，保留计划、确认、自动恢复、审计与显式回滚安全链路

## v0.6.2-local.4 - 2026-08-11

- 新增只读插件集市目录：统一检索插件、挂件、主题、图标与模板，支持关键词、安装状态、兼容性、前端类型、排序和分页筛选
- 新增集市包精确查询，将在线元数据与本地安装、启用、版本和更新状态合并返回，便于 Agent 识别重复功能与升级候选
- 新增集市 README 安全读取：由服务端解析仓库坐标，移除脚本与 HTML 标签，遮蔽秘密字段并限制正文长度，同时返回内容摘要哈希
- 集市浏览保持只读；插件安装、更新、卸载继续通过工作区控制面的计划、确认、核验和回滚链路执行

## v0.6.1-local.3 - 2026-08-11

- 新增思源工作区控制面：读取单个插件、插件更新目标、代码片段摘要、插件专属存储和脱敏配置，并通过声明式适配器与通用分类器解释高价值插件设置
- 新增 `plan_change`、`apply_change`、`rollback_change` 两阶段变更链路，覆盖插件启停、代码片段、插件文本配置、允许的系统设置以及插件安装、更新和卸载
- 对所有执行计划保存状态哈希与回滚快照，通过不可自动接管的持久目录锁跨插件进程、独立 MCP 与 CLI 按真实资源范围互斥；执行前拒绝过期或漂移计划，执行后强制回读核验，回滚前拒绝覆盖更新状态
- 插件更新与卸载在修改前通过思源归档接口保存精确插件目录，以逐文件内容清单、ZIP SHA-256 和隔离解压复核三重验证；显式回滚持久化中间状态和失败诊断并支持安全重试
- 隔离内部控制面审计目录，设置修改改为分区字段白名单并永久排除 `pandocBin` 等本地执行入口
- 永久排除账户、鉴权、同步、仓库、加密、AI 密钥、令牌、Cookie、密码、私钥、任意文件系统访问和无法恢复的物理删除
- 增加双语设置项、系统工具文档、工具合同、安全单元测试、回滚测试和只读 MCP 评测集

## v0.6.0 - 2026-08-09

- 升级至 MCP TypeScript SDK v2，支持 MCP 2026-07-28 无状态 HTTP 与新旧 stdio 协议自动协商，同时保留 2025 代 HTTP 会话兼容
- 接入 SEP-2640 Skills-over-MCP，默认通过 HTTP 与 stdio 发布全部工作流 Skill，提供五个工作流 bundle 与 Codex agent plugin，并保留稳定的 Resource 与 Prompt 回退路径
- 补充协议级 elicitation 危险操作确认、Tool 结构化输出和元数据，完善设置开关、双语文档与回归测试
- 新增闪卡复习、文档时间线与猫猫商店 MCP Apps，用专用启动 Tool 和模型不可见的 App action 隔离 AI 与人工交互权限
- 固定闪卡候选快照并按笔记本权限补全题面与答案，优化时间线 Diff 二次确认与猫猫购买反馈
- 重构本地分析面板为 52 周活动热力图、调用来源环形图和 Token 对比图，并优化猫猫外观设置、待机动画、抚摸与拖拽反馈
- CLI 官方 MCP 桥接同步升级协议自动协商能力，CLI 包提升至 v0.2.3

## v0.5.2 - 2026-08-05

- 将文档时间线完整开放为 `timeline` 聚合工具，MCP 与 CLI 均可创建、列出、比较和删除节点，并执行整篇或块级回退
- 强化 diff 能力：按块解析新增、删除、修改与未变更内容，提供行数统计、分页结果和可回退性判断，使用新鲜 `changeKey` 防止基于过期差异误操作
- **感谢 [@xyx2233](https://github.com/xyx2233) 提交 [PR #45](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/pull/45)**，为文档级时间线节点与本次 diff 强化提供基础
- 完善高风险 action 权限、帮助提示、官方 Skill、双语文档与测试覆盖；CLI 包同步提升至 v0.2.2

## v0.5.1 - 2026-07-28

- 隔离思源官方 MCP 扩展链路：仅在需要扩展 Tool 时惰性连接，连接失败时完整降级，不再影响 Sisyphus 自带工具、CLI 与外层 MCP Server 启动
- 在设置页新增 MCP 与 CLI 配置 Prompt 一键复制，引导 AI 安全合并连接配置并完成只读验证；更新日志升级为默认仅展示最新版本、可展开滚动查看历史的时间轴
- 同步完善双语文案与测试覆盖；CLI 包提升至 v0.2.1

## v0.5.0 - 2026-07-28

- 正式接入思源官方 MCP 插件生态，新增 `extension` 聚合工具，可动态发现、筛选并调用其他插件注册的 Tool，同时保持原有工作流兼容
- 支持按需桥接思源原生 MCP Tool，默认关闭高权限入口，并在设置页补充来源、Schema 体积与风险提示
- 同步完善 CLI、双语文档、场景说明与测试覆盖；CLI 包提升至 v0.2.0

## v0.4.15 - 2026-07-23

- 统一 `document` 与 `fs` 长文档读取的完整显示块分页，补强块边界、参数别名、token 估算和精简响应，避免分页截断结构化内容
- 新增文件树笔记本权限徽标与快捷切换，并全面优化设置页导航、响应式卡片、权限状态、工具风险标签和猫猫实时预览
- 同步刷新中英文帮助、场景 Skill 与测试覆盖；CLI 包提升至 v0.1.18，插件和 CLI 共享一致的分页行为

## v0.4.14 - 2026-07-16

- 新增面向浏览、编辑、搜索、数据库、导出等场景的 MCP Skill 资源与 Prompt，让 Agent 可按任务发现并加载工作流和安全指南
- CLI Skill 命令支持 `cli`、`mcp`、`all` 套件选择，并统一生成、校验和打包两套 Skill；CLI 包同步提升至 v0.1.17
- 修复时间线 Dock、搜索 Schema 与猫猫冷启动状态恢复问题，猫猫在新安装或无有效配置时默认不显示

## v0.4.13 - 2026-07-04

- 新增 MCP HTTP 绑定地址选择，可在仅本机访问与所有 IPv4 网卡监听之间切换，远程和局域网部署配置更明确
- **感谢 [@Ciciy-l](https://github.com/Ciciy-l) 提交 [PR #43](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/pull/43)**，贡献 MCP HTTP 绑定地址选择能力
- 收起关闭笔记本权限列表，优化设置面板的权限配置与浏览体验
- 优化错误码统计与文件图标展示，并补充绑定地址、配置同步和统计相关测试覆盖
- CLI 包同步提升至 v0.1.16，短命令别名由 `siyuan` 改为 `sisyphus`，避免与思源官方 CLI 冲突

## v0.4.12 - 2026-06-22

- 强化 `fs`、文档、块级替换与模板相关操作，提升 AI 通过人类可读路径安全读写笔记的稳定性
- 完善系统更新日志、同步触发、参数别名、响应摘要与帮助资源，统一 MCP 与 CLI 的调用体验
- 补齐新增 action 的中英文设置面板文案，并增加 i18n 覆盖测试，避免漏翻译进入发布包
- 补齐 live smoke 发布验证链路，CLI 包同步提升至 v0.1.15

## v0.4.11 - 2026-06-03

- 在中英文 README 中新增赞助致谢，感谢近期赞赏支持者
- 插件版本提升至 v0.4.11，CLI 包保持 v0.1.14

## v0.4.10 - 2026-06-03

- 新增文档时间树启用开关，关闭后会移除 Dock、命令与编辑器监听
- 修复设置面板 checkbox 状态同步，避免开关保存后显示不一致
- 优化调试、遥测与猫猫设置项的响应式刷新和保存流程

## v0.4.9 - 2026-05-24

- 为不会自动注入 MCP `server.instructions` 的 Agent 提供兜底提示词，降低首次连接时缺少工具使用约定的风险
- 补强虚拟 `/AGENTS.md` 与用户规则的初始化提示，让 Agent 更容易发现工作区记忆入口
- CLI 包同步提升至 v0.1.14

## v0.4.8 - 2026-05-24

- 猫猫显示支持自定义配色，用户可在设置页调整猫猫外观，让 MCP 操作提示更贴合个人主题
- 新增反馈工具与设置页手动反馈入口，AI Agent 可主动提交问题反馈，用户也可直接发送使用体验与建议
- 新增虚拟 `/AGENTS.md` Agent 记忆入口，便于将工作区约定注入 MCP 初始化提示；CLI 包同步提升至 v0.1.13

## v0.4.7 - 2026-05-20

- 优化文档时间线 diff 视口联动，历史版本切换与块级定位时滚动体验更稳定
- 延迟注册并规范化文档时间线停靠栏入口，降低冷启动与布局未就绪场景下的入口丢失风险
- **感谢 [@alone-tree](https://github.com/alone-tree) 提交 [PR #33](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/pull/33)**，优化思源 API 超时处理
- 补充赞赏支持入口与相关展示信息，方便用户在 README 与插件元数据中找到支持方式

## v0.4.6 - 2026-05-17

- 修复思源冷启动后文档时间线 dock 按钮未显示的问题，确保布局就绪后自动注册入口
- 修正文档时间线顶部快照计数，改为显示当前文档相关的时间线节点数量
- 优化 diff 顶栏层级，避免块级回退按钮滚动时遮挡历史版本/当前状态栏

## v0.4.3 - 2026-05-16

- 优化 MCP/HTTP 连接稳定性与错误提示，降低远程调用和客户端断连场景下的失败噪声
- 修复 `file.extract_doc` 解析图片资源路径时误包含标题文本的问题，提升文档资源导出准确性
- **感谢 [@alone-tree](https://github.com/alone-tree) 提交 [PR #25](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/pull/25) 与 [PR #26](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/pull/26)**，贡献连接稳定性和附件路径解析修复
- 改进设置面板主题兼容与 CLI skills 安装引导，CLI 包同步提升至 v0.1.12

## v0.4.2 - 2026-05-15

- 优化文档时间线 diff 展示：支持统一/并排双模式对比、diff 缩略图导航、隐藏未变更块的上下文折叠、新增/删除行统计
- 改进块级差异算法：精确限制代码块 raw DOM 回退场景，补充列表类型支持
- 完善时间线交互细节：智能初始版本选中、国际化文案与测试覆盖

## v0.4.1 - 2026-05-15

- 修复文档时间线回退时代码块 payload 处理异常的问题
- 重构 Skill 体系：将原有 skill 拆分为浏览阅读、创建编辑、数据库、文件导出、搜索查询、系统 CLI、标签闪卡等 7 个独立 skill，降低 Agent 上下文占用
- 补充 block-diff 与工具配置同步的单元测试覆盖

## v0.4.0 - 2026-05-14

- 新增 **文档时间线（Document Timeline）**：基于思源快照为单篇文档提供版本控制，支持创建节点、左右对比差异、块级回退与整篇回退，配套侧边栏与顶部栏入口
- 新增 `file(action="extract_doc")`：将文档和所有引用资源导出到自包含的未压缩文件夹，AI 工具可直接读取附件内容
- **感谢 [@alone-tree](https://github.com/alone-tree) 提交 [PR #21](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/pull/21)**，贡献 `extract_doc` 文档与附件导出能力
- 重构工具设置面板：默认折叠为手风琴样式，扁平化设计；权限管理独立为单独面板，提升大工具列表下的浏览效率
- 补充 extract_doc、block-diff、timeline 与工具配置同步的单元测试覆盖

## v0.3.8 - 2026-05-06

- 精简 MCP 响应输出，移除冗余字段降低上下文占用
- 块级精确 replace：支持在指定块范围内精准替换内容
- 优化设置面板统计页面，新增 Debug 面板便于排查问题
- CLI 支持 action 别名与位置参数，`fs` 工具命令更符合直觉
- 修正 av、flashcard、document 等工具的 help 文案与参数校验
- CLI 包同步提升至 v0.1.8

## v0.3.7 - 2026-05-06

- 新增 `fs` 类文件系统文档操作工具：支持通过人类可读路径进行 ls、tree、read、write、replace、rm、mv、search 操作，让 AI 像直接编辑 Markdown 文件一样读写笔记，屏蔽思源块、文档树与 ID 结构的复杂性
- 工具内部目录重构：将共享基础设施统一归拢到 `tools/internal/`，新增 `helpers/` 子目录存放跨工具辅助函数
- 新增国际化（i18n）基础支持：前端设置面板与提示文案支持中英双语切换
- CLI 包同步提升至 v0.1.7

## v0.3.6 - 2026-04-29

- Cherry Studio MCP 配置预设更新为 `streamableHttp` 格式，与 Cherry Studio 最新 MCP 客户端规范对齐
- HTTP Server 设置面板 `Cherry Studio` 预设从文本行表单字段改为标准 `mcpServers` JSON 输出
- 配套更新中英文 README 与部署文档中的 Cherry Studio 配置示例

## v0.3.5 - 2026-04-27

- AV 工具对齐思源"复制为镜像"实现：`duplicate` 通过复制 AV 定义、spun AV block DOM 与 transaction 插入生成镜像数据库块，空 AV 与有行 AV 均可复制
- `av.render(createIfNotExist=true)` 改为同样的安全物化路径，避免前端收到不完整数据库块 DOM 后触发 `innerHTML` 空引用错误
- AV 写操作对齐思源前端 transaction 流程：`add_rows`、`remove_rows`、`add_column`、`remove_column`、`set_cells` 改用 `insertAttrViewBlock` / `removeAttrViewBlock` / `addAttrViewCol` / `removeAttrViewCol` / `updateAttrViewCell`，并补充数据库块 `updated` 更新
- AV 权限与上下文解析增强：空 AV 可从行绑定块、镜像数据库块或 blocks 表中的 AV 块记录自动解析 owning database block；`blockID` 保留为精确上下文与兜底参数
- 移除 AV 上下文解析中的通用 `getDocInfo(avID)` 回退，减少思源内核 `blockinfo.go:61 load tree by root id ... failed` 噪声日志
- Document 工具 `lookup` 智能容错：当 `path` 参数传入人类可读路径而非存储路径时，自动按 `hpath` 解释并返回兼容提示
- HTTP Server 设置面板预设文案规范化，stdio 配置生成包含 `type` 字段
- Flashcard `list_cards` 支持 `reviewedCards` 透传；`create_card` 简化实现，依赖思源 `addRiffCards` 自动处理卡组绑定
- Block / Document 属性写入统一走 `transaction API`，与思源前端行为一致
- 聚合工具变体定义全面改用 Zod 自动生成 JSON Schema，消除手动维护的重复代码
- 新增 action-contract、notebook、system、tag 单元测试；HTTP 面板增加 7 个 MCP 客户端配置预设

## v0.3.4 - 2026-04-26

- AV 工具 `add_rows` 支持通过 `primaryKeyTexts` 直接添加 detached 游离行，无需绑定现有内容块；`batch_set_cells` 修复 cell value 构建方式，确保批量写入正确生效
- Search 工具 `query_sql` 的只读校验全面升级，新增完整 SQL 词法分析器，能正确穿透注释、字符串字面量、WITH RECURSIVE / MATERIALIZED CTE 等复杂语法，彻底阻断 mutation 注入
- Flashcard 工具 `review_card` 的 `reviewedCards` schema 收紧为带 `cardID` 必填字段的结构体，与思源内核读取行为一致
- MCP Server 配置缓存 TTL 从 30s 降至 1s，降低设置面板修改后的生效延迟
- CLI 包版本同步提升至 v0.1.5，文档与单元测试同步刷新

## v0.3.3 - 2026-04-21

- 修复并强化 AV（数据库块）的权限校验与 materialization 流程：写操作支持传入 `blockID` 做精确数据库块归属验证；新建 AV 后增加 mirror registration 轮询确认，避免后续写入因块未注册而失败
- CLI 新增 `config` 命令，支持多 profile 管理（`list`/`get`/`set`/`use`），便于在多思源实例间快速切换
- CLI 支持交互式分页浏览，分页结果可在终端内通过 Enter/n/p/q 直接翻页，脚本场景仍可通过 `--page` / `--page-size` / `--json` 精确控制
- MCP 新增 token 消耗洞察：每次调用记录 request/response 的近似 token，分析面板展示 CLI 与 MCP 的 token 成本对比，帮助用户按场景选择连接方式
- 服务端指令拆分为独立 `server-instructions.ts`，降低 server.ts 复杂度
- 文档站点结构重组，VitePress 导航拆分为 getting-started、reference、architecture、development 四大板块，中英文同步更新
- HTTP Server 设置面板体验优化，配置提示与交互细节改进
- 补充 CLI config、dispatch、render、args 及 AV、token-usage、analytics 等模块的单元测试覆盖

## v0.3.2 - 2026-04-20

- 修复设置面板加载时因跨 chunk 模块解析失败导致的配置初始化异常
- 将 tool-config 与 telemetry-config 内联至 setting 目录，避免 re-export 依赖在插件环境中的加载问题
- 同步调整配置一致性测试，确保 setting 与 mcp 两侧行为对齐

## v0.3.1 - 2026-04-20

- CLI 调用链路接入完整 tool lifecycle，analytics 与 telemetry 事件同步持久化，猫猫挣米与调用统计在终端场景下即时生效
- 分析面板「传输方式」升级为「调用来源」，新增 CLI 分类并与 stdio / http 并列展示，国际化文案同步刷新
- 移除 cli 包对 siyuan-sisyphus 的循环依赖，避免本地安装时的版本冲突
- 配套更新文档结构、帮助资源与单元测试覆盖

## v0.3.0 - 2026-04-18

- CLI 工具 `siyuan-sisyphus` 预览版上线，发布至 npm，支持通过命令行直接调用全部 10 个聚合工具的 115+ action
- 支持 `init` 交互式配置、`list` / `help` 命令查询工具与 action，以及全局 `--json` / `--debug` / `--config` / `--url` / `--token` 等 flag
- 支持 kebab / camel / snake 混用 flag 命名、`--<key>-json` 侧车参数传入复杂对象与数组，以及通过 `jq` 管道处理 JSON 输出
- 双语文档同步更新，在 README 开篇新增 CLI 简介与快速示例，插件介绍文案同步扩展为「插件 + CLI」双重定位

## v0.2.11 - 2026-04-18

- 修复并补全 AV（数据库块）创建能力：`av(action="render_attribute_view")` 新增 `createIfNotExist=true` 参数，支持在指定文档中创建新的数据库块，解决此前无法通过 MCP 新建数据库的问题
- 配套更新权限校验逻辑、错误翻译规则、帮助文案、API 文档与单元测试覆盖

## v0.2.10 - 2026-04-16

- 引入 `defineTool` 工厂统一所有聚合 tool 的定义模式，拆分设置面板为 HttpServer / Puppy / Telemetry / ToolCategories / UserRules 五大子面板，并新增遥测与分析模块，支持调用统计、错误率与耗时分布洞察
- 补全 `flashcard` 工具的 `create_card` action，支持将已有块完整转为闪卡（自动写 `custom-riff-decks` 并完成 riff 注册），action 总数扩展至 115
- 同步更新双语文档、帮助资源、国际化文案与测试覆盖

## v0.2.9 - 2026-04-14

- 合并成对 action 为单一动作：notebook 的 `open`/`close` 合并为 `set_open_state`、document 的 `set_cover`/`clear_cover` 合并为 `set_cover`、block 的 `fold`/`unfold` 合并为 `set_fold_state`、file 的 `get_doc_assets`/`get_doc_image_assets` 合并为 `get_doc_assets`，通过布尔或枚举参数控制行为，减少工具数量并提升调用一致性
- 优化 AV 搜索返回结构，补充 searchScope 与空结果 warning 提示，改善 AI 对搜索范围的感知
- 同步更新 API 映射文档、双语文档与单元测试覆盖

## v0.2.8 - 2026-04-14

- 增强 search 聚合工具：支持类型短码自动展开、sortBy 别名、parentId 与 hasTags 过滤，并优化搜索结果瘦身（字段裁剪、内容截断、excerpt 提取），显著降低 AI 消费时的 token 占用
- 修复闪卡（flashcard）工具在 add_card / remove_card 时的状态校验与重试逻辑，解决文档块误加入卡组和 get_cards 返回未解析内容的问题
- 补充 search 与 flashcard 的单元测试覆盖，提升相关模块稳定性

## v0.2.7 - 2026-04-13

- 新增完整的 API 接口映射文档（API_COMPLETE_MAPPING.md），提供全量 90+ 个 action 的详细说明
- 补强 block、document、file、search、av 等聚合 tool 的 action 支持，提升工具覆盖度
- 引入 normalize 模块统一参数处理逻辑，增强请求健壮性
- 重构文档目录结构，迁移至 VitePress 站点（docs/），改善文档浏览体验
- 补充单元测试和冒烟测试覆盖，新增 normalize、av、block、file 等测试套件

## v0.2.6 - 2026-04-12

- 调整 MCP 工具配置加载策略，统一以思源 API 中的 `/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpToolsConfig` 作为唯一优先真相源；无论是插件模式还是 standalone 模式，都会先尝试通过 `SIYUAN_API_URL` / `SIYUAN_TOKEN` 读取同一份配置
- 移除 standalone 模式下默认从本地文件系统探测 `mcpToolsConfig` 的行为，不再依赖 `SIYUAN_DATA_DIR`、`~/SiYuan/...`、`~/.siyuan/...` 或 Windows `APPDATA` 等本机路径猜测，避免本地 MCP 进程误读另一份工作区配置
- 取消 `SIYUAN_MCP_TOOLS` 在服务端工具配置加载链路中的隐式覆盖作用；当 API 配置缺失、为空或内容无效时，直接回退到内置默认工具配置，减少多来源配置叠加带来的歧义
- 修正 standalone / Docker / 远端部署场景下的配置一致性问题：当 `mcp-server.cjs` 运行在独立 Node 进程或容器中，并通过网络连接远端 SiYuan 时，`listTools`、服务端 instructions 与实际工具调用将基于同一份远端插件配置，不再出现“API 指向远端、配置却来自本地磁盘”的错配
- 保留 `isPluginMode()` 对 UI 刷新等插件上下文相关能力的区分，仅将“工具配置读取”从运行模式判断中解耦；standalone 仍可正常使用 API 驱动的 MCP 能力，而插件专属的界面刷新逻辑继续只在插件模式下执行
- 补充并更新集成测试，覆盖以下关键场景：standalone 模式依然通过 API 读取工具配置、API 返回无效 JSON 时回退默认配置、`SIYUAN_MCP_TOOLS` 不再影响工具列表，以及 HTTP 并发访问下配置读取行为保持稳定

## v0.2.5 - 2026-04-11

- 新增独立模式（standalone mode）支持，优化 schema 定义与兼容性
- **感谢 [@JRbemt](https://github.com/JRbemt) 提交 [PR #10](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/pull/10)**，贡献 standalone 模式与 schema 修复

## v0.2.4 - 2026-04-10

- 移除插件内置的数据仓库快照管理侧边栏与相关 repo API 封装；该能力与思源官方快照工具重复，后续请使用「主菜单 → 数据历史 → 数据快照」

## v0.2.3 - 2026-04-10

- 扩展插件运行平台支持，新增 docker 后端与 browser-desktop、desktop-window 前端
- 提升插件在多环境下的兼容性

## v0.2.2 - 2026-04-10

- 为数据仓库快照管理新增独立侧边栏 UI，支持可视化创建快照、查看历史、对比差异与一键回滚
- 优化快照标签置顶与列表刷新交互，提升数据管理操作便捷性

## v0.2.1 - 2026-04-09

- 新增**数据仓库快照管理**功能，提供完整的快照列表、创建、对比、回滚能力，支持标签置顶标记与侧边栏 UI 操作
- 补强 HTTP 传输层并发安全性，修复多客户端同时连接时的竞态问题
- 补充 HTTP 并发场景集成测试，提升传输层稳定性

## v0.2.0 - 2026-04-09

- 新增 **HTTP Streamable 远程传输模式**，`mcp-server.cjs` 支持通过 `--http` 或 `SIYUAN_MCP_TRANSPORT=http` 启动 HTTP 服务，多个 MCP 客户端可同时连接同一台思源（Stateful 会话，每会话独立 Server 实例），解决 WSL/远程 agent 难以走 stdio 的痛点
- 在插件设置面板新增「🌐 HTTP Server」分区，支持一键启停、随思源自动启动、Bearer Token 鉴权、客户端配置片段（直连 HTTP 与 mcp-remote 桥接两种）一键复制
- 内置安全防护：默认绑定 `127.0.0.1`，绑定到非回环地址且未开启鉴权时显示警告；token 自动随机生成，可一键重置
- 配套环境变量：`SIYUAN_MCP_TRANSPORT`、`SIYUAN_MCP_HOST`、`SIYUAN_MCP_PORT`（默认 36806）、`SIYUAN_MCP_TOKEN`、`SIYUAN_MCP_PATH`（默认 `/mcp`）

## v0.1.17 - 2026-04-09

- 新增 `flashcard` 聚合 tool，支持闪卡复习、卡组管理、卡片增删等 7 个 action，完善思源记忆卡片能力
- 重构双语文档，新增快速入门指南与 MCP 概念说明，降低新用户上手门槛
- 同步更新预览图、国际化文案与测试覆盖，工具总数扩展至 10 个聚合 tool

## v0.1.16 - 2026-04-07

- 新增 UI 自动刷新机制，在文档、块、笔记本等变更操作后自动触发界面同步，减少手动刷新
- 优化数据库块（AV）的行/单元格操作语义，改进写入链路的 ID 处理与返回值提示
- 同步补充调试脚本与回归测试，提升问题定位效率

## v0.1.15 - 2026-04-07

- 修正 `av` 行/单元格 ID 语义，明确区分源块 ID、行 item ID 与 value ID，并让 `add_rows`、`set_cell`、`batch_set_cells` 在写链路里返回或提示可写 `rowID`
- 补齐 `av` 对 `mAsset`、`lineNumber` 等字段类型的支持，优化数据库块复制后的插入与可读性校验，减少真实数据库操作时的歧义
- 同步补充 `mascot` 挣米规则、回归测试手册与双语文档说明，刷新 AV / mascot 相关测试覆盖

## v0.1.14 - 2026-04-05

- 新增 `siyuan://help/ai-layout-guide` 帮助资源，并在 tool overview 与服务端系统提示中补充 SiYuan 布局决策规则，帮助 AI 更稳定地区分标题、callout、超级块、可渲染代码块、嵌入与数据库块
- 强化标签、书签、闪卡等语义说明，明确分层标签写法、书签应走块属性，以及布局选择与复习标记是两类不同能力，减少内容生成时的误判
- 同步刷新技能说明与冒烟测试，校验默认 8 个聚合 tool、AI 布局帮助资源和关键提示文案，降低后续回归成本

## v0.1.13 - 2026-04-04

- 移除对 `getApiToken` 的错误依赖，统一兼容“有 token 则带鉴权、无 token 则按无鉴权模式访问”的思源 API 请求方式
- 修复 `SIYUAN_API_URL` 末尾带 `/` 时拼接出 `//api/...` 路径的问题，解决部分请求返回空响应并触发 JSON 解析报错的情况
- 同步精简服务端启动逻辑、删除未使用的 token helper，并补齐集成测试与双语文档说明，明确“开启 API 鉴权时必须配置 token”

## v0.1.12 - 2026-04-04

- 新增 `mascot` 聚合 tool，并加入余额查询、商店浏览与购买能力，让 MCP 交互多了一层轻量陪伴反馈
- 修复思源 API 地址与鉴权读取流程，优先支持 `SIYUAN_API_URL` / `SIYUAN_TOKEN` 环境变量，改善 Docker 等部署场景下的可用性
- **感谢 [@Jasaxion](https://github.com/Jasaxion) 提交 [PR #6](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/pull/6)**，贡献 API 地址、Token 鉴权与 Docker 兼容修复
- 同步更新双语文档、技能说明、设置项文案与回归测试，补齐第 8 个聚合 tool 的说明与发布信息

## v0.1.11 - 2026-04-03

- 新增 `document` 的 `set_cover` / `clear_cover` 语义化能力，支持更顺手地设置与清空文档头图
- 将 `file(action="upload_asset")` 调整为本地文件路径上传，并补充大文件阈值确认流程，提升本地文件读写安全性
- 同步完善工具说明、设置页文案、接口映射与回归测试，减少 MCP 客户端接入歧义

## v0.1.10 - 2026-04-03

- 优化聚合 tool 的行为一致性，补齐参数语义、返回结构与边界场景处理
- 强化权限校验、路径规范化与帮助信息展示，提升 MCP 集成稳定性
- 同步更新双语文档、接口说明与测试用例，降低接入和回归成本

## v0.1.9 - 2026-04-03

- 升级笔记本 MCP 权限模型为 `none` / `r` / `rw` / `rwd`，并同步更新配置界面、帮助文档与多语言文案
- 强化 `document` / `block` / `file` 相关行为，包括更明确的 move 语义、结构化返回结果与资源导出路径规范化
- 补充 MCP 服务端说明、资源描述、接口映射与集成/单元/联调测试覆盖

## v0.1.8 - 2026-04-02

- 新增笔记本与文档 emoji 图标设置能力
- 对外 MCP 工具面恢复为 7 个聚合 tool（`notebook`、`document`、`block`、`file`、`search`、`tag`、`system`）

## v0.1.7 - 2026-04-02

- 新增笔记本与文档 emoji 图标设置能力
- 补充 `search` 聚合 tool，支持全文搜索、SQL 查询、标签搜索、反向链接与反向提及

## v0.1.5 - 2026-04-02

- 对外 MCP 工具面收敛为 4 个聚合 tool（`notebook`、`document`、`block`、`file`）
- 新增笔记本级权限守卫
- 对高危 action 增加执行前明确确认约束
- 新增按笔记本/文档查询直属子树的 action

## v0.1.4 - 2026-02-26

- 首次安装时自动生成 MCP 配置文件

## v0.1.3 - 2026-02-22

- 删除无关 dock/debug/menu 配置项，减少干扰

## v0.1.2 - 2026-02-21

- 合并 MCP 工具配置入口
- 增加配置读取双路径回退机制

## v0.1.1 - 2026-02-21

- MCP 配置路径调整为 `siyuan-plugins-mcp-sisyphus`
- 文档补充报错说明

## v0.1.0 - 2026-02-20

- 更新插件图标与预览图资源

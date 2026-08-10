# system

该工具聚合思源系统状态、扩展包、代码片段、插件配置和受控工作区变更。运行状态读取与知识内容操作分离；所有目标修改都经过计划、确认、核验和回滚链路。

需要读取运行环境、解释插件设置或调整工作区行为时使用本页。笔记正文仍使用 `fs`、`document`、`block` 和 `av`。

相关页面：

- [权限控制](../permissions.md)

## 动作分组

| 分组 | 动作 |
|------|------|
| 基础信息 | `get_version`、`get_current_time`、`changelog` |
| 环境与扩展包 | `conf`、`network`、`workspace_info`、`audit_environment`、`list_packages`、`get_plugin`、`list_plugin_updates` |
| 代码片段 | `list_snippets` |
| 插件存储与解释 | `list_plugin_storage`、`read_plugin_storage`、`inspect_plugin` |
| 变更控制 | `plan_change`、`apply_change`、`rollback_change`、`discard_change_plan`、`list_control_changes`、`get_control_change` |
| 通知与同步 | `notify`、`perform_sync` |

## 读取规则

- `workspace_info` 会暴露工作区绝对路径，属于需要确认的高风险读取。
- `conf` 只返回思源官方接口提供的脱敏配置；优先使用 `mode="summary"`，再用 `mode="get"` 读取单个路径。
- `list_packages` 返回已安装扩展包的精简元数据，不返回 README 或配置正文。
- `list_plugin_updates` 同时读取已安装插件和在线集市元数据，明确给出当前版本、目标版本、仓库与目标修订，不执行更新。
- `list_snippets` 默认不返回正文，只返回类型、状态、字符数和 SHA-256。只有指定 `snippetID` 才能请求正文，且仍会遮蔽秘密并截断。
- `list_plugin_storage` 只能进入已安装插件的专属存储根；调用方不能指定根目录。递归深度最多 4 层，单次扫描最多 200 项。
- `read_plugin_storage` 只读取 128 KiB 以内的安全文本。数据库、压缩包、二进制、凭据文件、路径穿越和符号链接均被拒绝；插件存储根本身也必须是普通目录。
- 本插件的 `control-plane/` 审计目录在列举和读取接口中永久隐藏，原始快照只能由内部回滚流程访问。
- `inspect_plugin` 区分声明式字段说明、名称推断和未知字段，不把推断写成确定语义。

## 变更流程

所有目标修改使用统一的两阶段协议：

1. 调用 `plan_change`，读取当前状态并生成有期限的计划、脱敏差异、风险说明和状态哈希。
2. 审阅返回值后，使用计划编号调用 `apply_change`。该动作需要 MCP 协议级确认。
3. 执行前重新计算状态哈希；状态已漂移或计划已过期时拒绝执行。
4. 同一目标执行期间通过思源文件 API 将“含 owner 文件的非空候选目录”原子重命名为固定锁目录，并将计划标记为 `applying`，防止插件进程、独立 MCP 与 CLI 多实例重复消费或丢失更新。代码片段按整个集合加锁，插件启停与安装状态按插件整体加锁。锁不自动过期或接管；异常退出遗留锁必须人工审计后清理。
5. 执行后通过思源官方接口回读核验；核验失败时自动尝试恢复执行前状态。
6. 已成功执行的变更可使用 `rollback_change` 恢复；若目标在执行后又发生变化，则拒绝回滚，避免覆盖更新内容。

支持的变更类型：

- `plugin_state`：启用或禁用插件；
- `snippet_upsert`：新增或完整更新 CSS、JavaScript 片段；
- `snippet_remove`：移除代码片段；
- `plugin_storage_write`：写入安全插件文本配置；
- `plugin_install`：按明确 GitHub 仓库和十六进制修订安装或更新插件；
- `plugin_uninstall`：卸载已安装插件；
- `setting_patch`：深合并允许的系统设置分区。

插件更新和卸载在执行前把 `/data/plugins/<插件名>/` 精确归档到本插件控制面目录。归档前会校验安装根、树深度、条目总数、单文件与总字节上限及符号链接，并为目录内每个文件建立内容哈希清单；归档后校验 ZIP 的字节数和 SHA-256，再解压到隔离验证目录并重新计算内容清单。只有验证副本与计划快照一致才执行安装或卸载；恢复后也必须再次匹配执行前清单。

显式回滚先持久化 `rolling_back`。逆操作失败会记录 `rollback_failed` 和诊断信息；对于已通过完整性验证的插件备份，可从该状态重新进入恢复流程，不会因中途卸载而失去重试路径。

允许修改的设置分区仅包括：`editor`、`export`、`fileTree`、`search`、`keymap`、`appearance`、`flashcard` 和 `snippet`。每个分区还执行顶层字段白名单；`pandocBin`、`pandocParams`、脚本执行开关、外部可执行路径、关闭确认和只读保护等字段永久拒绝。数组整体替换，对象递归合并。

## 永久排除范围

以下信息和能力不通过控制面开放：

- 账户、登录、访问鉴权、同步、仓库和加密配置；
- AI 密钥、令牌、Cookie、密码、私钥、环境变量和原始秘密值；
- 任意工作区文件系统访问和跨插件目录访问；
- 会关闭安全确认、只读保护或访问控制的设置；
- 没有精确恢复路径的物理删除。

## 完整动作列表

- `workspace_info`
- `network`
- `conf`
- `notify`
- `changelog`
- `perform_sync`
- `get_version`
- `get_current_time`
- `audit_environment`
- `list_packages`
- `get_plugin`
- `list_plugin_updates`
- `list_snippets`
- `list_plugin_storage`
- `read_plugin_storage`
- `inspect_plugin`
- `plan_change`
- `apply_change`
- `rollback_change`
- `discard_change_plan`
- `list_control_changes`
- `get_control_change`

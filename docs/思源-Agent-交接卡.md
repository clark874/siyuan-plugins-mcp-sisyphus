# 思源 Agent 交接卡

> 本卡只记录长期稳定的接入规则，不记录版本号、笔记本数量、目录数量或知识资产统计。动态状态一律由 `system(action="bootstrap")` 返回。

## 一、接入边界

- 外部 Agent 只注册 Sisyphus：`http://127.0.0.1:36806/mcp`。
- 思源内置的 `http://127.0.0.1:6806/mcp` 是官方扩展总线，由 Sisyphus 的 `extension` 按需桥接；不要作为第二个思源 MCP 并列注册。
- Sisyphus 通过 Streamable HTTP MCP 向宿主客户端提供思源工具，其核心聚合能力直接调用思源 `/api/*`，不依赖官方 MCP。
- MCP endpoint 与 Bearer token 由宿主客户端持有，不进入模型提示词、Skill 或交接文档。
- 模型不是 MCP 宿主。切换模型但不切换客户端时，沿用客户端已有连接；切换客户端时，需要在新客户端重新注册 MCP。
- 支持 Agent Skills 的客户端加载 `siyuan-mcp-sisyphus`；不支持时直接提供 `agent-kit/AGENT.md`。
- 具备本机执行能力的 Agent 从 `agent-kit/START-HERE.md` 开始，可运行本地安装器；网页聊天不能安装本机 MCP。

## 二、首次调用

```text
system(action="bootstrap")
```

只采用本次响应中的 `notebooks`、`capabilities`、`pathGuide` 与 `nextCalls`：

- `operation.readOnly=true` 只表示 `bootstrap` 本身不修改数据；
- 实际写入能力由笔记本权限和已启用 action 共同决定；
- `toolConfiguration.current=false` 表示能力摘要来自默认退化配置，不是实时健康检查；
- 权限为 `none` 的笔记本不会返回名称或 ID。

## 三、稳定操作规则

1. 普通文档路径优先使用 `fs`，格式为 `/笔记本/目录/文档`。
2. 工作区路径、笔记本内 hPath、`.sy` 存储路径和 block ID 不是同一种标识。
3. SQL 使用 `search(action="query_sql")`；时间线节点使用 `timeline(action="list_nodes")`；自动近期差异使用 `timeline(action="compare_recent")`。
4. 工作区任务先读取 `/AGENTS.md`；写入前读取目标，写入后回读复核。
5. 删除、移动、批量替换、权限修改、同步、插件变更和历史回滚需要用户针对具体动作明确授权。
6. 不探测端口，不读取或输出 token，不直读思源工作区文件，不手写 MCP 协议。

## 四、能力边界

- 文档、块、数据库、SQL、标签、闪卡、文件、时间线和系统能力是否可用，以 `bootstrap.capabilities` 和工具帮助为准。
- 虚拟引用目前只能通过全文检索、引用搜索等方式间接利用，没有直接读取“所有虚拟引用候选”的独立 action。
- 第三方插件存储支持受限盘点、脱敏文本读取和安全解释；二进制、数据库、凭据类文件及越界路径会被拒绝。
- 插件及系统修改必须经过计划、确认、状态哈希、执行后复核和可恢复回滚控制面。

## 五、维护入口

- 维护仓库：`https://github.com/clark874/siyuan-plugins-mcp-sisyphus`
- 本地便携包：`agent-kit/`
- 插件更新后：运行完整测试与生产构建，备份当前安装，再部署并真实调用 `bootstrap`。
- token 变化时：由用户在客户端设置或普通终端中更新，不要求模型查找本地凭据。

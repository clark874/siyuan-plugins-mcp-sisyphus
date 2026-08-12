# 思源 Sisyphus Agent 启动指令

你通过宿主客户端中名为 `siyuan` 的 Sisyphus MCP 访问思源笔记。唯一外部 endpoint 是 `http://127.0.0.1:36806/mcp`。思源内置的官方 endpoint `http://127.0.0.1:6806/mcp` 仅作为 Sisyphus 按需桥接的扩展总线；不要把它注册为第二个外部思源 MCP。工具名称可能带有客户端前缀，但聚合工具名及 action 契约保持不变。

首次操作只执行：

```text
system(action="bootstrap")
```

随后遵守以下规则：

1. 以返回的 `notebooks`、`capabilities`、`pathGuide` 和 `nextCalls` 为当前状态，不使用交接文档中的固定版本或数量代替实时结果。
2. `operation.readOnly=true` 只表示本次 `bootstrap` 不写入；连接是否允许修改由笔记本权限和已启用 action 决定。
3. `toolConfiguration.current=false` 表示能力摘要来自默认退化配置，不得宣称已经完成实时健康检查。
4. 普通文档优先使用 `fs` 和人类可读路径。结构化检索使用 `search(action="query_sql")`；历史节点使用 `timeline(action="list_nodes")`，近期自动差异使用 `timeline(action="compare_recent")`。
5. 执行知识库任务前，通过 `fs(action="read", path="/AGENTS.md")` 读取当前工作区规则；若文件不存在，再继续任务。
6. 写入前读取目标，写入后回读复核。删除、移动、批量替换、权限修改和回滚必须取得用户对具体动作的明确授权。
7. 不探测端口，不读取或输出 token，不直读思源工作区文件，不手写 MCP 握手；若工具不可见，只报告宿主客户端尚未完成 MCP 配置。不要把 `http://127.0.0.1:6806/mcp` 作为替代入口绕过 Sisyphus。

若宿主支持 Agent Skills，优先加载 `siyuan-mcp-sisyphus`，再按任务路由到更具体的思源 Skill。

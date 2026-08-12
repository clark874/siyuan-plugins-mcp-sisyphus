# 单一 Sisyphus 网关交付设计

## 目标

用户只需向具备本机执行能力的 Agent 提供一个固定版本入口。Agent 下载可审计交付包、安装标准 Skill、在宿主客户端注册 Sisyphus MCP，并以 `system.bootstrap` 完成实时验收。交付过程不得把 token 放入网址、仓库、Skill、命令输出或模型上下文。

## 架构边界

外部客户端只注册 `http://127.0.0.1:36806/mcp`。思源内置的 `http://127.0.0.1:6806/mcp` 是官方 MCP 总线，不是需要另行安装的插件，也不是第二个外部入口；Sisyphus 仅在启用 `extension` 时按需桥接它。安装器发现客户端已经并列配置官方 endpoint 时只报告警告，不擅自删除用户配置。

## 交付组成

- `START-HERE.md`：给任意 Agent 的唯一入口和验收契约。
- `delivery.json`：机器可读的 endpoint、角色、安装器和安全不变量。
- `scripts/install-agent-kit.mjs`：无第三方运行时依赖的本地安装器，支持 Kimi Code 与 ZCode，保留原配置并创建备份。
- `skills/siyuan-mcp-sisyphus/SKILL.md`：连接后的稳定工作流。
- `AGENT.md`、`KIMI.md` 与无密钥配置模板：人工交接和退化安装路径。

## 凭据与失败处理

安装器优先读取进程环境中的 `SIYUAN_MCP_TOKEN`，其次复用受支持客户端已经保存的 Sisyphus Bearer token；不自动扫描思源工作区或插件存储。找不到 token 时失败关闭，并要求用户在本地终端提供。网页聊天、无本机文件权限的云端 Agent 或不支持自定义 MCP 的宿主只能读取说明，不能宣称安装成功。

## 验收

安装后的客户端只能新增 `36806/mcp`，配置文件权限为 `0600`，标准输出不含 token。新会话必须成功调用 `system(action="bootstrap")`，确认 schema v2、实时工具配置和当前可读笔记本，才算完成连接。

# siyuan-sisyphus

[English](./README.md) | [中文](./README_zh_CN.md)

> ⚠️ **前置要求：本 CLI 需要配合本仓库的 `siyuan-plugins-mcp-sisyphus` 插件使用。** 请先在 SiYuan 中安装并启用该插件，然后打开插件设置面板完成权限配置后再执行 CLI 工具命令。CLI 现在会主动检查这一前置条件；如果插件未安装或尚未初始化，会直接提示并退出。

这是一个用于直接通过命令行操作 [SiYuan Note](https://b3log.org/siyuan) 的 CLI。你可以把它理解成思源版的 `obsidian-cli`：每个 MCP 工具（`block`、`document`、`notebook`、`av`、`search`、`tag`、`file`、`system`、`flashcard`、`mascot`）都会暴露成可在 shell 中直接调用的子命令。

发布到 npm 的包名是 `siyuan-sisyphus`。安装后主命令为 `siyuan-sisyphus`，同时也提供更短的别名 `siyuan`。

```bash
siyuan-sisyphus notebook list
siyuan-sisyphus document create --notebook 20240318... --path "/Inbox/Test" --markdown "# Hello"
siyuan-sisyphus block append --parent-id 20240318abc --data-type markdown --data "- item"
siyuan-sisyphus search fulltext --query "keyword" --page-size 10 --json | jq '.data[].hPath'
```

## 要求

- Node.js 18+
- 一个可通过 HTTP 访问的 SiYuan 实例（本地或远程均可）
- SiYuan API Token（`SiYuan > 设置 > 关于 > API token`）

## 安装

```bash
# 全局安装；会同时安装 `siyuan-sisyphus` 和 `siyuan`
npm i -g siyuan-sisyphus

# 或者不安装，直接执行一次
npx -p siyuan-sisyphus siyuan-sisyphus --help
```

## 快速开始

```bash
siyuan-sisyphus init
# 按提示输入两个值（API URL + token）。这会写入 ~/.siyuan-sisyphus/config.json（权限 0600）。

siyuan-sisyphus notebook list  # 验证连通性
siyuan-sisyphus list           # 查看所有可用工具
siyuan-sisyphus list block     # 查看某个工具下的所有 action
siyuan-sisyphus help block append
```

## 命令格式

```
siyuan-sisyphus <tool> <action> [--flag value ...]   执行任意 MCP 工具 action
siyuan-sisyphus list [tool]                          列出所有工具，或某个工具的 action
siyuan-sisyphus help <tool> [action]                 查看某个工具或 action 的详细帮助
siyuan-sisyphus init                                 交互式初始化配置
siyuan-sisyphus --help | -h                          显示顶层帮助
siyuan-sisyphus --version | -v                       显示版本号
```

### Flag 约定

- **Kebab / camel / snake 都支持**：`--parent-id`、`--parentID`、`--parentId`、`--item_id` 都会映射到对应 schema 字段。
- **Action 名称**：`set_open_state` 和 `set-open-state` 两种写法都可用。
- **布尔值**：可写成 `--opened`（true）、`--opened=false` 或 `--no-opened`（false）。
- **数组**：可以重复传参（`--ids a --ids b`）、用逗号分隔（`--ids a,b`），或通过精确 JSON 传入（`--<key>-json '["a","b"]'`）。
- **复杂对象**：使用 JSON 形式的附加 flag，例如 `--assets-json '[{...}]'`。
- **`-json` 优先级**：如果普通 flag 和 `--<key>-json` 同时存在，以 JSON 附加 flag 为准。

### 全局参数

| 参数 | 作用 |
|---|---|
| `--config <file>` | 从 `<file>` 加载配置，而不是 `~/.siyuan-sisyphus/config.json` |
| `--url <url>` | 覆盖 SiYuan API URL |
| `--token <token>` | 覆盖 SiYuan API token |
| `--json` | 输出紧凑的单行 JSON，便于和 `jq` 等脚本工具配合 |
| `--debug` | 输出堆栈信息和被忽略 flag 的警告 |

## 示例

```bash
# 笔记本
siyuan-sisyphus notebook list
siyuan-sisyphus notebook create --name "Work" --icon 1f4d4

# 文档
siyuan-sisyphus document create --notebook 20240318... --path "/Inbox/Daily" --markdown "# Today"
siyuan-sisyphus document list-tree --notebook 20240318... --max-depth 2
siyuan-sisyphus document get-doc --id 20240318xyz --mode markdown

# 块
siyuan-sisyphus block info --id 20240318xyz
siyuan-sisyphus block append --parent-id 20240318abc --data-type markdown --data "- new item"
siyuan-sisyphus block get-kramdown --id 20240318xyz

# 搜索
siyuan-sisyphus search fulltext --query "TODO" --page-size 20
siyuan-sisyphus search query-sql --stmt "SELECT id, content FROM blocks WHERE type='h' LIMIT 5"

# 配合 jq 管道处理
siyuan-sisyphus notebook list --json | jq '.[] | select(.closed==false) | .name'
siyuan-sisyphus document search-docs --notebook <id> --query "proposal" --json | jq '.data[].hPath'
```

## 配置

优先级：**CLI flag > 环境变量 > 配置文件 > 默认值**。

### 环境变量

| 变量 | 作用 |
|---|---|
| `SIYUAN_API_URL` | SiYuan 基础 URL（默认 `http://127.0.0.1:6806`） |
| `SIYUAN_TOKEN` | SiYuan API token |

### 配置文件格式（`~/.siyuan-sisyphus/config.json`）

```json
{
  "apiUrl": "http://127.0.0.1:6806",
  "token": "<siyuan-token>"
}
```

## 与 SiYuan 插件的关系

CLI 和 SiYuan 插件（`siyuan-plugins-mcp-sisyphus`）底层共用同一套 tool-handler 代码，但两者是独立入口：

- **插件** 在 SiYuan 内部启动一个 MCP server，通过 stdio / HTTP 与 AI 客户端通信（在插件设置面板中配置）。
- **CLI** 直接通过 HTTP API 连接 SiYuan，每次调用执行一个操作后退出；它不是 server，也不是常驻进程。

如果你之前使用的是旧配置路径 `~/.siyuan-mcp/config.json`，CLI 仍会把它作为兜底配置读取，直到你在 `~/.siyuan-sisyphus/config.json` 下创建新配置。

如果插件里配置了笔记本级权限，CLI 也会遵守这些权限（它会通过 API 读取同一份 `/data/storage/petal/...` 配置）。不过，插件 UI 里被禁用的 action 仍然可以从 CLI 直接调用——CLI 默认假设输入命令的人知道自己在做什么。

## 许可证

MIT © Taihong Yang

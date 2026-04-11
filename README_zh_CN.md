# SiYuan MCP Sisyphus

[English](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/README.md) | [中文](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/README_zh_CN.md)

> **最新版本：**`v0.2.3` — 修复插件配置文件，补上漏掉的 Docker 后端与 browser-desktop、desktop-window 前端。 — 优化数据仓库快照管理侧边栏 UI，支持可视化创建快照（冗余功能同siyuan重复下版本删除）、对比差异与一键回滚，提升数据管理操作便捷性。完整历史请见 [CHANGELOG.md](./CHANGELOG.md)。

> 如果你想把 OpenCode、kimi Code 等有 Web 端的工具直接嵌进思源侧边栏使用，推荐搭配：[AI CLI Bridge for SiYuan](https://github.com/yangtaihong59/siyuan-plugins-ai-cli-bridge)。

这是一个把**思源笔记接到 AI Agent** 上的 MCP 服务器插件。装好之后，支持 MCP 的 Agent 就可以把思源当成一组可调用工具：读笔记、搜索文档、修改块内容、操作数据库、导出资源。

如果你以前没接触过 MCP，可以先这样理解：

- **SiYuan**：你的笔记和数据
- **这个插件**：把思源能力包装成一个 MCP Server
- **Agent / MCP 客户端**：例如 Claude Desktop、Codex、Cherry Studio、OpenCode 一类支持 MCP 的工具
- **MCP**：Agent 和外部工具之间的一套通用连接协议

也就是说，这个插件做的事情很简单：**让 Agent 能安全地“看见并调用”思源笔记。**

## 功能特性

- 把思源常用能力收敛成 10 个聚合 tool，降低 Agent 选错工具的概率
- 覆盖笔记本、文档、块、数据库、资源、搜索、标签、闪卡、系统共 90 个 action
- 提供 `none / r / rw / rwd` 四态权限模型，方便按笔记本控制访问范围
- 渐进式披露思想，减少token占用

当前对外收敛为 10 个聚合工具：

- `notebook`
- `document`
- `block`
- `av`
- `file`
- `search`
- `tag`
- `system`
- `flashcard`
- `mascot`

每个 tool 通过必填的 `action` 字段分派具体操作。

## 快速开始

### 1. 安装插件

#### 从思源集市安装

1. 打开思源笔记
2. 进入 `设置 -> 集市`
3. 搜索 `SiYuan MCP`
4. 安装并启用插件

#### 从源码安装

```bash
git clone https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus.git
cd siyuan-plugins-mcp-sisyphus
pnpm install
pnpm run build
pnpm run make-link
```

### 2. 连接方式

插件支持两种连接方式，**推荐使用 HTTP 模式**——配置更简单，支持多个客户端同时连接，也能从 WSL / Docker / 远程机器直接访问。

---

#### 方式一：HTTP 模式（推荐）

HTTP 模式下，插件在思源内部托管一个 HTTP MCP Server，**思源 API token 自动透传**，你只需把客户端的配置 URL 和 Bearer token 填好即可，无需手动配置路径或环境变量。

**第一步：启动 HTTP Server**

1. 打开「插件 → siyuan-plugins-mcp-sisyphus → 设置 → 🌐 HTTP Server」
2. 默认 `Host: 127.0.0.1`、`Port: 36806`
   - 如果 agent 在 WSL / Docker / 远程机器上，把 Host 改成 `0.0.0.0`
3. 保持「Require Bearer token」开启，token 已自动生成
4. 点「Start」，状态变为「Running」
5. 勾选「随思源自动启动」，下次不用手动点

**第二步：复制客户端配置**

设置面板底部「客户端配置示例」里有两段可直接复制的 JSON：

- **直连 HTTP**（Cline、Cherry Studio、Cursor、Windsurf、**Claude Code** 等原生支持 HTTP 的客户端）：

  ```json
  {
    “mcpServers”: {
      “siyuan”: {
        “type”: “http”,
        “url”: “http://127.0.0.1:36806/mcp”,
        “headers”: { “Authorization”: “Bearer <复制设置面板里的 token>” }
      }
    }
  }
  ```

  > **Claude Code 注意**：必须加 `”type”: “http”`，否则 schema 校验会失败。配置写入 `~/.claude.json` 的 `mcpServers` 字段。

- **mcp-remote 桥接**（Claude Desktop 等只支持 stdio 的客户端）：

  ```json
  {
    “mcpServers”: {
      “siyuan”: {
        “command”: “npx”,
        “args”: [“mcp-remote”, “http://127.0.0.1:36806/mcp”, “--header”, “Authorization: Bearer <token>”]
      }
    }
  }
  ```

> **WSL / 跨机器场景：** 把 Host 改为 `0.0.0.0`，在客户端配置里把 `127.0.0.1` 替换为 Windows 宿主机 IP（通常是 `192.168.x.x`）。绑定到非回环地址时**务必**保持 token 鉴权开启，否则同局域网任何设备都能访问你的工作区。

---

#### 方式二：stdio 模式（本机直连，传统方式）

如果你的客户端和思源运行在同一台机器上，也可以用 stdio 方式直接启动 `mcp-server.cjs`：

```json
{
  “mcpServers”: {
    “siyuan”: {
      “command”: “node”,
      “args”: [“{SIYUAN_PATH}/data/plugins/siyuan-plugins-mcp-sisyphus/mcp-server.cjs”],
      “env”: {
        “SIYUAN_API_URL”: “http://127.0.0.1:6806”,
        “SIYUAN_TOKEN”: “xxxxxx”
      }
    }
  }
}
```

- `{SIYUAN_PATH}` 替换为实际路径
- 如果思源未开启 API 鉴权，`SIYUAN_TOKEN` 可省略
- stdio 每次只能对应一个客户端连接

---

### 3. 第一次连接后先做什么

连接后建议先试几个**只读、低风险**动作确认链路通了：

- “帮我查看当前思源版本”
- “列出我的笔记本”
- “搜索标题里包含 `project` 的文档”

对应工具调用：`system(action=”get_version”)`、`notebook(action=”list”)`、`document(action=”search_docs”, ...)`

### 4. 给 Agent 的自然语言示例

- “帮我修改这篇文档的图标”
- “列出我所有笔记本”
- “帮我搜索标题里带 `Weekly` 的文档”
- “在这篇文档末尾追加一条待办：明天发周报”
- “查一下这个块有哪些反向链接”

---

### 5. 数据仓库快照管理（v0.2.1 新增）

插件现在提供**可视化快照管理器**，让你可快速创建、对比和回滚数据快照。

**打开快照面板**

1. 打开插件后思源右下角会增加一个【数据仓库】按钮，点击打开侧边栏
2. 侧边栏显示所有快照，包含创建时间、备注、大小和标签

**常用操作**

| 操作 | 操作方式 |
|------|----------|
| 创建快照 | 点击 `创建` → 输入备注 → 确认 |
| 对比快照 | 选中两个快照 → 点击 `对比` → 查看增删改文件列表 |
| 回滚（检出） | 点击快照上的 `回滚` → 确认 → 笔记本恢复到该状态 |
| 标签/置顶 | 点击标签区域 → 输入名称（ `📌`tag是用于避免快照被purge误伤 ） |
| 删除标签 | 点击标签上的垃圾桶 |

**快捷键**

- `Alt + Shift + S`：打开数据仓库快照面板

> **注意：** `回滚` 会用快照状态替换当前笔记本内容，属于高危操作，请谨慎使用。

## 常见问题

### Agent 看不到工具

- HTTP 模式：确认设置面板状态为「Running」，token 和 URL 是否粘贴正确
- stdio 模式：确认路径指向 `mcp-server.cjs`，修改配置后重启客户端

### 能连上，但调用失败

- HTTP 模式：思源 API token 由插件自动透传，无需手动配置；检查思源是否正常运行
- stdio 模式：检查 `SIYUAN_API_URL` 和 `SIYUAN_TOKEN` 是否正确
- 检查目标笔记本权限是否被设为了 `r` 或 `none`

### 为什么某些操作前会让我确认

这是插件的安全设计，不是报错。删除、移动、上传本地文件、修改权限等高风险动作，默认都需要先征得用户同意。

# 插件细节

## Tool 速览

- `notebook`：笔记本相关操作
- `document`：文档创建、移动、查询、树结构
- `block`：块级读写、属性、折叠、移动
- `av`：属性视图 / 数据库操作
- `file`：资源上传、导出、模板渲染
- `search`：全文搜索、SQL、反链、标签搜索
- `tag`：标签管理
- `system`：版本、时间、通知、配置摘要
- `flashcard`：闪卡列出、复习、加卡、移卡
- `mascot`：猫猫余额、商店、购买

## 权限模型

- `rwd`：允许读、写、删除
- `rw`：允许读写，不允许删除
- `r`：只允许读，所有写和删除操作都应被拒绝
- `none`：禁止所有读、写、删除
- `notebook(action="set_permission")` 设置后，会立即影响后续的 `notebook`、`document`、`block` 调用
- AI 做回归时，建议一开始先把 10 个 tool 都预热调用一次，避免中途首次弹授权卡住流程

## 高危 Action

服务端 instructions 要求在调用以下 action 前先向用户明确说明并等待确认：

- `notebook(action="remove")`
- `notebook(action="set_permission")`
- `document(action="remove")`
- `document(action="move")`
- `block(action="delete")`
- `block(action="move")`
- `file(action="upload_asset")`
- `tag(action="remove")`
- `flashcard(action="remove_card")`

如果你的 MCP 客户端会展示 instructions，模型应先征得确认再执行。这属于 instruction 层的安全约束，不代表服务端一定会弹出确认对话框。

默认 fallback 配置里，`document(action="move")` 和 `block(action="move")` 依然会出现在工具列表里。它们被启用并不代表可以跳过确认。

另外注意：

- 当 `file(action="upload_asset")` 的目标文件大于配置阈值（默认 `10 MB`）时，AI 必须终止当前操作并先询问用户；只有获得明确同意后，才能携带 `confirmLargeFile=true` 重试。
- `document(action="move", fromPaths + toNotebook + toPath)` 的 `toPath` 必须是一个已存在目标文档的存储路径。
- `block(action="move")` 在 MCP 层会返回结构化成功结果，即使底层思源 API 可能返回 `null`。

## MCP 客户端配置

OpenClaw / mcporter 用户可参考 [SKILL.md](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/skills/siyuan-mcp-sisyphus/SKILL.md)。

详细 API ↔ MCP 映射文档见：[API_MCP_MAPPING.md](./API_MCP_MAPPING.md)

## 设计思想：渐进式披露

MCP 工具层以**渐进式披露**为核心设计原则——只在需要时暴露复杂性，避免在初次交互时就把所有信息堆给 AI。

### 三个层次

**① Tool Description 层（LLM 最先看到的）**

每个工具的描述只详述高频的 **common actions** 及其必填字段，低频或高风险的 **advanced actions** 仅列出名称，并附指向按需文档的链接：

```
Common actions: list, create, rename, get_doc ...  （展示必填字段）
Additional actions: remove, move, list_tree ...    → 读取 siyuan://help/action/{tool}/{action}
```

这样 LLM 在调用 `listTools()` 时得到的是精炼信息，而不是所有 action 的大杂烩。

**② Help 层（按需获取）**

- 每个 action 的详细说明、参数语义、注意事项存放在 `siyuan://help/action/{tool}/{action}` resource 中，只有需要时才读取
- 调用任意工具时传入 `action: "help"` 可以内联获取该工具的完整分层帮助（为不支持 resource 的客户端提供兜底）

**③ Response 层（大数据自动收敛）**

大结果集不再一次性全量返回，而是附上摘要与 drill-down 指引：

| 场景 | 行为 |
|------|------|
| `search.fulltext` 结果 > 20 条 | 截断并提示 `page`/`pageSize` 分页参数 |
| `search.query_sql` 结果 > 50 行 | 截断并提示添加 `LIMIT`/`OFFSET` |
| `block.get_children` 子块 > 50 | 截断并提示用 `query_sql` 过滤 |
| `document.list_tree` 深层节点 | 默认折叠到 depth=3，通过 `maxDepth` 参数按需展开 |
| `document.get_doc` 内容 > 8000 字符 | 截断并提示用 `get_child_blocks` 逐块读取 |

**设计目标：** 降低首次调用的认知负荷；保留完整能力（所有 advanced actions 仍然可用）；对现有配置和工具名保持向后兼容。

## Tool 模型

### `notebook`

| Action | 说明 |
|--------|------|
| `list` | 列出所有笔记本 |
| `create` | 创建笔记本（支持传入 `icon`，推荐使用 `1f4d4` 这类 Unicode 十六进制字符串） |
| `open` / `close` | 打开或关闭笔记本 |
| `rename` | 重命名笔记本 |
| `get_conf` / `set_conf` | 获取或设置笔记本配置 |
| `set_icon` | 设置笔记本图标；推荐使用 `1f4d4` 这类 Unicode 十六进制字符串，而不是直接传 emoji 字符 |
| `get_permissions` | 查看所有笔记本的 MCP 权限 |
| `set_permission` | 修改笔记本权限（`none` / `r` / `rw` / `rwd`） |
| `get_child_docs` | 获取笔记本根目录下的直属子文档，并带有限短重试的笔记本状态处理 |

### `document`

| Action | 说明 |
|--------|------|
| `create` | 创建文档，支持 Markdown 内容（支持传入 `icon`，推荐使用 `1f4d4` 这类 Unicode 十六进制字符串） |
| `rename` | 重命名文档（按 ID 或存储路径） |
| `remove` | 删除文档（按 ID 或存储路径） |
| `move` | 移动文档（按 ID 或存储路径） |
| `set_icon` | 设置文档/文件夹图标；推荐使用 `1f4d4` 这类 Unicode 十六进制字符串，而不是直接传 emoji 字符 |
| `set_cover` | 设置文档头图，优先使用 `http(s)` URL，其次才是 `/assets/...` 路径 |
| `clear_cover` | 清空文档头图 |
| `get_path` | 按文档 ID 获取存储路径 |
| `get_hpath` | 按 ID 或存储路径获取人类可读路径 |
| `get_ids` | 按人类可读路径获取文档 ID |
| `get_child_blocks` | 获取文档的直属子块 |
| `get_child_docs` | 获取文档的直属子文档 |
| `list_tree` | 列出指定笔记本路径下的文档树 |
| `search_docs` | 按标题关键词搜索文档，并可再按存储路径缩小范围 |
| `get_doc` | 按 ID 获取文档内容与元数据（`markdown` 返回干净 Markdown，`html` 返回焦点视图 HTML 载荷） |
| `create_daily_note` | 为笔记本创建或返回今日日记 |

路径语义：`create` 与 `get_ids` 使用人类可读路径（如 `/Inbox/Weekly Note`）。`rename`、`remove`、`move`、`get_hpath`、`list_tree` 与 `search_docs.path` 使用 `get_path` 返回的存储路径。需要把人类可读路径解析成文档 ID 时，优先使用 `get_ids`。刚创建文档后，`get_ids` 可能因 SiYuan 索引延迟而短暂滞后。

头图语义：`set_cover` 与 `clear_cover` 是对文档根块 `title-img` 属性的语义封装。调用时优先直接传图片 URL；只有在用户明确希望把图片归档到思源资源库时，才先上传到 `/assets/...` 再设置头图。若要查看底层原值，可使用 `block(action="get_attrs", id=docId)`。

### `block`

| Action | 说明 |
|--------|------|
| `insert` / `prepend` / `append` | 插入块到指定位置/开头/末尾，并返回精简成功结果 |
| `update` | 更新块内容，并返回精简成功结果 |
| `delete` | 删除块 |
| `move` | 移动块到新位置 |
| `fold` / `unfold` | 折叠/展开可折叠块 |
| `get_kramdown` | 获取块的 kramdown 格式内容 |
| `get_children` | 获取直属子块 |
| `transfer_ref` | 转移块引用 |
| `set_attrs` / `get_attrs` | 设置或获取块属性，包括 `custom-riff-decks` 这类闪卡自定义属性 |
| `exists` | 检查块是否存在 |
| `info` | 获取块所在根文档元数据 |
| `breadcrumb` | 获取块的面包屑路径 |
| `dom` | 获取块的渲染 DOM |
| `recent_updated` | 列出最近更新内容，默认突出文档级摘要，并按笔记本权限过滤且支持 `count` 截断 |
| `word_count` | 获取块的字数统计 |

### `av`

| Action | 说明 |
|--------|------|
| `get` | 按 `id` 读取一个真实属性视图（数据库），并经过权限校验 |
| `search` | 按关键词搜索属性视图，并对不可读或无法解析归属的结果做后置过滤 |
| `add_rows` | 将已有块绑定为数据库行，并在解析成功时返回可写 `rowID` 映射 |
| `remove_rows` | 从属性视图中移除已绑定的行 |
| `add_column` | 新增数据库列，支持 `text`、`number`、`mSelect`、`mAsset`、`lineNumber` 等类型 |
| `remove_column` | 删除属性视图中的一列 |
| `set_cell` | 用强类型参数更新单个单元格；写入时应使用 `value.blockID` 中保存的 AV 行 item ID |
| `batch_set_cells` | 批量更新多个单元格；若传入源块 ID 或 value ID 而不是可写行 ID，会直接拒绝 |
| `duplicate_block` | 复制底层数据库块，并把复制出的数据库块插入到文档树中的合适位置 |
| `get_primary_key_values` | 获取属性视图主键列对应的行数据，支持关键词过滤与分页 |

AV 说明：这个工具操作的是真实的思源属性视图（数据库块），不是 Markdown 表格。MCP 可以把已有块绑定为数据库行，但不能凭空新建一个全新的真实数据库。写入时要明确区分三类 ID：`block.id` 是绑定的源块 ID，`blockID` 是可写的 AV 行 item ID，`id` 只是单元格 value ID。

### `file`

| Action | 说明 |
|--------|------|
| `upload_asset` | 读取本地文件路径并上传资源文件（因会读取本地文件系统，需先确认；超过配置阈值，默认 `10 MB`，时必须先中止并征求用户同意，再携带 `confirmLargeFile=true` 重试） |
| `render_template` | 使用文档上下文渲染模板 |
| `render_sprig` | 渲染 Sprig 模板 |
| `export_md` | 导出文档为 Markdown |
| `export_resources` | 导出资源为 ZIP 压缩包，兼容 `assets/...` 自动规范化到 `data/assets/...`，并可额外写到本地 `outputPath`（写本地时需用户确认） |

### `system`

| Action | 说明 |
|--------|------|
| `push_msg` / `push_err_msg` | 推送普通/错误通知消息 |
| `get_version` / `get_current_time` | 获取思源版本号或当前时间（`get_current_time` 还会返回 ISO 时间文本） |
| `workspace_info` | 获取思源工作区元数据。高风险：会暴露工作区绝对路径，默认关闭 |
| `network` | 获取脱敏后的网络代理信息 |
| `changelog` | 获取当前版本更新日志 |
| `conf` | 以“先摘要、后深入”的方式获取脱敏后的系统配置 |
| `sys_fonts` | 以“先摘要、后分页”的方式列出系统字体 |
| `boot_progress` | 获取当前启动进度详情 |

### `flashcard`

| Action | 说明 |
|--------|------|
| `list_cards` | 按全部 / 卡包 / 笔记本 / 文档树范围列出待复习闪卡，并可把返回卡片过滤为 `due` / `new` / `old` |
| `get_decks` | 列出可用闪卡卡包，便于发现 `deckID` |
| `review_card` | 使用 `deckID`、`cardID`、`rating` 提交一次复习结果 |
| `skip_review_card` | 在复习流中跳过当前闪卡 |
| `add_card` | 将已有块加入某个闪卡卡包 |
| `remove_card` | 将已有块从某个闪卡卡包中移除（需先确认） |

闪卡说明：`list_cards` 底层统一读取内核的到期卡片接口，再由 MCP 按 `cards[*].state` 过滤 `new` / `old`。闪卡打标仍建议使用 `block(action="set_attrs", attrs={"custom-riff-decks":"<deck-id>"})`。

### `mascot`

| Action | 说明 |
|--------|------|
| `get_balance` | 获取猫猫当前可用余额 |
| `shop` | 列出猫猫商店中的商品，包含稳定 `item_id`、名称、价格、类型和 emoji |
| `buy` | 根据 `item_id` 购买一件猫猫商店商品，并从当前余额中扣费 |

每次成功调用任意 MCP tool，猫猫都会赚到 1 米，所以想快速攒余额，最简单的方法就是多用 SiYuan MCP。`mascot(action="get_balance")` 还会返回累计赚米次数。

### `search`

| Action | 说明 |
|--------|------|
| `fulltext` | 全文搜索，可选 `stripHtml=true` 以额外返回纯文本字段 |
| `query_sql` | 执行只读 SQL（仅允许 SELECT / WITH），返回经过权限过滤的 `rows` 及元数据 |
| `search_tag` | 按关键词搜索标签 |
| `get_backlinks` | 查找引用了指定块的文档/块，若被裁剪会返回部分结果元数据 |
| `get_backmentions` | 查找提及了指定块名称的文档/块，若被裁剪会返回部分结果元数据 |

### `tag`

| Action | 说明 |
|--------|------|
| `list` | 列出工作区标签 |
| `rename` | 重命名标签 |
| `remove` | 删除标签 |


## 工具开关

在思源中打开 `设置 -> 插件 -> SiYuan MCP sisyphus`。

- 每个聚合 tool 有一个总开关
- 每个 action 仍可单独启用或关闭
- 默认 fallback 配置会暴露移动类 action，但不会暴露删除类 action
- 旧版按 tool 名保存的配置会自动迁移到新格式

## 开发

连接本机 SiYuan 做 live smoke：

```bash
pnpm run build
node scripts/live_mcp_smoke.cjs
```

```text
siyuan-plugins-mcp-sisyphus/
├── src/
│   ├── api/           # 思源 API 封装
│   ├── mcp/           # MCP 服务器实现
│   │   ├── tools/     # 聚合 tool 处理器
│   │   ├── config.ts  # 配置与迁移辅助
│   │   ├── server.ts  # 主服务器
│   │   └── types.ts   # action 级校验
│   └── index.ts       # 插件入口
├── public/i18n/       # 国际化
└── package.json
```

## 许可证

MIT

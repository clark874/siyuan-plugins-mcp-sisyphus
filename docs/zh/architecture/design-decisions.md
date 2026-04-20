# Design Decisions

这个页面记录项目的主要架构决策及其背后的权衡。每个决策都包含**问题背景**、**做出的选择**、**拒绝的替代方案**和**当前结果**。

适用场景：你在判断一个改动是否符合当前设计方向，或需要理解为什么某个部分被设计成现在的样子。

---

## 1. 聚合工具设计

### 问题背景

SiYuan 提供了约 459 个 HTTP API 端点。如果为每个端点暴露一个独立的 MCP tool，MCP 工具表面将达到 100+ 个，带来以下问题：
- **上下文成本爆炸**：每次 MCP `list_tools` 返回 100+ 个 tool descriptor，消耗大量 system prompt token
- **可发现性极差**：LLM 难以从 100+ 个工具中选出正确的那个
- **命名冲突**：大量类似名称（`listNotebooks` / `listDocs` / `listBlocks`）容易混淆

### 做出的选择

将相关 API 按领域聚合为 **10 个 MCP tool**：

| MCP Tool | 覆盖的 SiYuan 领域 | Action 数量 |
|----------|-------------------|------------|
| `notebook` | 笔记本 CRUD | ~10 |
| `document` | 文档树操作 | ~17 |
| `block` | 块级操作 | ~21 |
| `av` | 属性视图（数据库）| ~13 |
| `file` | 文件与资产 | ~11 |
| `search` | 搜索与查询 | ~11 |
| `tag` | 标签管理 | ~3 |
| `system` | 系统与 UI | ~10 |
| `flashcard` | 闪卡复习 | ~8 |
| `mascot` | 吉祥物交互 | ~3 |

每个 tool 通过 `action` 参数区分具体操作，例如：
```
notebook(action="list")
notebook(action="create")
notebook(action="rename")
```

### 拒绝的替代方案

- **方案 A：一 API 一 Tool**：每个 SiYuan API 对应一个 MCP tool。拒绝原因：上下文成本过高，LLM 选择困难。
- **方案 B：完全隐藏 action 层级**：只暴露 10 个 tool，但 action 作为内部实现细节。拒绝原因：LLM 需要知道有哪些操作可用，且不同 action 的参数差异很大，无法隐藏在统一的 schema 下。
- **方案 C：按使用频率动态展示**：根据上下文只展示相关 tool。拒绝原因：MCP 协议目前没有动态 list_tools 的机制，需要 server 侧维护复杂的状态机。

### 当前结果

- MCP 工具表面从 100+ 减少到 **10 个**
- `list_tools` 响应大小从约 50KB 减少到约 **8KB**
- LLM 对工具的可发现性显著提升
- 每个 action 的参数通过 Zod schema 严格校验，错误率降低

---

## 2. 渐进式披露

### 问题背景

不同用户对帮助信息的需求不同：
- **AI Agent（LLM）**：需要简洁的 tool description，说明常见 action 和参数
- **人类开发者**：需要详细的 API 映射、参数形态、示例代码
- **终端用户（CLI）**：需要快速上手的命令示例

### 做出的选择

设计三层信息暴露策略：

```
Layer 1: Tool Description（MCP tool.description）
    → 只包含最常见 action 的简要说明
    → 面向 LLM，控制 token 成本

Layer 2: Action Help（MCP Resource 动态请求）
    → siyuan://help/action/{tool}/{action}
    → 包含 accepted shapes、required fields、example
    → LLM 按需读取

Layer 3: 完整参考文档（docs/ 站点）
    → 每个 tool 独立页面
    → 包含所有 action 的详细说明、参数表、返回值、CLI 示例
    → 面向人类开发者
```

### 拒绝的替代方案

- **方案 A：把所有 help 塞进 tool description**：会导致 description 过长，消耗大量 LLM context。
- **方案 B：只有静态文档，没有 MCP Resource**：LLM 无法动态获取特定 action 的详细帮助。

### 当前结果

- `tool.description` 保持在 200~500 tokens
- LLM 遇到不确定的 action 时，可通过 `ReadResourceRequest` 获取详细帮助
- 人类用户可在 VitePress 文档站点查阅完整参考

---

## 3. 权限模型

### 问题背景

当外部 AI Agent 接入 SiYuan 时，需要建立可控的数据访问边界：
- 某些 notebook 可能包含敏感信息
- AI 不应能随意删除或修改重要数据
- 权限控制需要粒度适中（太细难以管理，太粗无保护作用）

### 做出的选择

采用 **笔记本级四级权限**（Notebook-Scoped Permission）：

| 级别 | 权限 | 适用场景 |
|------|------|----------|
| `none` | 完全禁止 | 敏感 notebook |
| `r` | 只读 | 参考性 notebook |
| `rw` | 读写（不含删除）| 日常工作 notebook |
| `rwd` | 完全权限（默认）| 信任区域 |

**实现细节**：
- 权限文件存储在 `/data/storage/petal/siyuan-plugins-mcp-sisyphus/notebookPermissions`
- 通过 SiYuan API 读写，不直接访问本地文件系统
- 未配置的 notebook 默认 `rwd`（向后兼容，避免破坏现有体验）
- 权限检查由业务 handler **显式调用**，非统一中间件（不同 action 需求不同）

### 拒绝的替代方案

- **方案 A：文档级权限**：粒度太细，管理成本高，且 SiYuan 原生不支持文档级权限。
- **方案 B：动作级权限（每个 action 单独开关）**：已经有了（ToolConfig 的 `actions`），但这只是功能开关，不是安全边界。安全边界需要在数据维度（notebook）上控制。
- **方案 C：全局只读模式**：过于粗暴，无法满足部分 notebook 可写、部分不可写的需求。

### 当前结果

- 设置面板提供 Notebook 权限矩阵 UI
- 权限校验在 API 调用前发生，阻止未授权操作
- CLI 模式复用同一套 `PermissionManager`；未配置的 notebook 默认 `rwd`

---

## 4. 插件与 CLI 共用核心

### 问题背景

项目需要同时支持两种使用方式：
1. **插件模式**：AI 客户端通过 MCP 协议与 SiYuan 插件通信
2. **CLI 模式**：用户在终端直接执行命令

如果各自独立实现，会导致代码重复、行为不一致、维护成本翻倍。

### 做出的选择

**CLI 直接 import 插件源码**，共用以下核心模块：

```
共用的层：
├── src/api/client.ts           SiYuanClient
├── src/mcp/tool-registry.ts    TOOL_REGISTRY
├── src/mcp/tool-lifecycle.ts   runToolCall (puppy/analytics/telemetry)
├── src/mcp/config.ts           buildDefaultToolConfig, ACTIONS_BY_CATEGORY
├── src/mcp/permissions.ts      PermissionManager
├── src/mcp/tools/*.ts          所有 tool 实现
└── src/presentation/invocation-format.ts  双模式呈现统一

CLI 不经过的层：
├── @modelcontextprotocol/sdk   不启动 MCP server
├── src/mcp/server.ts           不走 ListTools/CallTool handler
├── src/mcp/http-transport.ts   不启动 HTTP server
├── src/mcp/resources.ts        不暴露 MCP Resources
├── src/mcp/server-instructions.ts  无 instructions
└── src/index.ts                不走插件生命周期
```

### 拒绝的替代方案

- **方案 A：CLI 启动子 MCP server**：早期版本尝试过。拒绝原因：进程管理复杂、启动慢、资源浪费、调试困难。
- **方案 B：CLI 完全独立实现**：拒绝原因：代码重复严重，工具逻辑变更需要同步修改两处。

### 当前结果

- CLI 产物 `cli.cjs` 是自包含 bundle，不依赖 `node_modules`
- 工具 bug 修复只需改一处（`src/mcp/tools/`），同时修复插件和 CLI
- CLI 行为与插件保持一致；差异仅在外层协议和终端渲染方式

---

## 5. 传输层选择

### 问题背景

MCP 协议支持多种传输方式，需要根据使用场景选择最合适的。

### 做出的选择

支持 **stdio**（默认）和 **HTTP/S** 两种传输：

| 传输方式 | 实现 | 适用场景 |
|----------|------|----------|
| stdio | `StdioServerTransport` | 本地 AI 客户端（Claude Desktop、Kimi CLI） |
| HTTP | `StreamableHTTP` (MCP 2025-03-26 spec) | 远程访问、浏览器、多客户端共享 |

**HTTP 模式的增强设计**：
- **Session 管理**：支持多客户端并发，每个 session 独立 state
- **Bearer Token 认证**：防止未授权访问
- **TLS 支持**：生产环境加密传输
- **Parent Watchdog**：SiYuan 主进程退出时自动清理

### 拒绝的替代方案

- **方案 A：只支持 stdio**：无法满足远程访问和浏览器场景。
- **方案 B：使用旧的 HTTP/SSE 传输**：MCP SDK 1.26 已主推 StreamableHTTP，SSE 模式逐步淘汰。
- **方案 C：WebSocket 传输**：MCP 协议目前未标准化 WebSocket 传输，实现兼容性差。

### 当前结果

- stdio 模式零配置，开箱即用
- HTTP 模式提供完整的配置面板，用户可自定义 host/port/token/TLS
- 两种模式可在设置面板中一键切换

---

## 6. CLI 配置优先级

### 问题背景

CLI 需要支持多种配置来源，且需要明确冲突时的优先级。

### 做出的选择

```
优先级从高到低：
1. CLI flag        (--url / --token)
2. 环境变量        (SIYUAN_API_URL / SIYUAN_TOKEN)
3. 配置文件        (~/.siyuan-sisyphus/config.json 中的 active profile)
4. 默认值          (http://127.0.0.1:6806)
```

**多 profile 支持**：
- `config.json` 含 `profiles: Record<string, { apiUrl, token }>`
- `currentProfile` 字段指示当前默认 profile
- `--profile <name>` 可临时切换

### 拒绝的替代方案

- **方案 A：只支持配置文件**：不方便脚本化调用和 CI/CD 场景。
- **方案 B：环境变量优先级最高**：不方便用户临时覆盖（如测试不同 endpoint）。
- **方案 C：没有 profile 概念**：用户管理多环境（如本地/远程/工作/个人）时体验差。

### 当前结果

- 脚本化调用：`siyuan-sisyphus block list --url http://remote:6806 --token xxx`
- CI/CD 集成：`SIYUAN_API_URL=... siyuan-sisyphus ...`
- 日常开发：配置一次 `siyuan-sisyphus config set default --url http://127.0.0.1:6806`，之后直接调用

---

## 7. 构建设计

### 问题背景

项目需要同时产出三种产物（插件 UI、MCP server、CLI），且技术栈不同（浏览器环境 vs Node.js 环境）。

### 做出的选择

**Vite 多入口配置**：

```
BUILD_TARGET=renderer  →  dist/index.js       (浏览器环境，Svelte UI)
BUILD_TARGET=server    →  dist/mcp-server.cjs (Node.js 环境，MCP Server)
BUILD_TARGET=cli       →  cli/dist/cli.cjs    (Node.js 环境，独立 CLI)
```

**关键构建决策**：

| 决策 | 说明 |
|------|------|
| 输出格式 | 全部 CommonJS（CJS），兼容 SiYuan 插件加载机制 |
| inlineDynamicImports | 强制内联动态导入，产物为单文件 |
| server/cli external | 保留 Node 内置模块（fs/path/http 等），不打包进 bundle |
| renderer external | 仅排除 `siyuan`（SiYuan 运行时注入） |
| CLI shebang | 产物头部注入 `#!/usr/bin/env node`，并 `chmod 755` |
| SDK 轻量化 | 自定义 rollup 插件将 `validation/ajv-provider.js` 和 `experimental/tasks/*` 替换为本地 noop 实现，减小 bundle 体积 |

### 拒绝的替代方案

- **方案 A：使用 tsc 直接编译**：无法控制 bundle 大小，无法做 tree-shaking 和 noop 替换。
- **方案 B：使用 esbuild / rollup 直接**：Vite 已提供开箱即用的 TypeScript + Svelte 支持，无需重复配置。
- **方案 C：每个产物独立 package.json 和构建流程**：维护成本过高，Vite 多入口已足够灵活。

### 当前结果

- `pnpm dev` 同时 watch renderer + server
- `pnpm build` 产出 `dist/index.js` + `dist/mcp-server.cjs` + `package.zip`
- `pnpm build:cli` 产出 `cli/dist/cli.cjs`（自包含，零依赖）
- 产物大小：index.js ~30KB，mcp-server.cjs ~284KB，cli.cjs ~（自包含）

---

## 8. 错误处理策略

### 问题背景

系统需要处理来自多个源的错误：Zod 校验、SiYuan API、网络超时、权限不足、配置异常等。不同错误需要以不同方式呈现给不同消费者（LLM vs 人类终端用户）。

### 做出的选择

**统一错误格式化**（`tools/shared.ts: createErrorResult`）：

```
ZodError          → type: "validation_error",  message: "Invalid parameters: ..."
SiYuanError       → type: "api_error",         code: siYuanCode, message: siYuanMsg
权限不足          → type: "permission_denied", message: "Permission denied for notebook ..."
禁用工具/Action   → type: "disabled_error",    message: "Tool/Action is disabled"
其他 Error        → type: "internal_error",    message: error.message
```

**呈现层统一**（`presentation/invocation-format.ts`）：
- MCP 模式：错误文本保持 `tool(action="...")` 风格
- CLI 模式：错误文本自动翻译为 `siyuan <tool> <action> --flag` 风格

### 拒绝的替代方案

- **方案 A：直接抛出原始 Error 给 MCP SDK**：会导致 LLM 收到不友好的堆栈信息。
- **方案 B：每种错误各自格式化**：维护困难，风格不一致。

### 当前结果

- LLM 收到结构化的错误信息，能自动修正参数
- CLI 用户收到人类可读的错误提示，含 field-level 校验细节
- 所有错误类型都有明确的 `type` 字段，便于客户端分类处理

---

## 9. Puppy 吉祥物架构

### 问题背景

需要一个可视化的反馈机制，让用户感知 AI Agent 正在操作 SiYuan，同时增加趣味性。

### 做出的选择

**解耦的文件轮询架构**：

```
MCP Server (tool-lifecycle.ts)          Puppy UI (ToolPuppy.svelte)
    │                                        │
    │  writePuppyEvent()                     │  createJsonFilePoller()
    │     ↓                                  │     ↓ 每 500ms
    │  puppyEvents.json  ←───────────────────│  POST /api/file/getFile
    │                                        │     ↓
    │                                        │  解析事件 → 驱动状态机
```

**关键设计**：
- 不直接共享 JS 对象/内存，通过文件系统解耦
- Puppy 可独立于 server 运行（测试模式）
- 位置通过 `localStorage` 持久化
- 动画状态机（idle/reading/writing/deleting/moving/dangerous/success/error）

### 拒绝的替代方案

- **方案 A：直接共享 JS 变量**：耦合过强，Puppy 组件与 server 必须在同一进程。
- **方案 B：使用 SiYuan 广播/事件总线**：复杂度更高，且需要 SiYuan 原生支持。
- **方案 C：WebSocket 推送**：需要额外的端口和连接管理，过度设计。

### 当前结果

- Puppy 动画流畅，状态切换及时（500ms 轮询间隔）
- 测试模式下无后端也能运行全部动画
- 工资卡、爱心爆发、喂食等趣味功能增加用户粘性

---

## 10. 危险动作确认策略

### 问题背景

某些操作（delete/remove/find_replace 等）具有破坏性，需要防止 AI 意外执行。

### 做出的选择

**提示词层确认 + 标记系统**：

1. **`DANGEROUS_ACTIONS` 集合**：在 `config.ts` 中硬编码 15 个高危 action
2. **自动注入警告**：`buildAggregatedTool()` 自动在 tool description 中附加 `"⚠️ 危险动作: ... 需要用户确认"`
3. **Server Instructions**：`server-instructions.ts` 在 MCP instructions 中强调高危操作需确认
4. **不阻塞调用**：系统**不**在代码层面阻止危险 action 的执行（LLM 可能绕过），而是依赖 LLM 自律 + 用户监督

### 拒绝的替代方案

- **方案 A：代码层二次确认弹窗**：在 MCP 协议中无法实现弹窗确认（server 无法主动弹窗）；CLI 模式已约定"用户主动输入即确认"。
- **方案 B：完全禁止危险 action**：过于保守，很多合理的自动化场景需要 delete/remove。
- **方案 C：每个危险 action 要求额外 token/密码**：增加使用门槛，不符合 MCP 协议设计哲学。

### 当前结果

- LLM 在调用危险 action 前通常会在对话中请求用户确认
- 用户可通过 ToolConfig 完全禁用特定 action
- 设置面板提供"高危动作"的视觉标记

# 部署与配置指南

本指南介绍如何部署和配置 SiYuan MCP Sisyphus 插件，包括安装方法、连接方式以及不同部署场景的配置说明。

## 目录

- [安装](#安装)
- [连接方式概览](#连接方式概览)
- [HTTP 模式](#http-模式)
- [stdio 模式](#stdio-模式)
- [mcp-remote 桥接](#mcp-remote-桥接)
- [环境变量](#环境变量)
- [部署场景](#部署场景)
- [安全配置](#安全配置)
- [故障排查](#故障排查)

---

## 安装

### 从思源集市安装（推荐）

1. 打开思源笔记
2. 进入 `设置 -> 集市`
3. 搜索 "SiYuan MCP"
4. 点击安装并启用插件

### 从源码安装

```bash
git clone https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus.git
cd siyuan-plugins-mcp-sisyphus
pnpm install
pnpm build
pnpm make-link
```

> **注意：** `make-link` 命令会在思源插件目录和开发文件夹之间创建符号链接，实现实时开发。

---

## 连接方式概览

SiYuan MCP Sisyphus 支持两种主要连接方式：**HTTP** 和 **stdio**。根据客户端类型和部署场景选择合适的方式。

| 客户端类型 | 推荐方式 | 适用场景 |
|-----------|---------|---------|
| 桌面端（Windows / macOS / Linux） | HTTP 或 stdio | 本地开发，单机使用 |
| Docker / 容器 | stdio | 容器化部署 |
| WSL（Windows 子系统 Linux） | HTTP | Windows 跨环境使用 |
| 远程 / 局域网 | HTTP | 同一网络多台机器 |

**快速配置：** 打开「插件 -> siyuan-plugins-mcp-sisyphus -> 设置 -> 连接配置」，底部提供三段可直接复制的 JSON：`HTTP 连接方式`、`mcp-remote 桥接`、`stdio 连接方式`。

---

## HTTP 模式

HTTP 模式下，插件在思源内部托管一个 HTTP MCP 服务器，MCP 客户端连接到此 HTTP 端点。

### 启动 HTTP 服务器

1. 打开「插件 -> siyuan-plugins-mcp-sisyphus -> 设置 -> 连接配置」
2. 配置以下参数：
   - **Host**：`127.0.0.1`（默认）或 `0.0.0.0`（远程访问）
   - **Port**：`36806`（默认）
   - **Require Bearer token**：保持开启（推荐）
3. 点击 **Start** - 状态变为 "Running"
4. 勾选 **随思源自动启动** 实现自动启动

### 客户端配置（HTTP）

适用于原生支持 HTTP MCP 的客户端（Cline、Cherry Studio、Cursor、Windsurf、Claude Code）：

```json
{
  "mcpServers": {
    "siyuan": {
      "type": "http",
      "url": "http://127.0.0.1:36806/mcp",
      "headers": { "Authorization": "Bearer <从设置面板复制的token>" }
    }
  }
}
```

> **Claude Code 注意：** 必须包含 `"type": "http"`，否则 schema 校验会失败。将此配置添加到 `~/.claude.json` 的 `mcpServers` 字段中。

### WSL / 跨机器配置

当 Agent 运行在 WSL 或不同机器上时：

1. 在插件设置中将 **Host** 设为 `0.0.0.0`
2. 在客户端配置中使用宿主机的 IP（通常是 `192.168.x.x`）：

```json
{
  "mcpServers": {
    "siyuan": {
      "type": "http",
      "url": "http://192.168.1.100:36806/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

> **安全警告：** 绑定到非回环地址（`0.0.0.0`）时，务必保持 Token 鉴权开启。否则同局域网任何设备都能访问你的工作区。

---

## stdio 模式

stdio 模式下，客户端将 `mcp-server.cjs` 作为子进程运行，脚本通过 API 连接到思源。

### 客户端配置（stdio）

```json
{
  "mcpServers": {
    "siyuan": {
      "command": "node",
      "args": ["/path/to/mcp-server.cjs"],
      "env": {
        "SIYUAN_API_URL": "http://127.0.0.1:6806",
        "SIYUAN_TOKEN": "xxxxxx"
      }
    }
  }
}
```

**`mcp-server.cjs` 路径：**
- 默认插件位置：`{SIYUAN_WORKSPACE}/data/plugins/siyuan-plugins-mcp-sisyphus/mcp-server.cjs`
- 插件设置面板会在可用时自动填充此路径

**重要说明：**
- 端口 `6806` 是思源 API 端口，不是 MCP 端口
- 不要将 MCP 客户端直接配置到 `http://<思源IP>:6806`
- 而是在本地运行 `mcp-server.cjs`，让它通过 `SIYUAN_API_URL` 连接
- 如果思源 API 鉴权已关闭，可省略 `SIYUAN_TOKEN`
- stdio 每次只能对应一个客户端连接

---

## mcp-remote 桥接

当客户端只支持 stdio，但你想连接到 HTTP 服务器时，使用 `mcp-remote`。

### 配置

```json
{
  "mcpServers": {
    "siyuan": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://127.0.0.1:36806/mcp",
        "--header",
        "Authorization: Bearer <token>"
      ]
    }
  }
}
```

此配置将基于 stdio 的客户端桥接到 HTTP MCP 服务器。

---

## 环境变量

以下环境变量控制 MCP 服务器的行为：

### 核心变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `SIYUAN_API_URL` | 思源 API 端点地址 | `http://127.0.0.1:6806` |
| `SIYUAN_TOKEN` | 思源 API 鉴权 Token | - |
| `SIYUAN_MCP_TRANSPORT` | 传输模式：`stdio` 或 `http` | `stdio` |

### HTTP 模式变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `SIYUAN_MCP_HOST` | HTTP 服务器绑定地址 | `127.0.0.1` |
| `SIYUAN_MCP_PORT` | HTTP 服务器端口 | `36806` |
| `SIYUAN_MCP_TOKEN` | HTTP 鉴权 Bearer Token | - |
| `SIYUAN_MCP_PATH` | HTTP 端点路径 | `/mcp` |

### 内部变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `SIYUAN_MCP_PARENT_PID` | 父进程 ID（用于看门狗） | - |

---

## 部署场景

### Docker 部署

当思源运行在 Docker 中时，使用 stdio 模式：

1. **暴露容器的 6806 端口**
2. **在客户端机器上**运行 `mcp-server.cjs`：

```json
{
  "mcpServers": {
    "siyuan": {
      "command": "node",
      "args": ["/path/to/mcp-server.cjs"],
      "env": {
        "SIYUAN_API_URL": "http://<docker宿主机IP>:6806",
        "SIYUAN_TOKEN": "<思源API token>"
      }
    }
  }
}
```

**Docker 安全建议：**
- 保持思源 API Token 开启
- 使用防火墙规则将 6806 端口限制为可信设备访问
- 不要在没有额外鉴权的情况下将 6806 暴露到公网

### WSL + Windows 桌面端

当思源运行在 Windows 上，而 Agent 运行在 WSL 中时：

1. 在插件设置中将 HTTP **Host** 设为 `0.0.0.0`
2. 找到 Windows 宿主机的 IP（从 WSL 看通常是 `192.168.x.x`）
3. 在 WSL 客户端配置中使用宿主机 IP

```json
{
  "mcpServers": {
    "siyuan": {
      "type": "http",
      "url": "http://192.168.1.100:36806/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

### 局域网（LAN）

从同一网络的另一台机器访问思源：

1. 将 HTTP **Host** 设为 `0.0.0.0`
2. 确保防火墙允许 36806 端口的流量
3. 在客户端配置中使用宿主机的局域网 IP
4. **务必**启用 Token 鉴权

---

## 安全配置

### Token 鉴权

**HTTP 模式：**
- 绑定到 `0.0.0.0` 时，务必保持「Require Bearer token」开启
- 使用强随机生成的 Token
- 插件默认自动生成安全的 Token

**stdio 模式：**
- 将 `SIYUAN_TOKEN` 安全地存储在环境变量中
- 避免在配置文件中硬编码 Token

### 网络绑定

| 绑定地址 | 适用场景 | 安全性 |
|---------|---------|--------|
| `127.0.0.1` | 仅本机访问 | 最安全 |
| `localhost` | 仅本机访问 | 最安全 |
| `0.0.0.0` | 远程/局域网访问 | 需要 Token 鉴权 |

### 高危操作

以下操作需要用户明确确认：

- `notebook(action="remove")`
- `notebook(action="set_permission")`
- `document(action="remove")`
- `document(action="move")`
- `document(action="remove_batch")`
- `block(action="delete")`
- `block(action="move")`
- `file(action="upload_asset")`
- `file(action="remove_unused_assets")`
- `file(action="delete_asset")`
- `search(action="find_replace")`
- `system(action="workspace_info")`
- `tag(action="remove")`
- `flashcard(action="remove_card")`

### 权限模型

使用权限系统控制笔记本级别的访问：

| 权限 | 说明 |
|------|------|
| `rwd` | 完全读写删除权限 |
| `rw` | 读写权限，无删除 |
| `r` | 只读权限 |
| `none` | 无权限 |

使用 `notebook(action="set_permission")` 配置每个笔记本的权限。

---

## 故障排查

### 连接失败

**HTTP 模式：**
- 确认设置面板显示 "Running"
- 检查 URL 和 Token 是否正确复制
- 确保防火墙未阻止端口
- 远程访问时，确认 Host 已设为 `0.0.0.0`

**stdio 模式：**
- 确认路径指向 `mcp-server.cjs`
- 修改配置后重启 MCP 客户端
- 检查从客户端机器是否可以访问 `SIYUAN_API_URL`

### 工具不可见

- HTTP：确认服务器状态为 "Running"
- stdio：验证进程是否无错误启动
- 检查客户端日志中的连接错误

### 连接成功但调用失败

**HTTP 模式：**
- 思源 API Token 由插件自动透传，无需手动配置
- 验证思源是否正常运行
- 检查目标笔记本权限是否被设为 `r` 或 `none`

**stdio 模式：**
- 验证 `SIYUAN_API_URL`（默认：`http://127.0.0.1:6806`）
- 验证 `SIYUAN_TOKEN`（如果 API 鉴权已开启）
- 检查笔记本权限

### 权限被拒绝错误

- 使用 `notebook(action="get_permissions")` 检查笔记本权限级别
- 使用 `notebook(action="set_permission")` 调整权限
- 某些操作需要 `rwd` 权限（删除操作）

### 查看日志

**HTTP 模式：**
- 检查浏览器控制台中的思源插件日志
- 检查 MCP 客户端输出中的连接日志

**stdio 模式：**
- MCP 客户端通常会捕获 stderr 输出
- 手动运行查看日志：`node mcp-server.cjs`

---

## 快速参考

### 连接方式决策树

```
是否同一台机器？
├── 是 → HTTP（更简单）或 stdio
└── 否（Docker/WSL/远程）
    ├── Docker → stdio（客户端运行 mcp-server.cjs，SIYUAN_API_URL 指向容器）
    ├── WSL → HTTP（绑定 0.0.0.0，使用宿主机 IP）
    └── 局域网 → HTTP（绑定 0.0.0.0，使用局域网 IP，启用 Token）
```

### 默认端口

| 服务 | 端口 | 说明 |
|------|------|------|
| 思源 API | 6806 | 思源原生 API |
| MCP HTTP | 36806 | 插件的 MCP HTTP 服务器 |

### 文件位置

| 文件 | 默认位置 |
|------|---------|
| 插件 | `{workspace}/data/plugins/siyuan-plugins-mcp-sisyphus/` |
| MCP 服务器 | `{plugin}/mcp-server.cjs` |
| 配置 | `{workspace}/data/storage/petal/siyuan-plugins-mcp-sisyphus/` |

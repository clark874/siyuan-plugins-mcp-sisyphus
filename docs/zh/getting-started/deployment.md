# Deployment

这个页面覆盖安装、连接方式和不同运行环境下的配置。

适用场景：你需要把 MCP 客户端连到插件，或者在本机、WSL、Docker、局域网场景下完成配置。

相关页面：

- [快速开始](./index.md)
- [HTTPS](./https.md)
- [Troubleshooting](./troubleshooting.md)

## 安装

### 从集市安装

1. 打开思源笔记
2. 进入 `设置 -> 集市`
3. 搜索 `SiYuan Sisyphus`
4. 安装并启用插件

### 从源码安装

```bash
git clone https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus.git
cd siyuan-plugins-mcp-sisyphus
pnpm install
pnpm build
pnpm make-link
```

## 连接方式

| 场景 | 推荐方式 | 原因 |
|------|----------|------|
| 桌面端本机使用 | HTTP 或 stdio | 两者都可直接使用 |
| Docker / 远程思源 | stdio | 更适合把 `mcp-server.cjs` 运行在客户端侧 |
| WSL / 跨机器 | HTTP | 更容易跨环境连接 |
| 只支持 stdio 的 MCP 客户端 | `mcp-remote` bridge | 复用 HTTP 端点 |

## HTTP 模式

插件侧设置：

- Host：默认 `127.0.0.1`，远程访问时用 `0.0.0.0`
- Port：`36806`
- 保持 Bearer Token 开启
- 启动服务，必要时启用自动启动

客户端配置：

```json
{
  "mcpServers": {
    "siyuan": {
      "type": "http",
      "url": "http://127.0.0.1:36806/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

说明：

- Claude Code 必须包含 `"type": "http"`
- 绑定 `0.0.0.0` 时一定要保留 Token 鉴权

## stdio 模式

让客户端把 `mcp-server.cjs` 作为子进程运行，并连接思源 API。

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

说明：

- `6806` 是思源 API 端口，不是 MCP 端口
- `mcp-server.cjs` 一般在 `{workspace}/data/plugins/siyuan-plugins-mcp-sisyphus/`
- stdio 每次只服务一个客户端进程

## `mcp-remote` 桥接

当客户端只支持 stdio 时，可使用：

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

## 环境变量

核心变量：

| 变量 | 默认值 | 作用 |
|------|--------|------|
| `SIYUAN_API_URL` | `http://127.0.0.1:6806` | 思源 API 地址 |
| `SIYUAN_TOKEN` | 无 | 思源 API Token |
| `SIYUAN_MCP_TRANSPORT` | `stdio` | 传输模式 |

HTTP 模式：

| 变量 | 默认值 | 作用 |
|------|--------|------|
| `SIYUAN_MCP_HOST` | `127.0.0.1` | 绑定地址 |
| `SIYUAN_MCP_PORT` | `36806` | 绑定端口 |
| `SIYUAN_MCP_TOKEN` | 无 | Bearer Token |
| `SIYUAN_MCP_PATH` | `/mcp` | HTTP 路径 |

## 部署场景

### Docker

- 暴露思源端口 `6806`
- 在客户端侧运行 `mcp-server.cjs`
- 保持思源 API Token 开启
- 不要在没有额外保护的情况下暴露 `6806`

### WSL

- 插件 HTTP 绑定到 `0.0.0.0`
- 在 WSL 中使用 Windows 宿主机 IP
- 保持 Bearer Token 开启

### 局域网

- 绑定到 `0.0.0.0`
- 放行 `36806` 端口
- 使用宿主机局域网 IP
- 保持 Bearer Token 开启

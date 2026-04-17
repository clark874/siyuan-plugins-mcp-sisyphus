# HTTPS 使用指南

---

## 第一步：生成证书

### 方案 A — 自签名证书（本地/局域网使用）

```bash
# 生成私钥 + 自签名证书（有效期 365 天）
openssl req -x509 -newkey rsa:4096 -sha256 -days 365 -nodes \
  -keyout mcp-key.pem \
  -out mcp-cert.pem \
  -subj "/CN=localhost" \
  -addext "subjectAltName=IP:127.0.0.1,DNS:localhost"
```

推荐保存位置（任意绝对路径均可）：
```
~/mcp-tls/mcp-cert.pem
~/mcp-tls/mcp-key.pem
```

### 方案 B — 受信任的 CA 证书（公网/企业使用）

使用 Let's Encrypt、ZeroSSL 等签发的证书，客户端无需额外配置。

---

## 第二步：插件端配置

打开思源 → 插件设置 → **HTTP Server** 面板：

| 字段 | 填写内容 |
|---|---|
| Host | `127.0.0.1`（本机）或 `0.0.0.0`（局域网） |
| Port | `36806`（或自定义） |
| Require Bearer token | ✅ 建议开启 |
| **Enable HTTPS (TLS)** | ✅ 勾选 |
| **Cert** | `/Users/yourname/mcp-tls/mcp-cert.pem` |
| **Key** | `/Users/yourname/mcp-tls/mcp-key.pem` |
| CA | （留空，自签名不需要） |

点击 **Apply & Restart**，日志显示：
```
[MCP][HTTPS] listening on https://127.0.0.1:36806/mcp
[MCP][HTTPS] auth: Bearer token required
```

---

## 第三步：客户端配置

### 方案一：直连 HTTP（推荐，支持 Claude Desktop / Cursor 等）

```json
{
  "mcpServers": {
    "siyuan": {
      "type": "http",
      "url": "https://127.0.0.1:36806/mcp",
      "headers": {
        "Authorization": "Bearer 你的token"
      }
    }
  }
}
```

> **自签名证书问题**：部分客户端会拒绝自签名证书。如果遇到 `certificate verify failed`，需要让客户端信任该证书（见下文）。

---

### 方案二：mcp-remote 桥接（兼容性最好）

```json
{
  "mcpServers": {
    "siyuan": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://127.0.0.1:36806/mcp",
        "--header",
        "Authorization: Bearer 你的token"
      ]
    }
  }
}
```

自签名证书时，在 `env` 中添加：
```json
{
  "env": {
    "NODE_TLS_REJECT_UNAUTHORIZED": "0"
  }
}
```

> 完整示例：

```json
{
  "mcpServers": {
    "siyuan": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://127.0.0.1:36806/mcp",
        "--header",
        "Authorization: Bearer 你的token"
      ],
      "env": {
        "NODE_TLS_REJECT_UNAUTHORIZED": "0"
      }
    }
  }
}
```

---

## 信任自签名证书（一劳永逸）

**macOS：**
```bash
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain ~/mcp-tls/mcp-cert.pem
```

**Windows（管理员 PowerShell）：**
```powershell
Import-Certificate -FilePath "$env:USERPROFILE\mcp-tls\mcp-cert.pem" `
  -CertStoreLocation Cert:\LocalMachine\Root
```

导入后，直连方案无需 `NODE_TLS_REJECT_UNAUTHORIZED=0`，客户端会正常验证证书。

---

## 常见问题

| 错误 | 原因 | 解决方式 |
|---|---|---|
| `Failed to load TLS credentials` | 证书路径不存在或权限不足 | 检查路径是否绝对路径，文件是否可读 |
| `certificate verify failed` | 自签名证书未受信任 | 见上方"信任证书"步骤，或加 `NODE_TLS_REJECT_UNAUTHORIZED=0` |
| `EADDRINUSE` | 端口已被占用 | 换端口或停止已有实例 |
| `ERR_SSL_WRONG_VERSION_NUMBER` | 客户端用 `http://` 连接了 HTTPS 端口 | 检查 URL 是否为 `https://` |
| `Connection failed` / `ConnectError` | 系统代理未排除本地地址 | 见下方"macOS 系统代理冲突"章节 |

---

## macOS 系统代理冲突（Kimi / Python 客户端）

### 现象

连接 `https://127.0.0.1:36806/mcp` 时报错：

```
✗ Connection failed: RuntimeError: Client failed to connect
```

`curl` 或浏览器能正常访问，但 kimi-cli、Python httpx 等工具连不上。

### 根因

macOS 系统设置了 HTTP/HTTPS 代理（如 Clash、Surge 等工具配置的 `127.0.0.1:1082`）。Python 的 `httpx` 库默认读取系统代理设置，会把对 `127.0.0.1` 的请求也转发给代理，而代理通常不转发本地回环地址，导致连接失败。

`curl` 不走系统代理，所以不受影响。

### 快速验证

```bash
# 查看当前系统代理
scutil --proxy

# 查看 Python 实际读到的代理
python3 -c "import urllib.request; print(urllib.request.getproxies())"
```

如果输出里 `http`/`https` 指向某个代理地址，且 `no` 字段中没有 `127.0.0.1`，即为此问题。

### 解决方案

**方案一：设置 `NO_PROXY` 环境变量（推荐）**

在 `~/.zshrc`（或 `~/.bash_profile`）中添加：

```bash
export NO_PROXY=127.0.0.1,localhost,::1,.local
```

然后重载配置：

```bash
source ~/.zshrc
```

**方案二：在系统代理绕过列表中添加 `127.0.0.1`**

```
系统设置 → 网络 → 选择当前网络 → 详细信息 → 代理 → 绕过代理设置
```

添加 `127.0.0.1`，保存。

> 注意：macOS 系统代理绕过列表里的 `localhost` 和 `127.0.0.1` 是两个独立条目，需要分别填写，不会自动等价。

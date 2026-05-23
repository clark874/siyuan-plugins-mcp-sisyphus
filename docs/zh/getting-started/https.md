# HTTPS 配置

这个页面说明如何为插件的 HTTP 连接启用 TLS。

适用场景：你需要在局域网、企业环境或远程场景下使用 HTTPS，而不是纯 HTTP。

相关页面：

- [部署指南](./deployment.md)
- [故障排查](./troubleshooting.md)

## 第一步：准备证书

### 方案 A：自签名证书

适用于本机或局域网：

```bash
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout siyuan-mcp.key \
  -out siyuan-mcp.crt \
  -days 365
```

### 方案 B：受信任 CA 证书

适用于公网或企业内网。核心要求是拿到：

- 证书文件
- 私钥文件
- 如有需要，CA 链文件

## 第二步：插件端配置

在插件设置中启用 HTTPS，并填写：

- 证书路径
- 私钥路径
- 可选 CA 文件路径

同时确认：

- Host 与 Port 配置正确
- Bearer Token 仍保持开启

## 第三步：客户端配置

把客户端地址改成 `https://...`。

HTTP 直连示例：

```json
{
  "mcpServers": {
    "siyuan": {
      "type": "http",
      "url": "https://127.0.0.1:36806/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

`mcp-remote` 示例：

```json
{
  "mcpServers": {
    "siyuan": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://127.0.0.1:36806/mcp",
        "--header",
        "Authorization: Bearer <token>"
      ]
    }
  }
}
```

## 信任自签名证书

如果使用自签名证书，需要让客户端机器信任它。否则常见问题是：

- TLS 握手失败
- 证书不受信任
- 客户端直接拒绝连接

## 常见问题

- 证书路径错误：确认插件读取到的路径有效
- 证书与私钥不匹配：重新生成或重新导出
- 客户端仍走系统代理：先排除代理导致的 TLS/连接错误

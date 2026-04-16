# Deployment and Configuration Guide

This guide covers how to deploy and configure the SiYuan MCP Sisyphus plugin, including installation methods, connection modes, and configuration for different deployment scenarios.

## Table of Contents

- [Installation](#installation)
- [Connection Modes Overview](#connection-modes-overview)
- [HTTP Mode](#http-mode)
- [stdio Mode](#stdio-mode)
- [mcp-remote Bridge](#mcp-remote-bridge)
- [Environment Variables](#environment-variables)
- [Deployment Scenarios](#deployment-scenarios)
- [Security Configuration](#security-configuration)
- [Troubleshooting](#troubleshooting)

---

## Installation

### Install from SiYuan Marketplace (Recommended)

1. Open SiYuan Note
2. Go to `Settings -> Marketplace`
3. Search for "SiYuan MCP"
4. Click Install and Enable

### Install from Source

```bash
git clone https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus.git
cd siyuan-plugins-mcp-sisyphus
pnpm install
pnpm build
pnpm make-link
```

> **Note:** The `make-link` command creates a symbolic link from the SiYuan plugins directory to your development folder, enabling live development.

---

## Connection Modes Overview

SiYuan MCP Sisyphus supports two primary connection modes: **HTTP** and **stdio**. Choose based on your client type and deployment scenario.

| Client Type | Recommended Mode | Use Case |
|-------------|------------------|----------|
| Desktop (Windows / macOS / Linux) | HTTP or stdio | Local development, single machine |
| Docker / Container | stdio | Containerized deployment |
| WSL (Windows Subsystem for Linux) | HTTP | Cross-environment on Windows |
| Remote / LAN | HTTP | Multiple machines on same network |

**Quick Config:** Open `Plugin -> siyuan-plugins-mcp-sisyphus -> Settings -> Connection Config` to find three ready-to-copy JSON snippets: `HTTP Connection`, `mcp-remote Bridge`, and `stdio Connection`.

---

## HTTP Mode

In HTTP mode, the plugin hosts an HTTP MCP server inside SiYuan. The MCP client connects to this HTTP endpoint.

### Starting the HTTP Server

1. Open `Plugin -> siyuan-plugins-mcp-sisyphus -> Settings -> Connection Config`
2. Configure the following:
   - **Host**: `127.0.0.1` (default) or `0.0.0.0` for remote access
   - **Port**: `36806` (default)
   - **Require Bearer token**: Keep enabled (recommended)
3. Click **Start** - Status changes to "Running"
4. Check **Auto-start with SiYuan** for automatic startup

### Client Configuration (HTTP)

For clients with native HTTP MCP support (Cline, Cherry Studio, Cursor, Windsurf, Claude Code):

```json
{
  "mcpServers": {
    "siyuan": {
      "type": "http",
      "url": "http://127.0.0.1:36806/mcp",
      "headers": { "Authorization": "Bearer <token-from-settings>" }
    }
  }
}
```

> **Claude Code Note:** You must include `"type": "http"` or schema validation will fail. Add this to `~/.claude.json` under the `mcpServers` field.

### WSL / Cross-Machine Configuration

When your agent runs in WSL or on a different machine:

1. Set **Host** to `0.0.0.0` in plugin settings
2. Use your host machine's IP in the client config (usually `192.168.x.x`):

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

> **Security Warning:** When binding to a non-loopback address (`0.0.0.0`), always keep token authentication enabled. Without it, anyone on the same network can access your workspace.

---

## stdio Mode

In stdio mode, the client runs `mcp-server.cjs` as a subprocess, and the script connects to SiYuan via the API.

### Client Configuration (stdio)

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

**Path to `mcp-server.cjs`:**
- Default plugin location: `{SIYUAN_WORKSPACE}/data/plugins/siyuan-plugins-mcp-sisyphus/mcp-server.cjs`
- The plugin settings panel auto-fills this path when available

**Important Notes:**
- Port `6806` is the SiYuan API port, not an MCP port
- Do not point your MCP client directly at `http://<siyuan-host>:6806`
- Instead, run `mcp-server.cjs` locally and let it connect via `SIYUAN_API_URL`
- If SiYuan API auth is disabled, omit `SIYUAN_TOKEN`
- stdio supports only one client at a time

---

## mcp-remote Bridge

Use `mcp-remote` when your client only supports stdio but you want to connect to the HTTP server.

### Configuration

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

This bridges stdio-based clients to the HTTP MCP server.

---

## Environment Variables

The following environment variables control the MCP server behavior:

### Core Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SIYUAN_API_URL` | SiYuan API endpoint URL | `http://127.0.0.1:6806` |
| `SIYUAN_TOKEN` | SiYuan API authentication token | - |
| `SIYUAN_MCP_TRANSPORT` | Transport mode: `stdio` or `http` | `stdio` |

### HTTP Mode Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SIYUAN_MCP_HOST` | HTTP server bind address | `127.0.0.1` |
| `SIYUAN_MCP_PORT` | HTTP server port | `36806` |
| `SIYUAN_MCP_TOKEN` | Bearer token for HTTP auth | - |
| `SIYUAN_MCP_PATH` | HTTP endpoint path | `/mcp` |

### Internal Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SIYUAN_MCP_PARENT_PID` | Parent process ID for watchdog | - |

---

## Deployment Scenarios

### Docker Deployment

When SiYuan runs in Docker, use stdio mode:

1. **Expose port 6806** from the Docker container
2. **On the client machine**, run `mcp-server.cjs`:

```json
{
  "mcpServers": {
    "siyuan": {
      "command": "node",
      "args": ["/path/to/mcp-server.cjs"],
      "env": {
        "SIYUAN_API_URL": "http://<docker-host-ip>:6806",
        "SIYUAN_TOKEN": "<siyuan-api-token>"
      }
    }
  }
}
```

**Security Recommendations for Docker:**
- Keep SiYuan API token enabled
- Use firewall rules to restrict port 6806 to trusted devices
- Do not expose 6806 to the public internet without additional authentication

### WSL + Windows Desktop

When SiYuan runs on Windows and your agent runs in WSL:

1. Set HTTP **Host** to `0.0.0.0` in plugin settings
2. Find your Windows host IP (usually `192.168.x.x` from WSL)
3. Use the host IP in your WSL client configuration

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

### LAN (Local Area Network)

For accessing SiYuan from another machine on the same network:

1. Set HTTP **Host** to `0.0.0.0`
2. Ensure firewall allows traffic on port 36806
3. Use the host machine's LAN IP in client configuration
4. **Always** enable token authentication

---

## Security Configuration

### Token Authentication

**HTTP Mode:**
- Always keep "Require Bearer token" enabled when binding to `0.0.0.0`
- Use a strong, randomly generated token
- The plugin auto-generates a secure token by default

**stdio Mode:**
- Store `SIYUAN_TOKEN` securely in environment variables
- Avoid hardcoding tokens in configuration files

### Network Binding

| Binding | Use Case | Security |
|---------|----------|----------|
| `127.0.0.1` | Same machine only | Safest |
| `localhost` | Same machine only | Safest |
| `0.0.0.0` | Remote/LAN access | Requires token auth |

### High-Risk Operations

The following actions require explicit user confirmation:

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

### Permission Model

Control notebook-level access with the permission system:

| Permission | Description |
|------------|-------------|
| `rwd` | Full read/write/delete access |
| `rw` | Read/write, no delete |
| `r` | Read-only |
| `none` | No access |

Use `notebook(action="set_permission")` to configure per-notebook permissions.

---

## Troubleshooting

### Connection Failed

**HTTP Mode:**
- Verify the settings panel shows "Running"
- Check URL and token are correctly copied
- Ensure no firewall blocks the port
- For remote access, confirm Host is set to `0.0.0.0`

**stdio Mode:**
- Verify the path points to `mcp-server.cjs`
- Restart the MCP client after configuration changes
- Check that `SIYUAN_API_URL` is reachable from the client machine

### Tools Not Visible

- HTTP: Confirm server status is "Running"
- stdio: Verify the process starts without errors
- Check client logs for connection errors

### Calls Fail After Connection

**HTTP Mode:**
- SiYuan API token is forwarded automatically - no manual config needed
- Verify SiYuan is running normally
- Check the target notebook permission is not `r` or `none`

**stdio Mode:**
- Verify `SIYUAN_API_URL` (default: `http://127.0.0.1:6806`)
- Verify `SIYUAN_TOKEN` if API auth is enabled
- Check notebook permissions

### Permission Denied Errors

- Check notebook permission level with `notebook(action="get_permissions")`
- Adjust with `notebook(action="set_permission")`
- Some actions require `rwd` permission (delete operations)

### Viewing Logs

**HTTP Mode:**
- Check browser console for SiYuan plugin logs
- Check MCP client output for connection logs

**stdio Mode:**
- MCP client usually captures stderr output
- Run manually to see logs: `node mcp-server.cjs`

---

## Quick Reference

### Connection Mode Decision Tree

```
Same machine?
├── Yes → HTTP (easier) or stdio
└── No (Docker/WSL/Remote)
    ├── Docker → stdio (mcp-server.cjs on client, SIYUAN_API_URL to container)
    ├── WSL → HTTP (bind 0.0.0.0, use host IP)
    └── LAN → HTTP (bind 0.0.0.0, use LAN IP, enable token)
```

### Default Ports

| Service | Port | Description |
|---------|------|-------------|
| SiYuan API | 6806 | SiYuan's native API |
| MCP HTTP | 36806 | Plugin's MCP HTTP server |

### File Locations

| File | Default Location |
|------|------------------|
| Plugin | `{workspace}/data/plugins/siyuan-plugins-mcp-sisyphus/` |
| MCP Server | `{plugin}/mcp-server.cjs` |
| Config | `{workspace}/data/storage/petal/siyuan-plugins-mcp-sisyphus/` |

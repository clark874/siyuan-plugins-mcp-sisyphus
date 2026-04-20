# Overview

This page describes the top-level layered architecture, runtime modes, and technology stack of the system.

Use case: You need to quickly build a complete mental model from the AI Agent down to the SiYuan data boundary.

---

## Four-Layer Architecture

The system consists of four layers from outside to inside:

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: AI Agent / MCP Client                             │
│  - Claude Desktop / Kimi CLI / Cursor / other MCP clients   │
│  - Communicates via stdio or HTTP(S) using MCP protocol     │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: MCP Server / CLI                                  │
│  ┌──────────────┐  ┌─────────────────────────────────────┐  │
│  │ Plugin MCP   │  │ Standalone CLI (siyuan-sisyphus)    │  │
│  │ Server       │  │ - Direct TOOL_REGISTRY calls        │  │
│  │ - stdio mode │  │ - Bypasses MCP protocol entirely    │  │
│  │ - HTTP mode  │  │                                     │  │
│  └──────────────┘  └─────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Plugin Runtime & Tool Layer                        │
│  - Tool Registry (10 aggregated tools)                      │
│  - Tool Lifecycle (analytics / telemetry / mascot)          │
│  - Permission Manager (notebook-level 4-tier permissions)   │
│  - Settings Panel & Mascot UI                               │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: SiYuan HTTP API & Data Model                      │
│  - SiYuanClient (unified HTTP wrapper)                      │
│  - Notebook / Document / Block / Attribute View / File      │
│    / Search / Tag / System / Flashcard APIs                 │
│  - SQLite data storage                                      │
└─────────────────────────────────────────────────────────────┘
```

**Key boundary**: Layer 1 and Layer 2 communicate via the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) standard. Layer 2 and Layer 3 use MCP in plugin mode (`ListToolsRequestSchema` / `CallToolRequestSchema`), but in CLI mode they use **direct function calls**. Layer 3 and Layer 4 always go through SiYuan's HTTP APIs — **never directly accessing the local filesystem** — ensuring remote safety.

---

## Dual-Product Architecture

This repository produces two independently usable products:

| Dimension | SiYuan Plugin | Standalone CLI (`siyuan-sisyphus`) |
|-----------|--------------|-----------------------------------|
| **Entry file** | `src/index.ts` | `src/cli/index.ts` |
| **Build output** | `dist/index.js` + `dist/mcp-server.cjs` | `cli/dist/cli.cjs` |
| **Runtime mode** | Long-running process, starts with SiYuan | Short-lived process, exits after one call |
| **Transport** | stdio (default) / HTTP (optional) | Direct function calls, no MCP transport |
| **Config source** | Plugin settings panel → SiYuan storage | CLI profile + plugin UI config from SiYuan storage |
| **Tool toggles** | User fine-controls each action via UI | Same UI-controlled tool/action toggles |
| **Mascot UI** | Yes (Svelte component mounted to DOM) | No |
| **Permission mgmt** | Reads from SiYuan storage | Same `PermissionManager`; unconfigured notebooks default to `rwd` |
| **Use case** | AI client integration, daily continuous use | Scripting, CI/CD, quick queries |

Both products **share the same core**: `TOOL_REGISTRY`, `SiYuanClient`, `PermissionManager`, `tool-lifecycle`, and all `src/api/*` wrappers. The differences are only in the outer packaging (MCP Server vs CLI argument parsing) and config persistence.

---

## Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Build** | Vite | Multi-entry compilation (renderer / server / cli), outputs CommonJS |
| **Frontend** | Svelte | Settings panel `McpConfig`, mascot `ToolPuppy` |
| **Language** | TypeScript | Source uses ESM (`"type": "module"`), output is CJS |
| **MCP Protocol** | `@modelcontextprotocol/sdk` ^1.26.0 | stdio / StreamableHTTP dual transport |
| **Validation** | Zod ^4.3.6 | Input parameter schemas for all tool actions (~913 lines) |
| **Testing** | Vitest | Unit + Integration + Smoke three-tier testing |
| **Docs** | VitePress | Bilingual site (English default + Simplified Chinese `/zh/`) |
| **CLI Parsing** | minimist | Two-pass parsing: global flags + schema-aware action flags |

---

## Runtime Mode Comparison

### Plugin stdio Mode (Default)

```
AI Client (e.g. Claude Desktop)
    ↓ spawns child process
SiYuan.app → loads plugin → starts mcp-server.cjs (stdio)
    ↓ MCP stdio protocol
Calls TOOL_REGISTRY → SiYuanClient → SiYuan HTTP API
```

- AI client spawns `dist/mcp-server.cjs` as a child process
- Standard input/output serve as the MCP transport channel
- Suitable for local desktop AI assistants (Claude Desktop, Kimi CLI, etc.)

### Plugin HTTP Mode

```
AI Client / Browser / Third-party service
    ↓ HTTP POST (Bearer Token)
SiYuan.app → loads plugin → starts embedded HTTP Server
    ↓ StreamableHTTP (MCP 2025-03-26 spec)
Calls TOOL_REGISTRY → SiYuanClient → SiYuan HTTP API
```

- Plugin auto-starts HTTP server on `onload()` (if user-enabled)
- Supports Session management, `mcp-session-id` routing
- Supports TLS (custom certificates), Token auth, Parent Watchdog (self-destruct on parent exit)
- Suitable for remote access, browser extensions, multi-client sharing

### CLI Direct Operation Mode

```
Terminal user
    ↓ shell command
siyuan-sisyphus notebook list
    ↓ direct import
src/cli/dispatch.ts → TOOL_REGISTRY[notebook].callTool()
    ↓ runToolCall (reuses lifecycle)
SiYuanClient → SiYuan HTTP API
    ↓ render
Terminal output (human-readable / --json)
```

- Does not start any MCP server process
- Directly `import`s `TOOL_REGISTRY` and `runToolCall` from plugin source
- One call, one request, immediate exit
- Supports interactive paging (Enter/n/p/q in TTY)

---

## Key Facts at a Glance

1. **Aggregated tool surface**: 10 MCP tools (notebook / document / block / av / file / search / tag / system / flashcard / mascot), rather than 100+ single-purpose tools.
2. **Config hot-reload**: `server.ts` `getToolConfig()` has a 30-second TTL cache + in-flight deduplication. Changes from the settings panel take effect without restart.
3. **Dangerous action marking**: `DANGEROUS_ACTIONS` set marks 15 high-risk actions (delete / remove / find_replace, etc.). Warnings are auto-injected into tool descriptions and server instructions, but calls are not blocked (relies on LLM self-discipline).
4. **Analytics & Telemetry**: Every tool call records an analytics event (JSONL format, 2MB auto-rotation). Telemetry aggregates and reports periodically per config. In CLI mode, analytics is synchronously flushed before exit.
5. **Puppy mascot**: Communicates with the MCP server via polling `puppyEvents.json` files (decoupled). Supports idle animations, drag, wage card, test mode, and other state machines.

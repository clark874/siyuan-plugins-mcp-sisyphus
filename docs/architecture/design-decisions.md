# Design Decisions

This page documents major architectural decisions and the trade-offs behind them. Each decision includes **problem context**, **choice made**, **rejected alternatives**, and **current outcome**.

Use case: You are judging whether a change aligns with the current design direction, or need to understand why something was designed the way it is.

---

## 1. Aggregated Tool Design

### Problem Context

SiYuan provides approximately 459 HTTP API endpoints. Exposing one MCP tool per endpoint would create a surface of 100+ tools, leading to:
- **Exploding context cost**: Each MCP `list_tools` returning 100+ descriptors consumes massive system prompt tokens
- **Poor discoverability**: LLMs struggle to choose correctly from 100+ tools
- **Naming collisions**: Many similar names (`listNotebooks` / `listDocs` / `listBlocks`) cause confusion

### Choice Made

Aggregate related APIs by domain into **10 MCP tools**:

| MCP Tool | SiYuan Domain Covered | Action Count |
|----------|----------------------|-------------|
| `notebook` | Notebook CRUD | ~10 |
| `document` | Document tree operations | ~17 |
| `block` | Block-level operations | ~21 |
| `av` | Attribute View (database) | ~13 |
| `file` | Files & assets | ~11 |
| `search` | Search & query | ~11 |
| `tag` | Tag management | ~3 |
| `system` | System & UI | ~10 |
| `flashcard` | Flashcard review | ~8 |
| `mascot` | Mascot interaction | ~3 |

Each tool distinguishes specific operations via the `action` parameter, e.g.:
```
notebook(action="list")
notebook(action="create")
notebook(action="rename")
```

### Rejected Alternatives

- **Option A: One API, One Tool**: Each SiYuan API maps to one MCP tool. Rejected: context cost too high, LLM selection difficulty.
- **Option B: Hide action layer completely**: Only expose 10 tools, with actions as internal implementation details. Rejected: LLM needs to know available operations, and different actions have very different parameters that cannot be hidden under a unified schema.
- **Option C: Dynamically show by frequency**: Only show relevant tools based on context. Rejected: MCP protocol currently has no dynamic `list_tools` mechanism; would require complex server-side state machine.

### Current Outcome

- MCP tool surface reduced from 100+ to **10**
- `list_tools` response size reduced from ~50KB to ~**8KB**
- Significantly improved LLM tool discoverability
- Each action's parameters are strictly validated via Zod schema, reducing error rates

---

## 2. Progressive Disclosure

### Problem Context

Different users have different help information needs:
- **AI Agent (LLM)**: Needs concise tool descriptions with common actions and parameters
- **Human developers**: Need detailed API mappings, parameter shapes, example code
- **Terminal users (CLI)**: Need quick command examples

### Choice Made

Three-tier information exposure strategy:

```
Layer 1: Tool Description (MCP tool.description)
    → Contains only brief descriptions of the most common actions
    → Targets LLMs, controls token cost

Layer 2: Action Help (MCP Resource dynamic request)
    → siyuan://help/action/{tool}/{action}
    → Contains accepted shapes, required fields, examples
    → LLM fetches on demand

Layer 3: Complete Reference Docs (docs/ site)
    → One page per tool
    → Contains detailed descriptions, parameter tables, return values, CLI examples for all actions
    → Targets human developers
```

### Rejected Alternatives

- **Option A: Stuff all help into tool description**: Would make descriptions too long, consuming excessive LLM context.
- **Option B: Static docs only, no MCP Resource**: LLM cannot dynamically fetch specific action details.

### Current Outcome

- `tool.description` stays within 200~500 tokens
- LLM can fetch detailed help via `ReadResourceRequest` when uncertain
- Human users can consult the complete reference on the VitePress documentation site

---

## 3. Permission Model

### Problem Context

When external AI Agents connect to SiYuan, controllable data access boundaries are needed:
- Some notebooks may contain sensitive information
- AI should not be able to arbitrarily delete or modify important data
- Permission control needs moderate granularity (too fine is hard to manage, too coarse offers no protection)

### Choice Made

Adopt **notebook-level 4-tier permissions**:

| Level | Permission | Use Case |
|-------|-----------|----------|
| `none` | Completely blocked | Sensitive notebooks |
| `r` | Read-only | Reference notebooks |
| `rw` | Read-write (no delete) | Daily work notebooks |
| `rwd` | Full permission | Trusted areas |

**Implementation details**:
- Permission file stored at `/data/storage/petal/siyuan-plugins-mcp-sisyphus/notebookPermissions`
- Read/write via SiYuan API, never directly accessing local filesystem
- Unconfigured notebooks default to `r` (read-only) so missing permission entries do not grant write/delete access
- Permission checks are **explicitly called** by business handlers, not unified middleware (different actions have different needs)

### Rejected Alternatives

- **Option A: Document-level permissions**: Too fine-grained, high management cost, and SiYuan natively does not support document-level permissions.
- **Option B: Action-level permissions (each action individually toggleable)**: Already exists (ToolConfig's `actions`), but this is a feature toggle, not a security boundary. Security boundaries need to be on the data dimension (notebook).
- **Option C: Global read-only mode**: Too blunt, cannot satisfy the need for some notebooks writable and some not.

### Current Outcome

- Settings panel provides Notebook permission matrix UI
- Permission validation occurs before API calls, blocking unauthorized operations
- CLI mode defaults to full open if permission file cannot be read (CLI user typing command is considered confirmation)

---

## 4. Plugin & CLI Shared Core

### Problem Context

The project needs to support two usage patterns:
1. **Plugin mode**: AI clients communicate with the SiYuan plugin via MCP protocol
2. **CLI mode**: Users execute commands directly in the terminal

Independent implementations would cause code duplication, inconsistent behavior, and doubled maintenance cost.

### Choice Made

**CLI directly imports plugin source code**, sharing the following core modules:

```
Shared layers:
├── src/api/client.ts           SiYuanClient
├── src/core/tool-registry.ts    TOOL_REGISTRY
├── src/core/tool-lifecycle.ts   runToolCall (puppy/analytics/telemetry)
├── src/core/config.ts           buildDefaultToolConfig, ACTIONS_BY_CATEGORY
├── src/core/permissions.ts      PermissionManager
├── src/tools/*/index.ts          All tool implementations
└── src/shared/invocation-format.ts  Dual-mode presentation unification

Layers CLI does NOT use:
├── @modelcontextprotocol/sdk   Does not start MCP server
├── src/core/server.ts           Skips ListTools/CallTool handlers
├── src/core/http-transport.ts   Does not start HTTP server
├── src/core/resources.ts        Does not expose MCP Resources
├── src/core/server-instructions.ts  No instructions
└── src/index.ts                Skips plugin lifecycle
```

### Rejected Alternatives

- **Option A: CLI spawns child MCP server**: Attempted in early versions. Rejected: complex process management, slow startup, resource waste, difficult debugging.
- **Option B: CLI fully independent implementation**: Rejected: severe code duplication; tool logic changes would need to be synced in two places.

### Current Outcome

- CLI output `cli.cjs` is a self-contained bundle with no `node_modules` dependency
- Tool bug fixes only need to change one place (`src/tools/`), fixing both plugin and CLI simultaneously
- CLI behavior is 100% consistent with the plugin (except config source and tool toggle defaults)

---

## 5. Transport Layer Choice

### Problem Context

The MCP protocol supports multiple transport methods. The most suitable one needs to be chosen for each usage scenario.

### Choice Made

Support **stdio** (default) and **HTTP/S** transports:

| Transport | Implementation | Use Case |
|-----------|---------------|----------|
| stdio | `StdioServerTransport` | Local AI clients (Claude Desktop, Kimi CLI) |
| HTTP | `StreamableHTTP` (MCP 2025-03-26 spec) | Remote access, browsers, multi-client sharing |

**HTTP mode enhancements**:
- **Session management**: Supports multi-client concurrency, independent state per session
- **Bearer Token auth**: Prevents unauthorized access
- **TLS support**: Encrypted transport for production
- **Parent Watchdog**: Auto-cleanup when SiYuan main process exits

### Rejected Alternatives

- **Option A: stdio only**: Cannot satisfy remote access and browser scenarios.
- **Option B: Legacy HTTP/SSE transport**: MCP SDK 1.26 promotes StreamableHTTP; SSE mode is being deprecated.
- **Option C: WebSocket transport**: MCP protocol has not standardized WebSocket transport; poor compatibility.

### Current Outcome

- stdio mode works out of the box with zero configuration
- HTTP mode provides a complete configuration panel; users can customize host/port/token/TLS
- Both modes can be switched with one click in the settings panel

---

## 6. CLI Config Priority

### Problem Context

CLI needs to support multiple config sources with clear conflict resolution priority.

### Choice Made

```
Priority from high to low:
1. CLI flag        (--url / --token)
2. Environment variable (SIYUAN_API_URL / SIYUAN_TOKEN)
3. Config file     (active profile in ~/.siyuan-sisyphus/config.json)
4. Default         (http://127.0.0.1:6806)
```

**Multi-profile support**:
- `config.json` contains `profiles: Record<string, { apiUrl, token }>`
- `currentProfile` field indicates the default active profile
- `--profile <name>` can temporarily switch

### Rejected Alternatives

- **Option A: Config file only**: Inconvenient for scripting and CI/CD.
- **Option B: Environment variable highest priority**: Inconvenient for users to temporarily override (e.g. testing different endpoints).
- **Option C: No profile concept**: Poor experience when managing multiple environments (local/remote/work/personal).

### Current Outcome

- Scripting: `siyuan-sisyphus block list --url http://remote:6806 --token xxx`
- CI/CD integration: `SIYUAN_API_URL=... siyuan-sisyphus ...`
- Daily development: Configure once with `siyuan-sisyphus config set default --url http://127.0.0.1:6806`, then call directly

---

## 7. Build Design

### Problem Context

The project needs to produce three artifacts (plugin UI, MCP server, CLI) with different tech stacks (browser vs Node.js environment).

### Choice Made

**Vite multi-entry configuration**:

```
BUILD_TARGET=renderer  →  dist/index.js       (Browser environment, Svelte UI)
BUILD_TARGET=server    →  dist/mcp-server.cjs (Node.js environment, MCP Server)
BUILD_TARGET=cli       →  cli/dist/cli.cjs    (Node.js environment, Standalone CLI)
```

**Key build decisions**:

| Decision | Description |
|----------|-------------|
| Output format | All CommonJS (CJS), compatible with SiYuan plugin loading mechanism |
| inlineDynamicImports | Force inline dynamic imports, single-file output |
| server/cli external | Preserve Node built-in modules (fs/path/http etc.), do not bundle |
| renderer external | Only exclude `siyuan` (injected by SiYuan runtime) |
| CLI shebang | Inject `#!/usr/bin/env node` header, `chmod 755` |
| SDK lightweight | Custom rollup plugin replaces `validation/ajv-provider.js` and `experimental/tasks/*` with local noop implementations to reduce bundle size |

### Rejected Alternatives

- **Option A: Direct tsc compilation**: Cannot control bundle size, no tree-shaking or noop replacement.
- **Option B: Direct esbuild / rollup**: Vite already provides out-of-the-box TypeScript + Svelte support; no need to reconfigure.
- **Option C: Separate package.json and build flow per artifact**: Too high maintenance cost; Vite multi-entry is flexible enough.

### Current Outcome

- `pnpm dev` simultaneously watches renderer + server
- `pnpm build` produces `dist/index.js` + `dist/mcp-server.cjs` + `package.zip`
- `pnpm build:cli` produces `cli/dist/cli.cjs` (self-contained, zero dependencies)
- Artifact sizes: index.js ~30KB, mcp-server.cjs ~284KB, cli.cjs ~(self-contained)

---

## 8. Error Handling Strategy

### Problem Context

The system needs to handle errors from multiple sources: Zod validation, SiYuan API, network timeouts, insufficient permissions, config anomalies, etc. Different errors need to be presented differently to different consumers (LLM vs human terminal users).

### Choice Made

**Unified error formatting** (`tools/internal/shared.ts: createErrorResult`):

```
ZodError          → type: "validation_error",  message: "Invalid parameters: ..."
SiYuanError       → type: "api_error",         code: siYuanCode, message: siYuanMsg
Permission denied → type: "permission_denied", message: "Permission denied for notebook ..."
Disabled tool/action → type: "disabled_error", message: "Tool/Action is disabled"
Other Error       → type: "internal_error",    message: error.message
```

**Presentation layer unification** (`presentation/invocation-format.ts`):
- MCP mode: Error text maintains `tool(action="...")` style
- CLI mode: Error text automatically translates to `siyuan <tool> <action> --flag` style

### Rejected Alternatives

- **Option A: Throw raw Error directly to MCP SDK**: Would cause LLM to receive unfriendly stack traces.
- **Option B: Each error formats independently**: Hard to maintain, inconsistent style.

### Current Outcome

- LLM receives structured error information and can auto-correct parameters
- CLI users receive human-readable error hints with field-level validation details
- All error types have explicit `type` fields for client-side classification

---

## 9. Puppy Mascot Architecture

### Problem Context

A visual feedback mechanism is needed so users can perceive when the AI Agent is operating SiYuan, while adding a touch of fun.

### Choice Made

**Decoupled file polling architecture**:

```
MCP Server (tool-lifecycle.ts)          Puppy UI (ToolPuppy.svelte)
    │                                        │
    │  writePuppyEvent()                     │  createJsonFilePoller()
    │     ↓                                  │     ↓ every 500ms
    │  puppyEvents.json  ←───────────────────│  POST /api/file/getFile
    │                                        │     ↓
    │                                        │  Parse events → Drive state machine
```

**Key design**:
- Does not directly share JS objects/memory; communicates via filesystem for decoupling
- Puppy can run independently of the server (test mode)
- Position persisted via `localStorage`
- Animation state machine (idle/reading/writing/deleting/moving/dangerous/success/error)

### Rejected Alternatives

- **Option A: Directly share JS variables**: Too tightly coupled; Puppy component and server must be in the same process.
- **Option B: Use SiYuan broadcast/event bus**: Higher complexity, requires native SiYuan support.
- **Option C: WebSocket push**: Requires additional ports and connection management; over-engineered.

### Current Outcome

- Puppy animations are smooth, state transitions are timely (500ms polling interval)
- Test mode runs all animations without a backend
- Fun features like wage card, heart bursts, and feeding increase user engagement

---

## 10. Dangerous Action Confirmation Strategy

### Problem Context

Certain operations (delete/remove/find_replace etc.) are destructive and need to prevent accidental AI execution.

### Choice Made

**Prompt-level confirmation + marking system**:

1. **`DANGEROUS_ACTIONS` set**: Hard-coded in `config.ts` with 15 high-risk actions
2. **Auto-injected warnings**: `buildAggregatedTool()` automatically appends `"⚠️ Dangerous action: ... requires user confirmation"` to tool descriptions
3. **Server Instructions**: `server-instructions.ts` emphasizes high-risk operations requiring confirmation in MCP instructions
4. **No call blocking**: The system **does not** block dangerous actions at the code level (LLM may bypass), relying instead on LLM self-discipline + user supervision

### Rejected Alternatives

- **Option A: Code-level secondary confirmation popup**: Cannot implement popup confirmation in MCP protocol (server cannot proactively pop up); CLI mode already follows the convention "user typing command is confirmation".
- **Option B: Completely prohibit dangerous actions**: Too conservative; many legitimate automation scenarios need delete/remove.
- **Option C: Each dangerous action requires extra token/password**: Increases usage barrier, inconsistent with MCP protocol design philosophy.

### Current Outcome

- LLM typically requests user confirmation in conversation before calling dangerous actions
- Users can completely disable specific actions via ToolConfig
- Settings panel provides visual marking for "dangerous actions"

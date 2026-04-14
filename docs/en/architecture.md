# SiYuan MCP Sisyphus System Architecture

## Overview

SiYuan MCP Sisyphus is a Model Context Protocol (MCP) server plugin that connects SiYuan Note (a local-first knowledge base) to AI Agents. The project is built with Vite + Svelte + TypeScript.

### Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     AI Agent / MCP Client                        │
│         (Claude Desktop, Cursor, or other MCP clients)          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼ MCP Protocol (stdio / HTTP)
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Server (Sisyphus)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Config    │  │  Permission │  │      Tool Handlers      │  │
│  │   Manager   │  │   Manager   │  │  (10 aggregated tools)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼ SiYuan HTTP API
┌─────────────────────────────────────────────────────────────────┐
│                      SiYuan Note (Data Layer)                    │
│         (Notebooks, Documents, Blocks, Attributes)              │
└─────────────────────────────────────────────────────────────────┘
```

## Core Modules

### 1. Plugin Entry (`src/index.ts`)

The SiYuan plugin entry point responsible for:
- Plugin lifecycle management (`onload`, `onunload`)
- HTTP server launcher initialization
- UI component mounting (ToolPuppy widget)
- Settings persistence and management

```typescript
export default class SiyuanMCP extends Plugin {
    private httpLauncher: HttpServerLauncher | null = null;
    private puppyComponent: ToolPuppy | null = null;

    async onload() {
        // Load persisted settings
        // Initialize HTTP server launcher
        // Auto-start HTTP server if enabled
    }
}
```

### 2. MCP Server (`src/mcp/server.ts`)

The core MCP protocol implementation:
- Tool registration and discovery (`ListToolsRequestSchema`)
- Tool call dispatch (`CallToolRequestSchema`)
- Resource management for help documentation
- Server instructions generation
- Transport abstraction (stdio / HTTP)

Key responsibilities:
- Parses transport mode (stdio or HTTP) from environment variables
- Creates and configures the MCP server instance
- Routes tool calls to appropriate category handlers
- Tracks mascot state (puppy balance) for gamification

### 3. HTTP Transport (`src/mcp/http-transport.ts`)

HTTP streaming transport implementation:
- Session management with UUID-based session IDs
- Bearer token authentication
- Request/response handling via `StreamableHTTPServerTransport`
- Parent process watchdog for graceful shutdown
- Socket management and cleanup

```typescript
export async function startHttpMcpServer(opts: HttpServerOptions): Promise<HttpMcpServerHandle> {
    // Session management
    // Authentication check
    // Request dispatch to MCP server
}
```

### 4. Tools (`src/mcp/tools/*.ts`)

Ten aggregated tool implementations, each handling a specific domain:

| Tool | File | Description |
|------|------|-------------|
| notebook | `notebook.ts` | Notebook CRUD and configuration |
| document | `document.ts` | Document operations, tree navigation (18 actions) |
| block | `block.ts` | Block-level operations (22 actions) |
| av | `av.ts` | Attribute view (database) operations |
| file | `file.ts` | Asset upload, template rendering, export (12 actions) |
| search | `search.ts` | Full-text search, SQL queries, backlinks (11 actions) |
| tag | `tag.ts` | Tag management |
| system | `system.ts` | System info, notifications |
| flashcard | `flashcard.ts` | Spaced repetition flashcard operations |
| mascot | `mascot.ts` | Gamification balance and shop |

Each tool follows a consistent pattern:
- `list*Tools(config)` - Returns tool schemas based on configuration
- `call*Tool(client, args, config, permMgr)` - Executes the tool action

### 5. API Layer (`src/api/*.ts`)

SiYuan HTTP API client abstractions:
- `client.ts` - Core HTTP client with authentication
- `block.ts` - Block API wrappers
- `document.ts` - Document API wrappers
- `notebook.ts` - Notebook API wrappers
- `av.ts` - Attribute view API wrappers
- `search.ts` - Search API wrappers

### 6. Configuration (`src/mcp/config.ts`)

Tool configuration management:
- Tool category definitions (10 categories)
- Action enablement tracking
- Legacy configuration migration
- Default configuration generation
- Dangerous action classification

```typescript
export const TOOL_CATEGORIES = [
    'notebook', 'document', 'block', 'av', 'file',
    'search', 'tag', 'system', 'flashcard', 'mascot'
] as const;
```

### 7. Permissions (`src/mcp/permissions.ts`)

Notebook-level permission control:
- Four permission levels: `none`, `r` (read), `rw` (read-write), `rwd` (read-write-delete)
- Permission persistence via SiYuan API or filesystem
- Permission checking for read/write/delete operations

```typescript
export type NotebookPermission = 'none' | 'r' | 'rw' | 'rwd';

export class PermissionManager {
    canRead(notebookId: string): boolean;
    canWrite(notebookId: string): boolean;
    canDelete(notebookId: string): boolean;
}
```

## Data Flow

### Typical Tool Call Flow

```
1. AI Agent sends tool call request
   └─> { name: "block", arguments: { action: "append", ... } }

2. MCP Server receives and parses request
   └─> server.ts: CallToolRequestSchema handler

3. Category routing
   └─> Extract category from tool name
   └─> Check if tool is enabled in config

4. Permission check
   └─> PermissionManager checks notebook permissions
   └─> Returns error if permission denied

5. Action handler dispatch
   └─> callBlockTool() in block.ts
   └─> Parse and validate arguments with Zod schemas

6. SiYuan API call
   └─> blockApi.appendBlock() via SiYuanClient
   └─> HTTP POST to SiYuan's /api/block/appendBlock

7. Result processing
   └─> Normalize response
   └─> Apply UI refresh hints (for live updates)

8. Return to Agent
   └─> JSON-formatted result with content array
```

### Example: Creating a Document

```typescript
// Agent sends:
{
    "name": "document",
    "arguments": {
        "action": "create",
        "notebook": "20240318112233-abc123",
        "path": "/Inbox/Meeting Notes",
        "markdown": "# Team Meeting\n\nDate: 2026-04-12"
    }
}

// Server processes:
// 1. Route to document tool
// 2. Check 'write' permission for notebook
// 3. Call documentApi.createDoc()
// 4. Apply icon if specified
// 5. Return success with document ID
```

## Key Technical Decisions

### 1. Aggregated Tool Design

**Decision**: Group related operations into 10 aggregated tools (e.g., `block` tool with `insert`/`update`/`delete` actions) rather than exposing 100+ individual tools.

**Rationale**:
- **Context efficiency**: Reduces token usage in AI context windows
- **Discoverability**: LLMs can more easily understand available capabilities
- **Consistency**: Common patterns across all tools (action-based dispatch)
- **Progressive disclosure**: Basic actions exposed directly; advanced actions available via help

**Implementation**:
```typescript
// Instead of: insert_block, update_block, delete_block...
// We have: block tool with action parameter
{
    "name": "block",
    "arguments": {
        "action": "insert",  // or "update", "delete", etc.
        "dataType": "markdown",
        "data": "# Heading",
        "parentID": "202403..."
    }
}
```

### 2. Progressive Disclosure

**Decision**: Tools expose common actions in descriptions; detailed help available via:
- MCP resources: `siyuan://help/action/{tool}/{action}`
- Runtime help: call any tool with `action="help"`

**Benefits**:
- Keeps initial tool descriptions concise
- Provides comprehensive documentation when needed
- Allows dynamic help generation based on current configuration

### 3. Permission Model

**Decision**: Notebook-level permissions with four levels (`none`, `r`, `rw`, `rwd`).

**Design considerations**:
- **Granularity**: Notebook-level is the right balance (document-level would be too complex)
- **Explicit opt-in**: Default is `rwd` (full access), but users can restrict
- **Per-notebook**: Different notebooks can have different permission levels
- **Persistence**: Stored in SiYuan's data storage, synced across sessions

### 4. Path Semantics

**Decision**: Explicit distinction between human-readable paths and storage paths.

| Type | Example | Usage |
|------|---------|-------|
| Human-readable | `/Inbox/Weekly Note` | `document(action="create")` |
| Storage path | `/20240318112233-abc123.sy` | `document(action="rename")` |

**Why**: SiYuan's internal API uses different path types for different operations. Clear distinction prevents common errors.

### 5. UI Refresh Hints

**Decision**: Tool responses include UI refresh hints for live updates.

When a tool modifies data, it returns hints like:
```typescript
{ type: 'reloadProtyle', id: documentId }
{ type: 'reloadFiletree' }
```

These are consumed by the plugin's UI layer to refresh the SiYuan interface.

### 6. Transport Abstraction

**Decision**: Support both stdio and HTTP transports.

| Transport | Use Case |
|-----------|----------|
| stdio | Local AI clients (Claude Desktop, etc.) |
| HTTP | Remote connections, independent mode |

The transport is selected via environment variable `SIYUAN_MCP_TRANSPORT` or command-line flag `--http`.

## Module Dependencies

```
src/
├── index.ts
│   └── Uses: HttpServerLauncher, ToolPuppy, McpConfig
│
├── mcp/
│   ├── server.ts
│   │   └── Uses: createSiYuanServer, startHttpMcpServer, PermissionManager
│   │   └── Routes to: notebook, document, block, av, file, search, tag, system, flashcard, mascot tools
│   │
│   ├── http-transport.ts
│   │   └── Uses: createSiYuanServer, StreamableHTTPServerTransport
│   │
│   ├── config.ts
│   │   └── Defines: TOOL_CATEGORIES, default configs, action tiers
│   │
│   ├── permissions.ts
│   │   └── Uses: SiYuanClient (for persistence)
│   │
│   └── tools/
│       ├── shared.ts
│       │   └── Provides: buildAggregatedTool, result helpers, pagination
│       │
│       ├── context.ts
│       │   └── Provides: permission resolution, document context caching
│       │
│       ├── notebook.ts, document.ts, block.ts, av.ts, ...
│       │   └── Use: SiYuanClient, PermissionManager
│       │   └── Use: respective API modules
│       │
│       └── ui-refresh.ts
│           └── Provides: UI refresh hint application
│
├── api/
│   ├── client.ts
│   │   └── Core HTTP client with fetch
│   │
│   └── block.ts, document.ts, notebook.ts, ...
│       └── API endpoint wrappers
│
└── components/
    └── ToolPuppy.svelte, McpConfig.svelte
        └── UI components for settings and mascot
```

## Security Considerations

1. **Token-based authentication** for HTTP transport
2. **Notebook-level permissions** for data access control
3. **Dangerous action confirmation** required for destructive operations
4. **Large file upload confirmation** (configurable threshold, default 10MB)
5. **Localhost binding by default** for HTTP server

## Extension Points

To add a new tool category:

1. Add category to `TOOL_CATEGORIES` in `src/mcp/config.ts`
2. Define actions and schema in `src/mcp/tools/newtool.ts`
3. Add handler to `createSiYuanServer()` switch statement in `src/mcp/server.ts`
4. Add help documentation in `src/mcp/help.ts`

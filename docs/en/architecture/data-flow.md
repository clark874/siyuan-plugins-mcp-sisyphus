# Data Flow

This page describes the request path from MCP client to SiYuan.

When to read this page: you are debugging why a tool call succeeds, fails, or returns filtered data.

## Typical Flow

1. Client sends a tool call
2. `server.ts` parses tool name and action
3. Tool config decides whether the tool is enabled
4. Permission manager checks notebook access where applicable
5. Category tool handler validates and dispatches the action
6. `src/api/*` sends the SiYuan HTTP request
7. Lifecycle wrapper records analytics / telemetry / mascot state
8. Result returns to the client

## Important Side Paths

- Help resources are served through MCP resources, not regular tool calls
- CLI dispatch bypasses MCP transport but still reuses the same tool registry and lifecycle logic

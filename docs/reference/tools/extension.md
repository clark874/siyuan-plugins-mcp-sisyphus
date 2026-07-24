# `extension`

`extension` bridges tools registered by other SiYuan kernel plugins through the official MCP endpoint introduced in SiYuan 3.7.0.

## Discovery

```json
{
  "action": "list",
  "refresh": true
}
```

The response reports the official MCP connection state, discovered and exposed counts, schema size, read-only declarations, effect scopes, degraded schemas, and tools blocked in Sisyphus settings.

Only tools with `source="plugin"` are included. SiYuan native tools, tools imported from external MCP servers, and this plugin's own namespace are excluded.

## Calling a plugin tool

The official full name becomes the action. Downstream parameters always stay inside `arguments`:

```json
{
  "action": "plugin__example_plugin__search",
  "arguments": {
    "action": "query",
    "keyword": "MCP"
  }
}
```

The nested shape avoids collisions when the downstream plugin tool has its own `action` parameter. The CLI equivalent is:

```bash
siyuan extension plugin__example_plugin__search \
  --arguments-json '{"action":"query","keyword":"MCP"}'
```

## Safety and lifecycle

- Tools without `readOnlyHint=true` require explicit user confirmation.
- Plugin tool calls are sent once and are never retried. A transport failure after dispatch is reported as an unknown execution state.
- Discovery may reconnect and retry once because it is read-only.
- The last successful discovery cache remains available when a refresh fails.
- `tools/list` refreshes discovery; `extension(action="list", refresh=true)` refreshes explicitly and emits a tool-list-changed notification when the action set changes.
- The settings page provides a master switch and per-tool blocking.

Official discovery requires SiYuan 3.7.0 or newer, an administrator session, and a valid API token.

## Official MCP and Sisyphus

| Concern | Official SiYuan MCP | Sisyphus |
|---|---|---|
| Registration | Plugins register independent tools | Tools are grouped by category and action |
| Namespace | `plugin__<plugin>__<tool>` | The full official name becomes an `extension` action |
| Metadata | `source`, `readOnlyHint`, `effectScope` | Preserved in discovery, help, and safety descriptions |
| Change notification | Official registry declares `listChanged=false` | Refresh points compare caches and notify outer clients |
| CLI | Not provided by the official registry | Uses the same bridge through `siyuan extension ...` |
| Calls | Direct official `tools/call` | One-shot forwarding with no replay |

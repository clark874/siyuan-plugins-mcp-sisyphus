# `extension`

`extension` bridges tools exposed through the official MCP endpoint introduced in SiYuan 3.7.0.

## Discovery

```json
{
  "action": "list",
  "refresh": true
}
```

The response reports the official MCP connection state, plugin/native source counts, exposed count and schema size, read-only declarations, effect scopes, degraded schemas, and tools blocked in Sisyphus settings.

Tools with `source="plugin"` are included by default. Set `extension.includeNativeTools=true` in the plugin settings to include `source="native"` tools. Missing source metadata is treated as native for compatibility. Tools imported from external MCP servers (`source="mcp"`) and this plugin's own namespace remain excluded.

Native tools are disabled by default because they overlap with several Sisyphus action families and materially increase the `extension` schema.
An official tool named `help` or `list` is reported as a reserved-action conflict and is not exposed.

## Calling an official tool

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

With native tools enabled, their official unprefixed name is used directly:

```json
{
  "action": "document",
  "arguments": {
    "action": "read",
    "id": "20240318112233-abc123"
  }
}
```

```bash
siyuan extension document \
  --arguments-json '{"action":"read","id":"20240318112233-abc123"}'
```

## Safety and lifecycle

- Tools without `readOnlyHint=true` require explicit user confirmation.
- Official MCP tool calls are sent once and are never retried. A transport failure after dispatch is reported as an unknown execution state.
- Discovery may reconnect and retry once because it is read-only.
- The last successful discovery cache remains available when a refresh fails.
- `tools/list` refreshes discovery; `extension(action="list", refresh=true)` refreshes explicitly and emits a tool-list-changed notification when the action set changes.
- The settings page provides a master switch, a native-tool source switch, and per-tool blocking.

Official discovery requires SiYuan 3.7.0 or newer, an administrator session, and a valid API token.

> [!WARNING]
> Native-tool forwarding does not pass through Sisyphus notebook permissions, disabled actions, or dangerous-action confirmation. Calls execute directly with the current SiYuan administrator session or API Token. Native aggregate tools also do not currently expose inner action-level risk metadata through `tools/list`, so tool-level `readOnlyHint` cannot distinguish read-only actions from mutating actions. Treat every native forwarded call as potentially side-effecting, enable it only for local or fully trusted clients, and never expose it to untrusted remote clients.

## Official MCP and Sisyphus

| Concern | Official SiYuan MCP | Sisyphus |
|---|---|---|
| Registration | Native tools and plugins register independent tools | Tools are grouped by category and action |
| Namespace | Native names or `plugin__<plugin>__<tool>` | The official name becomes an `extension` action |
| Metadata | `source`, `readOnlyHint`, `effectScope` | Preserved in discovery, help, and safety descriptions |
| Change notification | Official registry declares `listChanged=false` | Refresh points compare caches and notify outer clients |
| CLI | Not provided by the official registry | Uses the same bridge through `siyuan extension ...` |
| Calls | Direct official `tools/call` | One-shot forwarding with no replay |

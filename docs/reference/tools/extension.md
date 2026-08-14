# `extension`

`extension` bridges tools exposed through the official MCP endpoint introduced in SiYuan 3.7.0.

## Discovery

```json
{
  "action": "list",
  "refresh": true
}
```

While `extension.includeNativeTools=false`, the response is intentionally compact: it reports only connection state, plugin/native source counts, exposed count, schema size, and `detailsIncluded=false`. It omits the complete `tools` array so disabled native-tool discovery does not consume agent context.

After native tools are enabled, `detailsIncluded=true` and the response also reports individual tool names, descriptions, read-only declarations, effect scopes, degraded schemas, and tools blocked in Sisyphus settings. General `extension` help follows the same rule; targeted `help(topic="<tool>")` can still inspect one explicitly requested tool.

Tools with `source="plugin"` are included by default. When `extension.includeNativeTools=true`, Sisyphus exposes only the fixed native allowlist `search`, `ref`, `outline`, `web_fetch`, and `web_search`. Native `document`, `block`, `file`, `database`, `system`, and every other broad or mutating tool remain blocked by policy even if a persisted block list is empty. Missing source metadata is treated as native for compatibility. Tools imported from external MCP servers (`source="mcp"`) and this plugin's own namespace remain excluded.

Fresh installations enable this narrow read-oriented bridge by default. It complements Sisyphus with official discovery and web retrieval without creating a second write path.
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
  "action": "search",
  "arguments": {
    "action": "semantic",
    "query": "knowledge graph"
  }
}
```

```bash
siyuan extension search \
  --arguments-json '{"action":"semantic","query":"knowledge graph"}'
```

## Safety and lifecycle

- Before connecting to `/mcp`, Sisyphus checks the SiYuan version through `/api/system/version`. Versions below 3.7.0 are marked unsupported without contacting the official endpoint.
- A connection is created only when `extension` is enabled, extension settings are inspected, or discovery is explicitly refreshed.
- Tools without `readOnlyHint=true` require explicit user confirmation.
- Official MCP tool calls are sent once and are never retried. A transport failure after dispatch is reported as an unknown execution state.
- Discovery may reconnect and retry once because it is read-only.
- Initial discovery runs in the background for the outer MCP Server, so the remaining tool list is not blocked. Successful results are cached and emit a tool-list-changed notification.
- Later outer `tools/list` calls reuse the cache instead of contacting `/mcp`; `extension(action="list", refresh=true)` refreshes explicitly.
- If `/mcp` is unavailable or an explicit refresh fails, only dynamic extension actions are hidden. Other Sisyphus tools and the outer MCP Server remain available.
- The settings page provides a master switch, a native-tool source switch, and per-tool blocking.

Official discovery requires SiYuan 3.7.0 or newer, an administrator session, and a valid API token. This requirement applies only to `extension`; the Sisyphus plugin itself keeps `minAppVersion` at 2.9.0.

> [!WARNING]
> Native-tool forwarding does not pass through Sisyphus notebook permissions. The fixed allowlist therefore contains only the five read-oriented tools above; all note, block, database, file, configuration, history, repository, import/export, and other write-capable or broad-control native tools are denied before schema exposure and calls. Web search/fetch still send the requested query or URL to external services, so use this bridge only with trusted local clients.

## Official MCP and Sisyphus

Sisyphus-owned `fs`, timeline, permission management, CLI, document tools, and other aggregate capabilities always use `/api/*`. Official `/mcp` is an isolated side path owned by `extension`, not an implementation dependency of built-in capabilities.

External clients should register only the Sisyphus endpoint at `http://127.0.0.1:36806/mcp`. The official `http://127.0.0.1:6806/mcp` ships with SiYuan and is only the internal extension bus described here. Registering both produces duplicate tools and lets native official tools bypass Sisyphus permission boundaries.

| Concern | Official SiYuan MCP | Sisyphus |
|---|---|---|
| Registration | Native tools and plugins register independent tools | Tools are grouped by category and action |
| Namespace | Native names or `plugin__<plugin>__<tool>` | The official name becomes an `extension` action |
| Metadata | `source`, `readOnlyHint`, `effectScope` | Preserved in discovery, help, and safety descriptions |
| Change notification | Official registry declares `listChanged=false` | Refresh points compare caches and notify outer clients |
| CLI | Not provided by the official registry | Uses the same bridge through `siyuan extension ...` |
| Calls | Direct official `tools/call` | One-shot forwarding with no replay |

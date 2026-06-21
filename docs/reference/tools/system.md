# system

This tool covers SiYuan system reads, network status, configuration reads, and user notifications.

When to read this page: you need runtime status rather than notebook or document content.

Related pages:

- [Permissions](../permissions.md)

## Actions

| Group | Actions |
|------|---------|
| Basic info | `get_version`, `get_current_time`, `changelog` |
| Config / environment | `conf`, `network`, `workspace_info` |
| Notifications | `notify` |

## Safety Rules

- `workspace_info` is high-risk because it exposes the absolute workspace path and requires confirmation.
- `conf` is read-only. Use `mode="summary"` for a compact overview, or `mode="get"` with `keyPath` for a specific field.
- `changelog` is read-only. Use `fromVersion` after plugin upgrades to find changes that may affect user rules, `/AGENTS.md` memory, permissions, appearance, connection snippets, timeline settings, or tool configuration.
- `notify` shows a SiYuan notification with `msg`, `level`, and optional `timeout`.

## Action List

- `workspace_info`
- `network`
- `conf`
- `notify`
- `changelog`
- `get_version`
- `get_current_time`

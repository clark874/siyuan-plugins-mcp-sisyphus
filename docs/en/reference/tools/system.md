# system

This tool covers system info, config inspection, notifications, and environment introspection.

When to read this page: you need version info, current time, config snippets, or client-visible notifications.

Related pages:

- [Permissions](../permissions.md)
- [Troubleshooting](../../getting-started/troubleshooting.md)

## Actions

| Group | Actions |
|------|---------|
| Notifications | `push_msg`, `push_err_msg` |
| Basic info | `get_version`, `get_current_time`, `boot_progress` |
| Environment | `workspace_info`, `network`, `changelog` |
| Config reads | `conf`, `sys_fonts` |

## Safety Rules

- `workspace_info` is high-risk because it exposes the absolute workspace path

## Notes

- `conf` supports summary-first inspection and subtree reads via `keyPath`
- `sys_fonts` supports summary and paginated listing

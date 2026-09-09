# system

The maintained system tool has six actions:

| Action | Purpose |
| --- | --- |
| `changelog` | Read one release entry or changes since a version. |
| `get_version` | Read the SiYuan kernel version. |
| `get_current_time` | Read kernel time. |
| `bootstrap` | Refresh permissions and return the effective capability surface. |
| `audit_environment` | Return shallow configuration keys and package counts without changing state. |
| `validate_source_audit` | Validate a frozen external source-audit handoff. |

Package management, Bazaar browsing, plugin storage access, notifications, sync, workspace-path disclosure, and plan/apply/rollback control-plane actions are outside this MCP surface.

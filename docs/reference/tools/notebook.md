# notebook

This tool covers notebook CRUD, notebook configuration, and notebook-level permissions.

When to read this page: you need to list notebooks, manage notebook settings, or set notebook permission levels.

Related pages:

- [Permissions](../permissions.md)
- [Common Tasks](../common-tasks.md)

## Common Actions

| Action | Required Fields | Permission | Notes |
|--------|-----------------|------------|------|
| `list` | none | none | List all notebooks |
| `create` | `name` | none | Optional `icon` |
| `set_open_state` | `notebook`, `opened` | read | Open or close notebook |
| `remove` | `notebook` | delete | Confirmation required |
| `rename` | `notebook`, `name` | write | Rename notebook |
| `get_conf` | `notebook` | read | Read notebook config |
| `set_conf` | `notebook`, `conf` | write | Update config object |
| `set_icon` | `notebook`, `icon` | write | Prefer Unicode hex icon |
| `get_permissions` | none or `notebook` | none | Inspect permissions |
| `set_permission` | `notebook`, `permission` | none | Confirmation required |
| `get_child_docs` | `notebook` | read | Root child docs |

## Safety Rules

- `remove` requires explicit confirmation
- `set_permission` changes future access behavior and should also be confirmed

## Examples

MCP:

```json
{ "action": "list" }
```

```json
{ "action": "set_permission", "notebook": "<id>", "permission": "rw" }
```

CLI:

```bash
siyuan notebook list
siyuan notebook set-permission --notebook <id> --permission rw
```

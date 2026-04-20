# Error Types

This page lists common high-level error categories returned by the MCP server.

When to read this page: a call failed and you need to classify whether the problem is in parameters, permissions, or runtime behavior.

Related pages:

- [Permissions](./permissions.md)
- [Troubleshooting](../getting-started/troubleshooting.md)

| Error Type | Meaning |
|------------|---------|
| `validation_error` | Invalid parameters or missing required fields |
| `permission_denied` | Notebook permission does not allow the operation |
| `api_error` | SiYuan API returned an error |
| `internal_error` | MCP server internal failure |
| `action_disabled` | Tool or action is disabled in config |

## Triage Order

1. Check required fields and path type
2. Check notebook permission
3. Check SiYuan connectivity and token configuration
4. Check whether the action is disabled or gated

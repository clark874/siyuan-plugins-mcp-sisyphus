# Error Types

This page lists common high-level error categories returned by the MCP server.

When to read this page: a call failed and you need to classify whether the problem is in parameters, permissions, or runtime behavior.

Related pages:

- [Permissions](./permissions.md)
- [Troubleshooting](../getting-started/troubleshooting.md)

| Error Type | Meaning |
|------------|---------|
| `validation_error` | Invalid parameters or missing required fields |
| `invalid_arguments` | A valid action received an incompatible ID, path, or field combination |
| `invalid_path` | A workspace or storage path cannot be resolved safely |
| `not_found` | A block, document, notebook, or attribute view does not exist; inspect `error.code` for the resource kind |
| `permission_denied` | Notebook permission does not allow the operation |
| `api_error` | SiYuan API returned an error |
| `internal_error` | MCP server internal failure |
| `action_disabled` | Tool or action is disabled in config |

Strict-write rejections also include a stable `error.code`. Before execution,
agent-correctable codes such as `precondition_required`, `invalid_request_id`,
`request_id_expired`, and `preflight_lease_invalid` use
`type: validation_error`. Write races and uncertain outcomes use hard types such
as `state_changed`, `readback_mismatch`, or `outcome_unknown` and are never
softened.

## Triage Order

1. Check required fields, IDs, and path type
2. For `not_found`, use the detailed `error.code` and hint to resolve the resource again
3. Check notebook permission
4. Check SiYuan connectivity and token configuration
5. Check whether the action is disabled or gated

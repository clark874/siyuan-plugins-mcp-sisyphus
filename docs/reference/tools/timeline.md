# timeline

Use `timeline` to list or create named snapshot nodes and compare one document with a tagged or recent native history checkpoint.

| Action | Required fields | Notes |
| --- | --- | --- |
| `list_nodes` | `scope` | `document` and `all` also require `documentId`. |
| `create_node` | `name`, `scope` | Document scope also requires `documentId`. |
| `compare_node` | `documentId`, `tag` | Returns paginated block changes. |
| `compare_recent` | `documentId` | Reads the newest different native history checkpoint. |

`timeline_app` opens one inline App with model-hidden list, create, and compare actions. Deletion and document/block rollback are intentionally absent from the MCP, CLI, and MCP App surfaces. Legacy recovery remains a separate local plugin-interface concern.

# timeline

Use `timeline` to manage named document/global snapshot nodes, inspect block-level document differences, and selectively restore historical content.

For the complete agent workflow and safety checklist, load the official `siyuan://skills/siyuan-mcp-timeline` skill or invoke the `siyuan_timeline` MCP prompt. See also [Common Tasks](../common-tasks.md#compare-and-restore-a-document-timeline).

## Actions

| Action | Required fields | Notes |
|--------|-----------------|-------|
| `list_nodes` | `scope` | `document` and `all` also require `documentId`; paginated, newest first |
| `create_node` | `name`, `scope` | `document` also requires `documentId`; returns the stable `tag` |
| `compare_node` | `documentId`, `tag` | Creates an untagged current-state snapshot and returns paginated block changes |
| `delete_node` | `tag` | Document tags also require `documentId`; dangerous and disabled by default |
| `rollback_document` | `documentId`, `tag` | Restores one document file, not the whole repository; dangerous and disabled by default |
| `rollback_block` | `documentId`, `tag`, `changeKey` | Recalculates the diff and restores one still-matching block change; dangerous and disabled by default |

## Workflow

```text
timeline(action="list_nodes", scope="all", documentId="<doc-id>")
timeline(action="create_node", name="Before revision", scope="document", documentId="<doc-id>")
timeline(action="compare_node", documentId="<doc-id>", tag="<tag>", page=1, pageSize=20)
timeline(action="rollback_block", documentId="<doc-id>", tag="<tag>", changeKey="<change-key>")
```

`compare_node` returns changed blocks by default. Set `includeUnchanged=true` when unchanged context is needed. Each change includes historical/current Markdown, an opaque `changeKey`, and whether block rollback is supported.

## Safety and permissions

- Listing and comparing document nodes require notebook read permission.
- Creating a document node requires write permission.
- Deleting a document node and every rollback action require `rwd`.
- Global nodes expose snapshot metadata only and are not attached to a notebook permission.
- `delete_node` removes the protective tag and document index entry only. The underlying repository snapshot remains available.
- Explicit user confirmation is required before `delete_node`, `rollback_document`, or `rollback_block`. CLI invocation is treated as confirmation.
- Legacy node association and migration remain available only in the plugin timeline UI.

## CLI examples

```bash
siyuan-sisyphus timeline create-node --name "Before rewrite" --scope document --document-id <doc-id> --json
siyuan-sisyphus timeline compare-node --document-id <doc-id> --tag <tag> --page-size 20 --json
```

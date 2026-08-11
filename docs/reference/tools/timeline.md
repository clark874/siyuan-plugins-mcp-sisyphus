# timeline

Use `timeline` to manage named document/global snapshot nodes, inspect block-level document differences, and selectively restore historical content.

For the complete agent workflow and safety checklist, load the official `siyuan://skills/siyuan-mcp-timeline` skill or invoke the `siyuan_timeline` MCP prompt. See also [Common Tasks](../common-tasks.md#compare-and-restore-a-document-timeline).

## Actions

| Action | Required fields | Notes |
|--------|-----------------|-------|
| `list_nodes` | `scope` | `document` and `all` also require `documentId`; paginated, newest first |
| `create_node` | `name`, `scope` | `document` also requires `documentId`; returns the stable `tag` |
| `compare_node` | `documentId`, `tag` | Creates an untagged current-state snapshot and returns paginated block changes |
| `compare_recent` | `documentId` | Read-only scan of five recent native document-history candidates; returns the newest different block diff with heading breadcrumbs |
| `delete_node` | `tag` | Document tags also require `documentId`; dangerous and disabled by default |
| `rollback_document` | `documentId`, `tag` | Restores one document file, not the whole repository; dangerous and disabled by default |
| `rollback_block` | `documentId`, `tag`, `changeKey` | Recalculates the diff and restores one still-matching block change; dangerous and disabled by default |

## Workflow

```text
timeline(action="list_nodes", scope="all", documentId="<doc-id>")
timeline(action="create_node", name="Before revision", scope="document", documentId="<doc-id>")
timeline(action="compare_node", documentId="<doc-id>", tag="<tag>", page=1, pageSize=20)
timeline(action="compare_recent", documentId="<doc-id>", page=1, pageSize=20)
timeline(action="rollback_block", documentId="<doc-id>", tag="<tag>", changeKey="<change-key>")
```

`compare_node` returns changed blocks by default. Set `includeUnchanged=true` when unchanged context is needed. Each change includes historical/current Markdown, an opaque `changeKey`, and whether block rollback is supported.

`compare_recent` creates no workspace snapshot, returns no history file path, and exposes no rollback. It selects the newest native SiYuan document-history checkpoint whose parsed block content differs from the current document, then returns baseline time, line statistics, change status, heading breadcrumbs, and before/current Markdown. Native document history is checkpoint-based, not a keystroke log.

## MCP App

MCP Apps clients open exactly one inline timeline through the dedicated `timeline_app` Tool; ordinary `timeline` queries no longer render Apps. Pass `documentId` for a document timeline and optionally `tag` to open a specific diff directly.

The separate MCP Apps settings page controls the Timeline App and all six human operations. Listing, comparing, creating, deleting, and rollback clicks use the model-hidden `timeline_app_action` Tool, so AI rollback can remain disabled while a user performs rollback inside the App. Notebook permission checks and high-risk elicitation/MRTR confirmation still apply.

On the Diff screen, the first document or block rollback click opens a non-layout confirmation overlay. The control stays under the pointer for the second click; the overlay does not intercept pointer events and remains available to assistive technology as a live status message.

## Safety and permissions

- Listing and comparing document nodes, including `compare_recent`, require notebook read permission.
- Creating a document node requires write permission.
- Deleting a document node and every rollback action require `rwd`.
- Global nodes expose snapshot metadata only and are not attached to a notebook permission.
- `delete_node` removes the protective tag and document index entry only. The underlying repository snapshot remains available.
- Explicit user confirmation is required before `delete_node`, `rollback_document`, or `rollback_block`. CLI invocation is treated as confirmation.
- AI permissions retain their existing defaults. The Timeline App and all six App actions are enabled by default and can be disabled independently.
- Legacy node association and migration remain available only in the plugin timeline UI.

## CLI examples

```bash
siyuan-sisyphus timeline create-node --name "Before rewrite" --scope document --document-id <doc-id> --json
siyuan-sisyphus timeline compare-node --document-id <doc-id> --tag <tag> --page-size 20 --json
siyuan-sisyphus timeline compare-recent --document-id <doc-id> --page-size 20 --json
```

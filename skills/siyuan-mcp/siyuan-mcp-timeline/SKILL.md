---
name: siyuan-mcp-timeline
description: MCP playbook for SiYuan document timelines. Use to list or create named snapshot nodes and compare document versions.
compatibility: "Requires a reachable SiYuan Sisyphus MCP server already registered in the client; installing this Skill alone does not configure the MCP endpoint or bearer token."
---

# Manage SiYuan Document Timelines with MCP

Resolve and read the document first. Use document-scoped nodes for one document and global nodes only when the same named snapshot should be discoverable across documents.

## Create and compare nodes

List existing nodes before creating a new one:

```text
timeline(action="list_nodes", scope="document", documentId="<doc-id>", page=1, pageSize=50)
```
```text
timeline(action="create_node", name="Before revision", scope="document", documentId="<doc-id>")
```

Keep the returned `tag` as the stable identifier. After content changes, compare the same document with that tag:

```text
timeline(action="compare_node", documentId="<doc-id>", tag="<timeline-tag>", page=1, pageSize=20, includeUnchanged=false)
```

`compare_node` creates an untagged current-state workspace snapshot before calculating the document diff. Paginate changed blocks with `page` and `pageSize`; request unchanged blocks only when they are required for context.

For a read-only answer to “what changed recently?”, use:

```text
timeline(action="compare_recent", documentId="<doc-id>", page=1, pageSize=20)
```

`compare_recent` creates no workspace snapshot and exposes no rollback. It scans at most five native SiYuan document-history checkpoints, selects the newest one whose parsed block content differs from the current document, and returns section breadcrumbs plus paginated before/current Markdown. Native document history is checkpoint-based rather than a keystroke log. Deletion and rollback are intentionally outside the MCP and CLI action surface.

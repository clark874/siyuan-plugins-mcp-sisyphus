---
name: siyuan-sisyphus-timeline
description: CLI-only playbook for SiYuan document timelines with siyuan-sisyphus. Use to list or create named snapshot nodes and compare document versions.
compatibility: "Requires the maintained siyuan-sisyphus CLI to be installed and configured for the target SiYuan workspace."
---

# Manage SiYuan Document Timelines with the CLI

## Resolve the CLI entry first

Before the first SiYuan CLI call in every new session, verify that the local command is available:

```bash
command -v siyuan-sisyphus
siyuan-sisyphus --version
```

If the command is missing, resolve a locally installed or user-provided maintained CLI entry before continuing. Do not use `npx` as an implicit fallback. A public npm package may lag the locally maintained plugin and silently omit custom actions or safety contracts.

After resolving the entry, start with the read-only live bootstrap:

```bash
siyuan-sisyphus system bootstrap --json
```

Resolve and read the document first. Use document-scoped nodes for one document and global nodes only when the same named snapshot should be discoverable across documents.

## Create and compare nodes

List existing nodes before creating a new one:

```bash
siyuan-sisyphus timeline list-nodes --scope 'document' --document-id '<doc-id>' --page '1' --page-size '50' --json
```
```bash
siyuan-sisyphus timeline create-node --name 'Before revision' --scope 'document' --document-id '<doc-id>' --json
```

Keep the returned `tag` as the stable identifier. After content changes, compare the same document with that tag:

```bash
siyuan-sisyphus timeline compare-node --document-id '<doc-id>' --tag '<timeline-tag>' --page '1' --page-size '20' --no-include-unchanged --json
```

`compare_node` creates an untagged current-state workspace snapshot before calculating the document diff. Paginate changed blocks with `page` and `pageSize`; request unchanged blocks only when they are required for context.

For a read-only answer to “what changed recently?”, use:

```bash
siyuan-sisyphus timeline compare-recent --document-id '<doc-id>' --page '1' --page-size '20' --json
```

`compare_recent` creates no workspace snapshot and exposes no rollback. It scans at most five native SiYuan document-history checkpoints, selects the newest one whose parsed block content differs from the current document, and returns section breadcrumbs plus paginated before/current Markdown. Native document history is checkpoint-based rather than a keystroke log. Deletion and rollback are intentionally outside the MCP and CLI action surface.

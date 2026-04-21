# Common Tasks

This page maps common goals to MCP payloads and CLI commands.

When to read this page: you know the task but not the tool name yet.

Related pages:

- [Reference Home](./index.md)
- [Tools Index](./tools/index.md)

## List notebooks

```json
{ "action": "list" }
```

```bash
siyuan notebook list
```

## Create a document

```json
{
  "action": "create",
  "notebook": "<notebook-id>",
  "path": "/Inbox/Note",
  "markdown": "# Hello"
}
```

```bash
siyuan document create --notebook <notebook-id> --path "/Inbox/Note" --markdown "# Hello"
```

## Append a block

```json
{
  "action": "append",
  "parentID": "<doc-or-block-id>",
  "dataType": "markdown",
  "data": "New paragraph"
}
```

```bash
siyuan block append --parent-id <doc-or-block-id> --data-type markdown --data "New paragraph"
```

## Search content

```json
{
  "action": "fulltext",
  "query": "TODO"
}
```

```bash
siyuan search fulltext --query "TODO"
```

## Read an attribute view

```json
{
  "action": "get",
  "id": "<attribute-view-id>"
}
```

```bash
siyuan av get --id <attribute-view-id>
```

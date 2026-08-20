---
name: siyuan-mcp-database
description: MCP playbook for SiYuan attribute views. Use to inspect AV metadata, render views, add columns or rows, and update cells while keeping AV, view, row, column, and block IDs distinct. Do not use for read-only SQL analytics; use search-query instead.
compatibility: "Requires a reachable SiYuan Sisyphus MCP server already registered in the client; installing this Skill alone does not configure the MCP endpoint or bearer token."
---

# Operate SiYuan Databases with MCP

Never guess attribute-view identifiers. Inspect the AV and its views before changing rows or cells.

```text
av(action="get", id="<av-id>")
```
```text
av(action="render", id="<av-id>", page=1, pageSize=10, ignoreRows=true)
```
```text
av(action="get_primary_key_values", avID="<av-id>", keyword="<row keyword>", page=1, pageSize=10)
```
```text
av(action="render", id="<av-id>", page=1, pageSize=10, query="<row keyword>")
```
```text
av(action="search", keyword="project")
```

数据库读取固定采用三步法：先以 `ignoreRows=true` 查看视图和列，再以 `query` 或 `get_primary_key_values` 定位行，最后用小页渲染读取所需值。除非明确诊断内核原始字段，不得设置 `verbose=true`，也不得无过滤全量渲染。

Keep these identifiers distinct: AV ID identifies the database; view ID identifies a table/board view; row ID identifies a key value; column ID identifies a key; block ID identifies note content.

## Mutations

```text
av(action="add_column", avID="<av-id>", keyName="Status", keyType="select")
```
```text
av(action="add_rows", avID="<av-id>", viewID="<view-id>", blockIDs=["<block-id>"])
```
```text
av(action="set_cells", avID="<av-id>", cells=[{"rowID":"<row-id>","columnID":"<column-id>","valueType":"text","text":"Done"}])
```

Before writing cells, render the current view and map column names to column IDs. Preserve the declared value type; do not put a date-shaped string into a number/date/select column without using the action’s expected value shape. Re-render after mutation. Read `siyuan://help/action/av/set_cells` for the current cell schema.

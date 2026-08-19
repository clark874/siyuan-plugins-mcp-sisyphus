---
name: siyuan-sisyphus-database
description: CLI-only playbook for SiYuan attribute views with siyuan-sisyphus. Use to inspect database metadata, render views, add columns or rows, update cells, and keep AV, view, row, column, and block IDs distinct.
---

# Operate SiYuan Databases with the CLI

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

Never guess attribute-view identifiers. Inspect the AV and its views before changing rows or cells.

```bash
siyuan-sisyphus av get --id '<av-id>' --json
```
```bash
siyuan-sisyphus av render --id '<av-id>' --page '1' --page-size '50' --json
```
```bash
siyuan-sisyphus av search --keyword 'project' --json
```

Keep these identifiers distinct: AV ID identifies the database; view ID identifies a table/board view; row ID identifies a key value; column ID identifies a key; block ID identifies note content.

## Mutations

```bash
siyuan-sisyphus av add-column --av-id '<av-id>' --key-name 'Status' --key-type 'select' --json
```
```bash
siyuan-sisyphus av add-rows --av-id '<av-id>' --view-id '<view-id>' --block-ids-json '["<block-id>"]' --json
```
```bash
siyuan-sisyphus av set-cells --av-id '<av-id>' --cells-json '[{"rowID":"<row-id>","columnID":"<column-id>","valueType":"text","text":"Done"}]' --json
```

Before writing cells, render the current view and map column names to column IDs. Preserve the declared value type; do not put a date-shaped string into a number/date/select column without using the action’s expected value shape. Re-render after mutation. Read `siyuan-sisyphus help av set-cells` for the current cell schema.

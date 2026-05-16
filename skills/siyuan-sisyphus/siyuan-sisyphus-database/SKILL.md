---
name: siyuan-sisyphus-database
description: CLI-only playbook for SiYuan attribute views with `siyuan-sisyphus`. Use for rendering databases, creating attribute views, adding columns and rows, setting cells with JSON flags, reading primary keys, and handling AV ID versus row ID distinctions.
---

# SiYuan Sisyphus CLI - Databases

SiYuan attribute views are real database blocks, not Markdown tables. Use the `av` tool for database operations and `block` only for placement or surrounding document content.

## Discover Databases

```bash
siyuan-sisyphus av search --keyword "project" --json
siyuan-sisyphus av get --id "<av-id>" --json
siyuan-sisyphus av render --id "<av-id>" --page 1 --page-size 50 --json
siyuan-sisyphus av get-primary-key-values --av-id "<av-id>" --json
```

`av get` uses `--id`. Many write operations use `--av-id`.

## Create a Database

Create or materialize an attribute view in a document:

```bash
siyuan-sisyphus av render --block-id "<doc-id>" --create-if-not-exist --json
```

If an ID is omitted with `--create-if-not-exist`, the tool can generate the database ID and insert the database block into the target document.

## Add Columns

```bash
siyuan-sisyphus av add-column --av-id "<av-id>" --key-name "Status" --key-type select
siyuan-sisyphus av add-column --av-id "<av-id>" --key-name "Due Date" --key-type date
siyuan-sisyphus av add-column --av-id "<av-id>" --key-name "Priority" --key-type number
```

Supported column types include `text`, `number`, `date`, `select`, `mSelect`, `url`, `email`, `phone`, `mAsset`, `template`, `created`, `updated`, `checkbox`, `relation`, `rollup`, and `lineNumber`.

## Add Rows

Bind existing blocks as rows:

```bash
siyuan-sisyphus av add-rows --av-id "<av-id>" --block-ids "<block-id-1>,<block-id-2>" --json
```

Create detached rows with primary key text:

```bash
siyuan-sisyphus av add-rows --av-id "<av-id>" --primary-key-texts-json '["Task 1","Task 2"]' --json
```

After adding rows, keep the returned row IDs for cell updates.

## Set Cells

Single cell:

```bash
siyuan-sisyphus av set-cells --av-id "<av-id>" --row-id "<row-id>" --column-id "<column-id>" --value-type text --text "Done"
siyuan-sisyphus av set-cells --av-id "<av-id>" --row-id "<row-id>" --column-id "<column-id>" --value-type checkbox --checked
siyuan-sisyphus av set-cells --av-id "<av-id>" --row-id "<row-id>" --column-id "<column-id>" --value-type date --date "2026-05-15T00:00:00+08:00"
```

Batch update:

```bash
siyuan-sisyphus av set-cells --av-id "<av-id>" --cells-json '[{"rowID":"<row-id-1>","columnID":"<status-col>","valueType":"select","option":"Done"},{"rowID":"<row-id-1>","columnID":"<due-col>","valueType":"date","date":"2026-05-15T00:00:00+08:00"},{"rowID":"<row-id-2>","columnID":"<done-col>","valueType":"checkbox","checked":true}]'
```

Value type fields:

| `--value-type` | Required value field |
| --- | --- |
| `text` | `--text` |
| `number` | `--number` |
| `date` | `--date` |
| `checkbox` | `--checked` or `--no-checked` |
| `select` | `--option` |
| `multi_select` | `--options-json '["A","B"]'` |
| `url` | `--url` |
| `email` | `--email` |
| `phone` | `--phone` |
| `mAsset` | `--assets-json '[{"content":"assets/file.png","type":"image"}]'` |
| `relation` | `--relation-block-ids-json '["<block-id>"]'` |

## Remove or Duplicate

Removing rows or columns changes database structure or content. Confirm the exact target first.

```bash
siyuan-sisyphus av remove-rows --av-id "<av-id>" --src-ids-json '["<row-or-bound-block-id>"]'
siyuan-sisyphus av remove-column --av-id "<av-id>" --column-id "<column-id>"
siyuan-sisyphus av duplicate --av-id "<av-id>" --block-id "<database-block-id>" --json
```

## Critical ID Rules

- AV ID identifies the database definition.
- Database block ID identifies a block that displays the database.
- Source block ID is the original block bound as a row.
- Row ID is the row item ID returned by `add-rows` or render/get output.
- Cell value ID is not the row ID.
- `set-cells` requires `--column-id`, even if metadata names it as a key.

When unsure, run:

```bash
siyuan-sisyphus av get --id "<av-id>" --json
siyuan-sisyphus av render --id "<av-id>" --block-id "<database-block-id>" --json
```

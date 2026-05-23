---
name: siyuan-sisyphus
description: CLI-only top-level skill for SiYuan Sisyphus. Use when an agent needs to operate SiYuan Note through the packaged `siyuan-sisyphus` command, install/read bundled skills, choose scenario sub-skills, understand command shape, flags, profiles, JSON output, pagination, and safe shell workflows.
---

# SiYuan Sisyphus CLI

Use the `siyuan-sisyphus` command for all SiYuan work. Do not use the shorter `siyuan` alias in examples or automation; the full command is clearer for agents and logs.

## Bootstrap

Before doing SiYuan work in a new agent environment:

```bash
siyuan-sisyphus skill install
siyuan-sisyphus system get-version
siyuan-sisyphus list
```

If credentials are not configured, initialize or select a profile:

```bash
siyuan-sisyphus init
siyuan-sisyphus config list
siyuan-sisyphus config set work --url http://127.0.0.1:6806 --token "<token>"
siyuan-sisyphus config use work
siyuan-sisyphus --profile work system get-version
```

Configuration precedence is:

1. `--url`, `--token`, and `--profile`
2. `SIYUAN_API_URL` and `SIYUAN_TOKEN`
3. Active profile in `~/.siyuan-sisyphus/config.json`
4. Defaults, usually `http://127.0.0.1:6806`

## Command Shape

General form:

```bash
siyuan-sisyphus <tool> <action> [--flag value ...]
```

Examples:

```bash
siyuan-sisyphus notebook list
siyuan-sisyphus fs tree --path "/Notebook" --max-depth 3
siyuan-sisyphus fs read --path "/Notebook/Folder/Doc" --page-size 8000
siyuan-sisyphus block append --parent-id "<doc-id>" --data-type markdown --data "## Notes"
siyuan-sisyphus search fulltext --query "keyword" --page-size 10
```

Current command contract is the source of truth:

```bash
siyuan-sisyphus list
siyuan-sisyphus list <tool>
siyuan-sisyphus help <tool>
siyuan-sisyphus help <tool> <action>
```

For creating or editing documents, read `siyuan-sisyphus-create-edit` first; it distinguishes `fs` workspace paths like `/Notebook/Folder/Doc` from `document create` notebook-local hpaths like `/Folder/Doc`.

## Flag Rules

- Field names accept kebab, camel, or snake case: `--parent-id`, `--parentID`, and `--parent_id` map to the same field.
- Action names accept kebab or snake case: `get-kramdown` and `get_kramdown` are equivalent.
- Boolean flags accept `--flag`, `--flag=false`, or `--no-flag`.
- Array flags can be repeated or comma-separated when the field is simple.
- Object and nested values should use JSON sidecars: `--attrs-json '{"custom-key":"value"}'`.
- For scriptable output, always add `--json`.

Useful JSON patterns:

```bash
siyuan-sisyphus block set-attrs --id "<block-id>" --attrs-json '{"custom-source":"agent"}'
siyuan-sisyphus av set-cells --av-id "<av-id>" --cells-json '[{"rowID":"<row-id>","columnID":"<column-id>","valueType":"text","text":"Done"}]'
siyuan-sisyphus search fulltext --query "keyword" --page-size 20 --json
```

## Pagination

Interactive terminals may page results. In automation, specify page controls explicitly:

```bash
siyuan-sisyphus fs read --path "/Notebook/Long Doc" --page 2 --page-size 8000 --json
siyuan-sisyphus search fulltext --query "keyword" --page 1 --page-size 20 --json
siyuan-sisyphus av render --id "<av-id>" --page 1 --page-size 50 --json
```

## Scenario Sub-Skills

Use the narrowest sub-skill that matches the task:

| Sub-skill | Use for |
| --- | --- |
| `siyuan-sisyphus-browse-read` | Explore notebooks, trees, documents, IDs, paths, and readable content |
| `siyuan-sisyphus-create-edit` | Create documents, append/insert/update blocks, replace text, metadata, daily notes |
| `siyuan-sisyphus-search-query` | Fulltext search, SQL, backlinks, references, assets, find and replace |
| `siyuan-sisyphus-database` | Attribute views, columns, rows, cells, view rendering |
| `siyuan-sisyphus-file-export` | Upload assets, export markdown/resources, extract documents and assets |
| `siyuan-sisyphus-tag-flashcard` | Tags, decks, cards, review workflows |
| `siyuan-sisyphus-system-cli` | CLI setup, profiles, permissions, dangerous actions, troubleshooting |
| `siyuan-markup-guide` | Markdown and rich SiYuan markup to write with CLI commands |

## Tool Quick Reference

| Tool | Common CLI actions |
| --- | --- |
| `fs` | `ls`, `tree`, `read`, `write`, `replace`, `search`, `rm`, `mv` |
| `notebook` | `list`, `create`, `rename`, `get-conf`, `get-permissions`, `get-child-docs` |
| `document` | `create`, `lookup`, `rename`, `get-doc`, `get-child-blocks`, `search-docs`, `create-daily-note` |
| `block` | `append`, `prepend`, `insert`, `update`, `replace`, `get-kramdown`, `get-children`, `set-attrs`, `info` |
| `av` | `get`, `render`, `search`, `add-column`, `add-rows`, `set-cells`, `get-primary-key-values` |
| `search` | `fulltext`, `query-sql`, `get-backlinks`, `search-refs`, `search-assets`, `find-replace` |
| `file` | `upload-asset`, `export-md`, `extract-doc`, `export-resources`, `get-doc-assets` |
| `tag` | `list`, `rename`, `remove` |
| `system` | `get-version`, `get-current-time`, `conf`, `network`, `notify` |
| `flashcard` | `get-decks`, `list-cards`, `get-cards`, `create-card`, `review-card` |
| `mascot` | `get-balance`, `shop`, `buy` |

## Safety

The CLI treats the command itself as confirmation. Before running destructive or local-filesystem commands, state what will change and get explicit user approval when acting on user data.

High-risk actions include `fs rm`, `fs mv`, `notebook remove`, `notebook set-permission`, `document remove`, `document move`, `block delete`, `block move`, `search find-replace`, `file upload-asset`, `file export-resources --output-path`, `file remove-unused-assets`, `file delete-asset`, `tag remove`, and `flashcard remove-card`.

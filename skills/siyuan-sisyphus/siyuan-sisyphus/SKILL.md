---
name: siyuan-mcp-sisyphus
description: Top-level skill for the SiYuan Sisyphus ecosystem. Introduces the MCP/CLI entrypoints, lists the 7 scenario sub-skills, and provides a dangerous-action overview. Use a sub-skill for specific operations; use this skill only for orientation.
---

# SiYuan MCP Sisyphus

SiYuan Sisyphus is a SiYuan Note plugin + standalone CLI that exposes 11 aggregated tools for AI agents to operate notes safely through the SiYuan HTTP API.

## Entrypoints

| Mode | When to use | Example |
|------|-------------|---------|
| **MCP** | AI client (Claude, Cursor, Cherry Studio) makes tool calls | `block(action="append", parentID="...", dataType="markdown", data="...")` |
| **CLI** | Shell/script use, one-shot operations, automation | `siyuan-sisyphus block append --parent-id ... --data-type markdown --data "..."` |

Each tool takes an `action` parameter in MCP mode. In CLI mode the action is the second positional command and flags are mapped from schema fields.

## Scenario Sub-Skills

Pick the sub-skill that matches your current task:

| Sub-skill | Use when you need to... |
|-----------|------------------------|
| `siyuan-sisyphus-browse-read` | Explore notebooks, list document trees, read content, resolve paths |
| `siyuan-sisyphus-create-edit` | Create documents, append/insert/update blocks, set metadata |
| `siyuan-sisyphus-search-query` | Fulltext search, SQL query, backlinks, find/replace |
| `siyuan-sisyphus-database` | Create or edit SiYuan attribute views (databases), rows, columns, cells |
| `siyuan-sisyphus-tag-flashcard` | Create tags, manage flashcards, review cards, deck operations |
| `siyuan-sisyphus-file-export` | Upload assets, export documents/resources, extract docs |
| `siyuan-sisyphus-system-cli` | System info, permissions, CLI configuration, dangerous action semantics |

## Tool Quick Reference

| Tool | One-liner | Key actions |
|------|-----------|-------------|
| `fs` | Virtual filesystem with human-readable paths | `ls`, `tree`, `read`, `write`, `replace`, `rm`, `mv`, `search` |
| `notebook` | Notebook management | `list`, `create`, `set_open_state`, `rename`, `get_permissions`, `set_permission` |
| `document` | Document CRUD and tree | `create`, `lookup`, `rename`, `remove`, `move`, `get_child_blocks`, `get_doc`, `create_daily_note` |
| `block` | Block-level editing | `insert`, `prepend`, `append`, `update`, `replace`, `delete`, `move`, `set_attrs`, `get_children` |
| `av` | Database / attribute view | `get`, `render`, `add_rows`, `remove_rows`, `add_column`, `remove_column`, `set_cells` |
| `search` | Search and query | `fulltext`, `query_sql`, `get_backlinks`, `search_refs`, `find_replace` |
| `file` | Assets and export | `upload_asset`, `export_md`, `export_resources`, `extract_doc`, `get_doc_assets` |
| `tag` | Tag management | `list`, `rename`, `remove` |
| `system` | System info | `get_version`, `get_current_time`, `conf`, `notify` |
| `flashcard` | Spaced repetition | `list_cards`, `get_decks`, `review_card`, `create_card`, `remove_card` |
| `mascot` | Balance and shop | `get_balance`, `shop`, `buy` |

## Getting Help

- **Any tool**: Call with `action="help"` to get actions, required fields, hints, and examples.
- **CLI**: `siyuan-sisyphus list`, `siyuan-sisyphus list <tool>`, `siyuan-sisyphus help <tool> <action>`
- **MCP resources** (if client supports them):
  - `siyuan://help/tool-overview` — all tools and guidance
  - `siyuan://help/document-path-semantics` — path type details
  - `siyuan://help/examples` — minimal call examples
  - `siyuan://help/ai-layout-guide` — layout and block-type decision rules
  - `siyuan://help/action/{tool}/{action}` — per-action parameter shapes

## Dangerous Actions Overview

The following actions **require explicit user confirmation** in MCP mode. See `siyuan-sisyphus-system-cli` for the full checklist and flow.

- `notebook` — `remove`, `set_permission`
- `document` — `remove`, `move`
- `block` — `delete`, `move`
- `search` — `find_replace`
- `file` — `upload_asset`, `export_resources` (with `outputPath`), `remove_unused_assets`, `delete_asset`
- `tag` — `remove`
- `flashcard` — `remove_card`
- `system` — `workspace_info` (disabled by default)
- `fs` — `rm`, `mv`

Flow: State "I will do X. Proceed?" and only call the tool after the user explicitly agrees. In CLI mode, the command itself is treated as confirmation.

---
name: siyuan-sisyphus-system-cli
description: CLI-only guide for SiYuan Sisyphus setup, profiles, permissions, system commands, dangerous actions, JSON output, help discovery, and troubleshooting. Use when an agent configures or verifies the `siyuan-sisyphus` CLI or needs operational safety rules.
---

# SiYuan Sisyphus CLI - System and Operations

Use this skill when setting up the CLI, verifying connectivity, checking permissions, or deciding whether an operation is safe to run.

## First Checks

```bash
siyuan-sisyphus --version
siyuan-sisyphus skill list
siyuan-sisyphus system get-version
siyuan-sisyphus system get-current-time
siyuan-sisyphus list
```

If a command fails because authentication is missing, configure a profile:

```bash
siyuan-sisyphus init
siyuan-sisyphus config list
siyuan-sisyphus config set default --url http://127.0.0.1:6806 --token "<token>"
siyuan-sisyphus config use default
```

For one command only:

```bash
siyuan-sisyphus --url http://127.0.0.1:6806 --token "<token>" system get-version
siyuan-sisyphus --profile work notebook list
```

## Source of Truth

Inspect the live command contract before using unfamiliar fields:

```bash
siyuan-sisyphus list
siyuan-sisyphus list block
siyuan-sisyphus help block append
siyuan-sisyphus help search query-sql
```

Use `--json` when parsing output:

```bash
siyuan-sisyphus notebook list --json
siyuan-sisyphus system conf --mode summary --json
```

## System Commands

```bash
siyuan-sisyphus system get-version
siyuan-sisyphus system get-current-time
siyuan-sisyphus system conf --mode summary
siyuan-sisyphus system conf --mode get --key-path "conf.appearance.mode"
siyuan-sisyphus system network
siyuan-sisyphus system notify --msg "Task complete" --level info --timeout 5000
```

`system workspace-info` exposes the absolute workspace path and is high risk. Avoid it unless the user specifically asks and understands the exposure.

## Profiles and Config

Config file: `~/.siyuan-sisyphus/config.json`. The old `~/.siyuan-mcp/config.json` may be read as a fallback.

```bash
siyuan-sisyphus config list
siyuan-sisyphus config get default
siyuan-sisyphus config set work --url http://127.0.0.1:6807 --token "<token>"
siyuan-sisyphus config use work
```

Precedence:

1. Command flags: `--url`, `--token`, `--profile`
2. Environment: `SIYUAN_API_URL`, `SIYUAN_TOKEN`
3. Active profile in config
4. Default URL

## Permissions

Notebook permissions are `rwd`, `rw`, `r`, and `none`. In CLI mode, unconfigured notebooks default to `r`.

```bash
siyuan-sisyphus notebook get-permissions
siyuan-sisyphus notebook get-permissions --notebook "<notebook-id>"
```

Changing permissions is high risk:

```bash
siyuan-sisyphus notebook set-permission --notebook "<notebook-id>" --permission rw
```

Before changing permissions, record the current permission and get explicit user approval.

## Dangerous Actions

The CLI assumes command execution is confirmation. For user data, ask before running:

| Tool | Actions |
| --- | --- |
| `fs` | `rm`, `mv` |
| `notebook` | `remove`, `set-permission` |
| `document` | `remove`, `move` |
| `block` | `delete`, `move` |
| `search` | `find-replace` |
| `file` | `upload-asset`, `export-resources --output-path`, `remove-unused-assets`, `delete-asset` |
| `tag` | `remove` |
| `flashcard` | `remove-card` |
| `system` | `workspace-info` |

Safe approval wording: "I will run `<command summary>`, which will modify or expose `<specific target>`. Please confirm before I execute it."

## Troubleshooting

- Unknown command or field: run `siyuan-sisyphus help <tool> <action>`.
- Empty or partial results: check notebook permissions with `notebook get-permissions`.
- Search misses recent writes: retry after a short indexing delay or read by path/ID instead.
- Scripts need stable output: use `--json`, `--page`, and `--page-size`.
- Complex flags fail: pass the field through `--<field>-json '<valid JSON>'`.

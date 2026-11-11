---
name: siyuan-mcp-system-safety
description: MCP guide for SiYuan system information, notebook permissions, action help, dangerous-operation confirmation, sensitive disclosures, and troubleshooting.
compatibility: "优先使用已连接的 SiYuan Sisyphus MCP；无 MCP 时按随包 CLI 后备规程使用已有本机入口。技能安装与 MCP 连接配置分别回验。"
---

# SiYuan System and Safety with MCP

Start with a connectivity check and inspect live help before unfamiliar actions.

```text
system(action="get_version")
```
```text
system(action="get_current_time")
```
```text
notebook(action="get_permissions")
```

Notebook permissions are `rwd`, `rw`, `r`, and `none`. Missing content can mean permission filtering rather than absence. Record the current value before proposing a permission change.

## Confirmation boundary

Obtain explicit approval before notebook/document/block deletion or move, bulk replacement, tag removal, permission changes, and workspace path disclosure. State the exact target and consequence. A prior request to inspect or diagnose is not approval to mutate.

```text
system(action="audit_environment")
```
If an action or field is rejected, inspect `siyuan://help/tool-overview` and the relevant `siyuan://help/action/{tool}/{action}` resource instead of guessing. Search results can lag recent writes; direct ID/path reads do not depend on indexing.

For a frozen external source-audit handoff, validate its contract without reading the source tree or inferring conclusions:

```text
system(action="validate_source_audit", inventory="<parsed-inventory-json>", usageMap="<parsed-usage-map-json>", baselinesMarkdown="<exact-baselines-markdown>")
```

## MCP safety

Respect server permission errors and dangerous-action confirmation responses. Never bypass them with another action. The MCP server must not write skill files or configuration into the client machine.

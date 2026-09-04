# Project Tool

`project` provides one bounded, read-only machine interface for shared project memory.

## `snapshot`

Select exactly one of `cwd`, `projectId`, or `projectName`. The response includes project identity, progress projections, recent events, sessions, knowledge products, registered artifacts, server diagnostics, and a host-side local probe baseline.

The response never returns `workspaceRoot`. Absolute paths are resolved only for entries already listed in the project's artifact index. `query_embed` remains a human-facing view and is not a machine source of truth.

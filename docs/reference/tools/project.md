# Project Tool

`project` provides one bounded, read-only machine interface for shared project memory.

## `snapshot`

Select exactly one of `cwd`, `projectId`, or `projectName`. The response includes project identity, progress projections, recent events, sessions, knowledge products, registered artifacts, server diagnostics, and a host-side local probe baseline.

The response never returns `workspaceRoot`. Absolute paths are resolved only for entries already listed in the project's artifact index. `query_embed` remains a human-facing view and is not a machine source of truth.

The server first obtains at most 501 event blocks through a stable single-table query, then sorts them in TypeScript by fact time: `custom-progress-occurred-at`, then `custom-provenance-occurred-at`, and finally block creation time. Equal fact times use recorded time and block ID as stable tie-breakers. Pagination is applied only after sorting.

Each event includes `occurredAt`, `recordedAt`, and `timeBasis`. The `chronology` object reports project and workstream heads, scanned count, and completeness. When the 500-event window is exceeded, the response emits `event_chronology_truncated`, sets `chronology.complete` to `false`, and withholds authoritative projection-lag conclusions. Clients must not update current-state projections from an incomplete chronology.

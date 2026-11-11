# Project Tool

`project` provides one bounded, read-only machine interface for shared project memory.

## `snapshot`

Select exactly one of `cwd`, `projectId`, or `projectName`. The response includes project identity, progress projections, recent events, sessions, knowledge products, registered artifacts, server diagnostics, and a host-side local probe baseline.

The response never returns `workspaceRoot`. Absolute paths are resolved only for entries already listed in the project's artifact index. `query_embed` remains a human-facing view and is not a machine source of truth.

The server first obtains at most 501 event blocks through a stable single-table query, then sorts them in TypeScript by fact time: `custom-progress-occurred-at`, then `custom-provenance-occurred-at`, and finally block creation time. Equal fact times use recorded time and block ID as stable tie-breakers. Pagination is applied only after sorting.

Each event includes `occurredAt`, `recordedAt`, and `timeBasis`. The `chronology` object reports project and workstream heads, scanned count, and completeness. When the 500-event window is exceeded, the response emits `event_chronology_truncated`, sets `chronology.complete` to `false`, and withholds authoritative projection-lag conclusions. Clients must not update current-state projections from an incomplete chronology.

## 知识协议与目录读取

知识协议 2、契约 1.6 随 bootstrap 和项目快照返回。经授权项目 AV，原子可凭项目和工作线属性发现，无须重复绑定；旧行继续可读。无目录行的原子不虚构编译状态。检索的 supersededBy 是旧块 ID 对应的接替声明列表，多个声明均保留，不能代替原文和范围核对。

formattedExcerpt 来自内核 Markdown，textBasis=kernel-markdown；仍须回读数学原块，不能还原输入阶段已丢失的符号。目录本次最多读取 2,000 个属性原子，超过范围明确报告不可用；减少写入不等于保证读取提速。

# Architecture Overview

SiYuan Sisyphus exposes one deliberately bounded text-workflow surface through both MCP and the CLI.

## Layers

1. MCP clients connect over stdio or authenticated HTTP(S); the CLI calls the same registry directly.
2. `TOOL_REGISTRY` publishes 13 aggregate tools and routes their 94 actions.
3. Permission checks, strict write preflight, response shaping, and optional UI refresh wrap each call.
4. `SiYuanClient` uses SiYuan HTTP APIs. The `file` tool separately reads only registered, manifest-listed local project text.

The aggregate tools are `fs`, `notebook`, `document`, `block`, `av`, `file`, `project`, `search`, `provenance`, `tag`, `timeline`, `system`, and `extension`. The source of truth is `src/core/config.ts`.

## Boundaries

- Mascot, feedback, flashcard, analytics, telemetry, asset/OCR, template/import/export, and timeline rollback/delete are not part of the MCP or CLI surface.
- The native SiYuan version-control panel may still perform local rollback and timeline-node deletion. It is independent of MCP exposure.
- `extension` forwards only the native read allowlist: `search.semantic`, `ref.backlinks`, `ref.forwardlinks`, `outline.get`, `web_fetch`, and `web_search`.
- Every stateful write uses notebook permissions and the strict preflight/readback protocol when enabled.

## Products

The plugin builds the SiYuan renderer, MCP server, and Timeline MCP App. The standalone `siyuan-sisyphus` package builds a self-contained CLI that uses the same schemas and handlers.

See [Extension Points](./extension-points.md) for the supported way to extend this surface.

# Adding Tools

This page outlines the current workflow for introducing a new aggregated tool.

When to read this page: you are adding a new tool category.

## Workflow

1. Add or extend API wrappers in `src/api/*` if needed
2. Define tool/action types in `src/core/config.ts` and related schemas
3. Implement the tool module under `src/tools/`
4. Register it in `src/core/tool-registry.ts`
5. Add default config and help text
6. Add tests

## Gotchas

- Tool docs and config action lists must stay aligned
- Permission checks need to be explicit for notebook-scoped mutations

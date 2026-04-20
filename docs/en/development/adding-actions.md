# Adding Actions

This page outlines the workflow for adding an action to an existing tool.

When to read this page: you are extending one existing aggregated tool.

## Workflow

1. Add the action to `src/mcp/config.ts`
2. Define or extend the action schema
3. Add the action variant to the tool description layer
4. Implement the handler
5. Enable it by default if appropriate
6. Add or update tests

## Gotchas

- Keep CLI flag mapping and docs aligned with the new action shape
- Re-check confirmation and permission requirements

# Extension Points

This page describes safe extension areas and notable boundaries.

When to read this page: you are adding a tool, changing transports, or extending docs and config.

## Extension Areas

- New tool categories
- New actions inside existing categories
- Additional help resources
- CLI rendering and command surface
- Settings UI and tool config storage

## Boundaries

- File access should go through SiYuan APIs for remote-safe behavior
- Notebook permissions must remain enforced for notebook-scoped data
- Tool docs should stay aligned with `src/mcp/config.ts` action lists

## Security Notes

- `workspace_info` and local file upload behavior are high-risk surfaces
- Non-loopback HTTP binding requires token auth

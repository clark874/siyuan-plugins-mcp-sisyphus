# Debugging

This page groups the most useful debugging entrypoints.

When to read this page: you need logs, client-side config checks, or SiYuan runtime inspection.

## Common Paths

- Inspect plugin and client config first
- Check SiYuan API reachability on `6806`
- Check MCP HTTP reachability on `36806`

## Useful Techniques

- Use SiYuan remote debugging when frontend/plugin behavior is unclear
- Check MCP client config for transport mismatch
- Use smoke tests when you need an end-to-end signal

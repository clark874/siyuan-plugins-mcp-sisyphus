# Troubleshooting

This page groups common failures and quick checks for MCP connectivity.

When to read this page: the server does not start, tools are not visible, or calls fail after connection.

Related pages:

- [Deployment](./deployment.md)
- [HTTPS](./https.md)

## Connection Failed

Check these first:

- Is SiYuan running and its API reachable on `6806`?
- Is the plugin enabled?
- If using HTTP, is the MCP server started on `36806`?
- If using stdio, is the `mcp-server.cjs` path correct?

## Tools Not Visible

- Confirm the client is connected to the MCP endpoint
- Confirm the plugin-side tool config did not disable the tool
- If using HTTP, restart the MCP server after settings changes

## Calls Fail After Connection

- Verify bearer token or `SIYUAN_TOKEN`
- Verify notebook permissions for the target notebook
- Confirm you are using the right path type for document actions

## Permission Denied

Permission levels:

- `rwd`: read, write, delete
- `rw`: read, write
- `r`: read only
- `none`: no access

If a call fails, check both:

- notebook-level permission config
- whether the action itself is high-risk or disabled

## Logs and Quick Reference

Default ports:

- SiYuan API: `6806`
- MCP HTTP: `36806`

Useful locations:

- Plugin bundle: `{workspace}/data/plugins/siyuan-plugins-mcp-sisyphus/`
- `mcp-server.cjs`: same directory as the plugin bundle

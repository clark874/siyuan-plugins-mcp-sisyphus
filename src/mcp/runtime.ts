/**
 * Runtime environment helpers.
 *
 * No imports — safe to use from any module without circular-dependency risk.
 */

/**
 * Returns true when the MCP server was spawned by the SiYuan plugin.
 *
 * The plugin launcher always injects SIYUAN_MCP_PARENT_PID before spawning
 * the child process (server-launcher.ts). Its absence means the server is
 * running standalone, outside of the SiYuan desktop client.
 */
export function isPluginMode(): boolean {
    const parentPid = parseInt(process.env.SIYUAN_MCP_PARENT_PID ?? '', 10);
    return Number.isInteger(parentPid) && parentPid > 1;
}

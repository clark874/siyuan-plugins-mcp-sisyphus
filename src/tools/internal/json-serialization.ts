/**
 * MCP 文本响应默认面向模型传输，紧凑 JSON 可以避免把缩进空白计入上下文。
 * 仅在本地调试时显式设置 SIYUAN_MCP_PRETTY_JSON=1 恢复两空格缩进。
 */
export function stringifyToolJson(value: unknown): string {
    return JSON.stringify(value, null, process.env.SIYUAN_MCP_PRETTY_JSON === '1' ? 2 : undefined);
}

/**
 * 只重排能够完整解析的 JSON 文本；普通文本和第三方扩展输出保持原样。
 */
export function normalizeToolJsonText(text: string): string {
    try {
        return stringifyToolJson(JSON.parse(text));
    } catch {
        return text;
    }
}

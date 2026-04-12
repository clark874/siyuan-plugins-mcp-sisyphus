/**
 * Parse JSON text from a tool call result.
 */
export function parseResult(result: { content: Array<{ text: string }> }) {
    return JSON.parse(result.content[0].text);
}

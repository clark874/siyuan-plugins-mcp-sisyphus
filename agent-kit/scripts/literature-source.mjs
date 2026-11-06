/** 统一用于翻译缓存、原文版本核验和对照阅读。 */
export function literatureSourceMarkdown(kramdown) {
    return String(kramdown ?? '').replace(/^[ \t]*\{:[^\n]*\}[ \t]*$/gm, '')
        .replace(/(^[ \t]*(?:[-+*]|\d+\.)[ \t]+)\{: id="\d{14}-[a-z0-9]{7}"[^\n]*?\}/gm, '$1')
        .replace(/^原始MD SHA-256：[a-f0-9]{64}\s*\n+/u, '').trim();
}

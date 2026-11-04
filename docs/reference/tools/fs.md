# fs Tool

Use `fs` first for ordinary pure-Markdown document file operations. It accepts human-readable workspace paths and hides notebook IDs, block IDs, and storage paths.

Path shape:

- `/<notebook name>` for a notebook root
- `/<notebook name>/<folder>/<doc>` for a document
- `/` for all readable notebook roots

## Common Actions

| Action | Purpose |
|--------|---------|
| `ls` | List direct child documents as `{ name, path, children }` |
| `tree` | List a compact recursive document tree |
| `read` | Read a document as Markdown |
| `write` | Create a document, or replace its body with `overwrite=true` |
| `search` | Search Markdown lines under a document or folder path |

When `tree` expands a notebook root or `/`, top-level document subtrees are read with a concurrency limit of 8. Root responses include `partial`, `errors`, `topLevelDocumentCount`, and `failedTopLevelDocumentCount`. If `partial` is `true`, a node with empty `children` may represent a failed subtree read rather than a real leaf; inspect `errors`, which expose only human-readable names and paths.

## AI-Editable Markdown View

- `read` returns an AI-editable Markdown view, not Markdown from `/api/export/exportMdContent`. This avoids degrading SiYuan block refs into footnotes or plain links.
- The view is built from block kramdown: block refs are preserved as `((id 'title'))`, tags are preserved as `#tag#`, and SiYuan's zero-width tag marker characters are stripped.
- Normal block and list-item IAL metadata is hidden, so `{: id="..." updated="..."}` does not leak into list text; snippets copied from `fs.read`, such as `- item`, can be used directly as `fs.replace` `old` text.
- Fenced code, math blocks, and literal user text are not globally rewritten just because they look like metadata.
- Blockquotes, tables, super blocks, and similar containers are read as containers, so child blocks are not duplicated. `fs.read` filters SiYuan-generated container IAL, but complex blocks still return a non-fidelity warning and should be modified with advanced tools.
- `read` always paginates by complete display blocks. Use the returned `nextWindow`, or pass zero-based `blockStart`, `blockLimit` (default `50`), and `tokenBudget` (default `2000`). Lists, tables, blockquotes, code fences, math blocks, and other containers are never split between windows.
- Every read returns a full heading `outline` with block positions. Pass `includeBlockIds=true` to receive a sidecar `blockRefs` mapping; IDs are never injected into the editable Markdown `content`.
- The old `page/pageSize` character pagination has been removed. A single block larger than `tokenBudget` is returned whole with `budgetExceeded=true`.

## Markdown Safety Semantics

- `write` accepts `((id 'title'))`, naked `((id))`, and `#tag#` directly. Naked refs are resolved to explicit anchors before writing; if lookup fails, MCP falls back to `((id 'id'))` with a warning.
- `write` strips a leading `# Title` when it matches the document name, avoiding duplicate visible titles.
- `write overwrite=true` fails closed before deleting any body block. It refuses documents whose live descendants contain complex SiYuan-native blocks (AV/database blocks, super blocks, embeds, widgets, HTML, or media), non-empty `name` / `alias` / `memo` / `bookmark` / `style` / `custom-*` metadata, or inbound reference targets. Use block-level incremental tools for those documents. The retained document root is excluded from this check.
- `replace` works block-by-block against non-complex Markdown blocks. If the document contains complex SiYuan-native blocks, those blocks are skipped and reported as `skippedComplexBlocks`; matches that only exist inside skipped blocks, or cross block boundaries, are rejected without writing.
- `replace` matches against the same AI-editable view returned by `read`, so it can directly edit ordinary Markdown blocks containing tags or block refs, and can replace a whole `#tag#` token with plain text. It is still a Markdown text operation, not a complex-block editor.
- For inline styled text, `old` should be the plain text inside the style markers, without Markdown delimiters. For example, replace `hello` inside `**hello**` or `` `hello` ``, not `**hello**` or `` `hello` ``; DOM writeback preserves the existing bold, inline-code, and similar styles.
- `replace` allows footnote-style refs and `siyuan://blocks` Markdown links, but the result includes a hint because they do not create SiYuan backlinks.

## High-risk Actions

- `rm` deletes a document and requires explicit confirmation.
- `mv` moves or renames a document and requires explicit confirmation.

## Examples

```json
{ "action": "ls", "path": "/Inbox/Meetings" }
```

```json
{ "action": "read", "path": "/Inbox/Meetings/2024 Summary" }
```

```json
{ "action": "read", "path": "/Inbox/Meetings/2024 Summary", "blockStart": 50, "blockLimit": 50, "tokenBudget": 2000, "includeBlockIds": true }
```

```json
{ "action": "write", "path": "/Inbox/Meetings/New Doc", "markdown": "Content" }
```

```json
{ "action": "search", "path": "/Inbox/Meetings", "query": "budget", "caseSensitive": false }
```

When `fs.read` reports complex blocks or the task needs SiYuan-specific block layout, metadata, SQL, backlinks, assets, or database operations, switch to `document`, `block`, `search`, `file`, or `av`.

## 路径搜索语义与性能

`search` 按已授权笔记本与真实存储路径查询块表，分批读取原始叶块 Markdown；字面量先由内核筛选候选，再用 JavaScript 逐行核验，正则保持 JavaScript 语法。它不调用导出接口、不展开脚注或引用目标，也不执行嵌入 SQL。

命中包含 `blockId`，响应的 `lineBasis=block` 表示 `line` 是该块 Markdown 的一基行号；虚拟文件命中没有块 ID，行号仍相对于虚拟文件。文档标题、列表或引述等容器的外层格式，以及导出生成的内容不在搜索正文中。相同文档路径下不同块的相同行不会互相覆盖。

普通查询会在内核筛候选；任意 JavaScript 正则、空查询仍扫描已授权范围，每页均重新计算该范围的命中。大范围自然语言检索优先 `search.fulltext`，并传真实笔记本 ID 与存储路径作为 `paths`；全文索引的分词结果不等同于 Markdown 逐行匹配。SQL 索引可能暂时落后于刚写入的内容，必要时按块 ID 回读核实。

## 显式跨行搜索

`search` 的 `matchScope` 默认为 `line`，保留逐行布尔匹配及原有搜索范围。`block` 在每个原始叶块 Markdown 内返回非重叠匹配，包含 `blockId`、块内起止行 `line/endLine` 和匹配原文 `text`。长原文仍使用既有 200 字符摘要及截断标记。

`document` 仅接受明确的单文档路径，不搜索其子文档，也不把笔记本串成一份文档。它按与 fs.read 相同的原生展示块真实顺序读取完整 Kramdown，构建与 `fs.read` 相同的可编辑 Markdown，再以空行连接。命中的 `line/endLine` 是拼接正文的一基行号，响应标明 `lineBasis=document`；`blockId/endBlockId`、`blockIds`、`blockLine/endBlockLine` 将匹配范围映射回真实展示块。容器的后代内容包含在该容器的 Markdown 中，其引用边界为容器块。

JavaScript 正则中的 `.` 仍默认不匹配换行；跨行查询请显式使用 `Thams[\s\S]*JMLR` 等表达式。跨行模式要求非空查询，虚拟文件保留 `line` 模式。单文档读取超过 10000 个展示块、2 MiB 正文或有任一块读取不完整时直接报错，不以部分内容伪报无命中。整个流程不调用导出接口或执行嵌入 SQL。

```json
{ "action": "search", "path": "/工作日志/项目/项目进度协作", "query": "Thams[\\s\\S]*JMLR", "regex": true, "caseSensitive": true, "matchScope": "document" }
```

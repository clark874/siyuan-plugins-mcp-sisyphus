# fs 工具

普通的纯 Markdown 文档文件操作优先使用 `fs`。它接收人类可读的工作空间路径，并隐藏 notebook ID、block ID 和存储路径。

路径形态：

- `/<笔记本名>` 表示笔记本根目录
- `/<笔记本名>/<文件夹>/<文档>` 表示文档
- `/` 表示所有可读笔记本根目录

## 常用动作

| 动作 | 用途 |
|--------|------|
| `ls` | 以 `{ name, path, children }` 列出直接子文档 |
| `tree` | 列出精简递归文档树 |
| `read` | 读取文档 Markdown |
| `write` | 创建文档，或用 `overwrite=true` 替换正文 |
| `reorder` | 对某个笔记本或父文档下的全部可见直属子文档应用完整手动顺序 |
| `search` | 在文档或目录路径下搜索 Markdown 行 |

`tree` 展开笔记本根目录或 `/` 时，一级文档子树读取的并发上限为 8。根树响应会返回 `partial`、`errors`、`topLevelDocumentCount` 和 `failedTopLevelDocumentCount`。当 `partial` 为 `true` 时，`children` 为空的节点可能是子树读取失败，而不是真实叶节点；应检查 `errors`。`fs` 错误元数据只暴露人类可读名称与路径。

## AI 可编辑 Markdown 视图

- `read` 返回面向 AI 编辑的 Markdown 视图，而不是 `/api/export/exportMdContent` 的导出 Markdown。这样可以避免双链被降级为脚注或普通链接。
- 这个视图从块 kramdown 构建：双链保留为 `((id '标题'))`，标签保留为 `#标签#`，并清理思源 DOM 中用于标签定位的零宽字符。
- 普通块和列表项的 IAL 元数据会隐藏，例如 `{: id="..." updated="..."}` 不会出现在列表文本里；因此可以直接把 `fs.read` 里复制出的 `- 列表项` 用作 `fs.replace` 的 `old`。
- 代码块、数学块和普通文本中的 literal 内容不会为了清理元数据而全局删改。
- 引用块、表格、超级块等容器块按容器读取，避免把内部子块重复输出。`fs.read` 会过滤思源生成的容器内部 IAL，但包含复杂块时仍会返回 non-fidelity warning，写回应改用高级工具。
- `read` 始终按完整展示块分页。可直接使用返回的 `nextWindow`，或传入零基 `blockStart`、`blockLimit`（默认 `50`）和 `tokenBudget`（默认 `2000`）。列表、表格、引用、代码块、数学块及其他容器不会跨窗口截断。
- 每次读取都会返回包含块位置的全文标题 `outline`。传入 `includeBlockIds=true` 可获得独立的 `blockRefs` 映射，块 ID 不会注入可编辑 Markdown `content`。
- 旧的 `page/pageSize` 字符分页已经移除。单个块超过 `tokenBudget` 时仍会完整返回，并设置 `budgetExceeded=true`。

## Markdown 安全语义

- `write` 支持直接写 `((id '标题'))`、裸 `((id))` 和 `#标签#`。裸双链会自动解析目标块标题并补齐锚文本；如果解析失败，会降级为 `((id 'id'))` 并返回 warning。
- `write` 会移除与文档名相同的开头 `# 标题`，避免正文和思源自动标题重复。
- `write overwrite=true` 会在删除任何正文块之前失败关闭：只要实时后代中存在 AV / 数据库块、超级块、嵌入块、挂件、HTML、媒体等复杂思源原生块，非空 `name` / `alias` / `memo` / `bookmark` / `style` / `custom-*` 元数据，或外部入链目标，就拒绝整篇覆写。此类文档应使用块级增量工具；不会被正文覆写删除的文档根块不参与本检查。
- `replace` 按块处理非复杂 Markdown 块。如果文档包含复杂思源原生块，这些块会被跳过并在结果中返回 `skippedComplexBlocks`；如果匹配只存在于被跳过的复杂块里，或跨越块边界，则拒绝写入。
- `replace` 使用和 `read` 相同的 AI 可编辑视图做精确匹配，可以直接替换包含双链或标签的普通 Markdown 块，也可以把整个 `#标签#` 替换为普通文本。它仍然是 Markdown 文本操作，不是复杂块编辑器。
- 替换行内样式文字时，`old` 应使用样式内部的纯文本，不包含 Markdown 样式标记。例如替换 `**hello**` 或 `` `hello` `` 中的内容时，`old` 写 `hello`，不要写 `**hello**` 或 `` `hello` ``；DOM 写回会保留原有粗体、行内代码等样式。
- `replace` 允许脚注式引用和 `siyuan://blocks` Markdown 链接写入，但结果会提示它们不会创建思源真实反链。

## 高风险动作

- `rm` 删除文档，需要明确确认。
- `mv` 移动或重命名文档，需要明确确认。
- `reorder` 必须提交完整且无重复的直属子文档路径列表；严格安全写入会对当前结构签发预检凭据，并在写后复核顺序和排序模式。

## 示例

```json
{ "action": "ls", "path": "/Inbox/会议记录" }
```

```json
{ "action": "read", "path": "/Inbox/会议记录/2024 总结" }
```

```json
{ "action": "read", "path": "/Inbox/会议记录/2024 总结", "blockStart": 50, "blockLimit": 50, "tokenBudget": 2000, "includeBlockIds": true }
```

```json
{ "action": "write", "path": "/Inbox/会议记录/新文档", "markdown": "正文" }
```

```json
{ "action": "search", "path": "/Inbox/会议记录", "query": "预算", "caseSensitive": false }
```

当 `fs.read` 提示存在复杂块，或任务需要块级排版、元数据、SQL、反链、资源文件或数据库操作时，切换到 `document`、`block`、`search`、`file` 或 `av` 等高级工具。

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

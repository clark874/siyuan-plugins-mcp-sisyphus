# fs 工具

普通文档文件操作优先使用 `fs`。它接收人类可读的工作空间路径，并隐藏 notebook ID、block ID 和存储路径。

路径形态：

- `/<笔记本名>` 表示笔记本根目录
- `/<笔记本名>/<文件夹>/<文档>` 表示文档
- `/` 表示所有可读笔记本根目录

## 常用 Action

| Action | 用途 |
|--------|------|
| `ls` | 以 `{ name, path, children }` 列出直接子文档 |
| `tree` | 列出精简递归文档树 |
| `read` | 读取文档 Markdown |
| `write` | 创建文档，或用 `overwrite=true` 替换正文 |
| `search` | 在文档或目录路径下搜索 Markdown 行 |

## 高风险 Action

- `rm` 删除文档，需要明确确认。
- `mv` 移动或重命名文档，需要明确确认。

## 示例

```json
{ "action": "ls", "path": "/Inbox/会议记录" }
```

```json
{ "action": "read", "path": "/Inbox/会议记录/2024 总结" }
```

```json
{ "action": "write", "path": "/Inbox/会议记录/新文档", "markdown": "# 记录\n\n正文" }
```

```json
{ "action": "search", "path": "/Inbox/会议记录", "query": "预算", "caseSensitive": false }
```

只有在需要块级排版、元数据、SQL、反链、资源文件或数据库操作时，再使用 `document`、`block`、`search` 或 `av` 等高级工具。


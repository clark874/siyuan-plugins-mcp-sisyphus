# 权限模型

这个页面说明笔记本级访问控制，以及哪些操作必须显式确认。

适用场景：你遇到了权限错误，或者需要判断写入、删除的边界。

相关页面：

- [路径语义](./path-semantics.md)
- [工具索引](./tools/index.md)

## 权限级别

| 级别 | 读取 | 写入 | 删除 |
|------|------|------|------|
| `rwd` | 是 | 是 | 是 |
| `rw` | 是 | 是 | 否 |
| `r` | 是 | 否 | 否 |
| `none` | 否 | 否 | 否 |

说明：

- 新笔记本默认是 `rwd`
- 通过 `notebook(action="set_permission")` 管理权限
- 修改后会立即影响后续调用

## 高危操作

以下操作必须获得用户明确确认：

- `notebook.remove`
- `notebook.set_permission`
- `document.remove`
- `document.move`
- `document.remove_batch`
- `block.delete`
- `block.move`
- `file.upload_asset`
- `file.remove_unused_assets`
- `file.delete_asset`
- `search.find_replace`
- `system.workspace_info`
- `tag.remove`
- `flashcard.remove_card`

补充说明：

- `file.upload_asset` 对大文件还需要额外确认
- `file.export_resources` 如果带本地 `outputPath`，在操作上也应按高风险处理

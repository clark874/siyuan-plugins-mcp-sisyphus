# 块工具

`block` 提供 16 个块级动作。

| 用途 | 动作 |
| --- | --- |
| 创建或编辑 | `insert`、`prepend`、`append`、`update`、`replace`、`move` |
| 读取内容 | `get_kramdown`、`batch_kramdown`、`get_children`、`dom` |
| 引用与属性 | `transfer_references`、`set_attrs`、`get_attrs` |
| 元数据 | `info`、`breadcrumb`、`docs_info` |

修改前读取目标，修改后重新回读。启用严格安全写入时，按动作 schema 使用 `validateOnly` 返回的请求编号或哈希凭据。`move` 需要明确确认。

块删除、折叠、最近更新流、字数辅助和日记快捷动作均不再暴露。

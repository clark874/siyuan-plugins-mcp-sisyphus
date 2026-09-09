# 文档工具

`document` 提供 12 个文档级动作。

| 用途 | 动作 |
| --- | --- |
| 创建或组织 | `create`、`rename`、`move`、`reorder` |
| 解析与浏览 | `lookup`、`get_child_blocks`、`get_child_docs`、`list_tree`、`search_docs` |
| 读取或设置元数据 | `get_doc`、`get_outline`、`set_attr` |

使用 `lookup` 区分稳定 ID、笔记本内人类可读路径和 `.sy` 存储路径；回读优先使用稳定 ID。`move` 需要明确确认，启用严格模式时受预检协议约束。

文档删除、复制、日记创建、标题转换和子文档排序辅助动作均不再暴露。

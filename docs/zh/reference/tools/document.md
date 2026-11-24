# 文档工具

`document` 提供 14 个文档级动作。

| 用途 | 动作 |
| --- | --- |
| 创建或组织 | `create`、`rename`、`move`、`reorder`、`duplicate` |
| 解析与浏览 | `lookup`、`get_child_blocks`、`get_child_docs`、`list_tree`、`search_docs` |
| 读取或设置元数据 | `get_doc`、`get_outline`、`set_attr`、`export_markdown` |

使用 `lookup` 区分稳定 ID、笔记本内人类可读路径和 `.sy` 存储路径；回读优先使用稳定 ID。`move` 需要明确确认，启用严格模式时受预检协议约束。

`duplicate` 原生复制同笔记本的普通文档，预检检查写权限和受管标识，执行后核验副本。`export_markdown` 使用思源导出规则返回文本，工作区有不可读笔记本时使用受控的 `get_doc`。

# search

当前检索工具包含 12 个文本知识 action：

- 检索：`fulltext`、`semantic`、`knowledge`、`query_sql`。
- 治理与引用：`check_anchor`、`get_backlinks`、`search_refs`、`list_invalid_refs`。
- 受控修改：`find_replace`、`criteria_save`、`criteria_remove`。
- 已保存搜索读取：`criteria_list`。

自然语言治理检索优先使用 `knowledge`，候选检查使用 `semantic`，结构分析使用带明确 `LIMIT` 的只读 `query_sql`。`check_anchor` 是写入前命名冲突检查，不是检索捷径。工具不再暴露资产文件名检索或资产内容/OCR 检索。

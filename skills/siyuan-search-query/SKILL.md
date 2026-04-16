---
name: siyuan-search-query
description: 思源笔记搜索与 SQL 查询指南。当用户需要使用全局搜索、查询语法、SQL 查询、FTS 全文搜索或创建嵌入查询块时使用此 skill。
---

# 思源笔记搜索与查询指南

思源通过 SQLite FTS5 实现全局搜索。搜索可以通过查询语法进行高级组合，也可以直接通过 SQL 查询底层数据库。

## 查询语法（Query Syntax）

全局搜索支持通过逻辑操作符组合查询。

### 基本规则

- **字符串**：字母、数字、下划线等可直接输入
- **短语**：可用 `+` 连接（不建议中文使用，因为分词按字拆分）
- **引号包裹**：包含特殊字符（如 `-`、`*`）的字符串需用 `"` 包裹； `"` 本身需用 SQL 风格转义 `""`
- **操作符**：`AND`、`OR`、`NOT`
- **空格分隔**：默认使用 `AND` 连接
- **括号 `()`**：组合优先级

### 示例

```sql
foo NOT bar                    -- 包含 foo 且不包含 bar
one OR two NOT three           -- 包含 one 或 two，且不含 three
one OR (two NOT three)         -- 包含 one，或包含 two 且不含 three
"foo""bar"""                   -- 命中 foo"bar"
```

### 全文搜索调用

```python
# method=1 表示使用查询语法
search(action="fulltext", query="foo NOT bar", method=1)

# 限定在特定文档子树下搜索
search(action="fulltext", query="思源 AND 内容块", method=1, 
       parentId="20210808180320-fqgskfj")
```

## SQL 查询

MCP 限制只能使用 `SELECT` / `WITH` 语句。

### 常用表结构

| 表名 | 说明 |
|------|------|
| `blocks` | 所有内容块 |
| `blocks_fts` | 按字符原样分词的 FTS 虚拟表 |
| `blocks_fts_case_insensitive` | 忽略大小写的 FTS 虚拟表 |
| `attributes` | 块属性（`name`, `value`, `block_id`）|
| `refs` | 块引用关系 |
| `spans` | 行级元素（标签、链接等）|

### SQL 查询示例

```python
# 查询最近更新的 10 个段落块
search(action="query_sql",
       stmt="SELECT * FROM blocks WHERE type = 'p' ORDER BY updated DESC LIMIT 10")

# 使用 FTS 查询（性能更好）
search(action="query_sql",
       stmt="SELECT * FROM blocks_fts WHERE blocks_fts MATCH 'content:思源' LIMIT 10")

# 按标签搜索包含特定标签的块
search(action="query_sql",
       stmt="SELECT * FROM spans WHERE type = 'tag' AND content = '#标签名#'")
```

### 大小写敏感

- 默认搜索**不区分**大小写，使用 `blocks_fts_case_insensitive`
- 若开启“区分大小写”设置，则使用 `blocks_fts`

```python
# 区分大小写
search(action="query_sql",
       stmt="SELECT * FROM blocks_fts WHERE blocks_fts MATCH 'SiYuan' LIMIT 5")

# 不区分大小写
search(action="query_sql",
       stmt="SELECT * FROM blocks_fts_case_insensitive WHERE blocks_fts_case_insensitive MATCH 'siyuan' LIMIT 5")
```

## 搜索资源与引用

```python
# 搜索资源文件
search(action="search_assets", k="图片名")

# 获取反向链接
search(action="get_backlinks", id="块或文档ID")

# 获取反链提及
search(action="get_backmentions", id="块或文档ID")

# 搜索引用指定块的块
search(action="search_refs", query="块ID")

# 列出无效块引用
search(action="list_invalid_refs")
```

## 标签搜索

```python
# 列出工作区所有标签
search(action="search_tag", k="")

# 搜索特定标签关键词
search(action="search_tag", k="项目")
```

## 嵌入查询块

将 SQL 查询结果动态渲染到文档中：

```python
# 创建汇总待办事项的嵌入块
block(action="append", parentID="文档ID", dataType="markdown",
      data="""{{SELECT * FROM blocks WHERE content LIKE '%[ ]%' AND type = 'i' LIMIT 20}}""")

# 创建按更新时间的最近块汇总
block(action="append", parentID="文档ID", dataType="markdown",
      data="""{{SELECT * FROM blocks ORDER BY updated DESC LIMIT 10}}""")
```

## 常用查询模式

| 场景 | SQL 示例 |
|------|---------|
| 查找命名包含某关键词的块 | `SELECT * FROM blocks WHERE name LIKE '%关键词%'` |
| 查找某文档下的所有子块 | `SELECT * FROM blocks WHERE root_id = '文档ID'` |
| 查找最近 7 天更新的块 | `SELECT * FROM blocks WHERE updated > datetime('now', '-7 days')` |
| 查找包含特定标签的块 | `SELECT * FROM spans WHERE type = 'tag' AND content = '#标签#'` |
| 查找所有书签 | `SELECT * FROM attributes WHERE name = 'bookmark'` |

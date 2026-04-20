# 常见任务

这个页面把常见目标映射到 MCP 参数和 CLI 命令。

适用场景：你已经知道要做什么，但还不知道该用哪个工具。

相关页面：

- [参考首页](./index.md)
- [工具索引](./tools/index.md)

## 列出笔记本

```json
{ "action": "list" }
```

```bash
siyuan notebook list
```

## 创建文档

```json
{
  "action": "create",
  "notebook": "<notebook-id>",
  "path": "/Inbox/Note",
  "markdown": "# Hello"
}
```

```bash
siyuan document create --notebook <notebook-id> --path "/Inbox/Note" --markdown "# Hello"
```

## 追加块

```json
{
  "action": "append",
  "parentID": "<doc-or-block-id>",
  "dataType": "markdown",
  "data": "New paragraph"
}
```

```bash
siyuan block append --parent-id <doc-or-block-id> --data-type markdown --data "New paragraph"
```

## 搜索内容

```json
{
  "action": "fulltext",
  "query": "TODO"
}
```

```bash
siyuan search fulltext --query "TODO"
```

## 读取属性视图

```json
{
  "action": "get",
  "id": "<attribute-view-id>"
}
```

```bash
siyuan av get --id <attribute-view-id>
```

# SiYuan AI Interface Test Manual

这是一份给 AI 执行的**统一接口测试手册**。

目标：让 AI 在测试开始时先确认本轮测试走 `CLI` 还是 `MCP`，然后**全程只使用这一种连接方式**去操作同一个 SiYuan，测试动作、断言标准、清理要求保持一致。

---

## 1. 总规则

1. 测试开始前必须先确认：`TEST_MODE=CLI` 或 `TEST_MODE=MCP`
2. 一旦选定，本轮只允许使用这一种连接方式
3. 两种模式测试的业务动作完全一致，差别只在调用入口：
   - `CLI`：`siyuan-sisyphus <tool> <action> ...`
   - `MCP`：`tool(action="...")`
4. 只能操作本轮新建的测试对象
5. 每一步都要记录：
   - 连接方式
   - tool / action
   - 参数
   - 返回摘要
   - 结论：`PASS` / `FAIL` / `BLOCKED`
6. 删除、移动、权限修改等高风险动作，只能针对本轮测试对象执行
7. 测试结束后必须清理测试对象

---

## 2. 测试模式选择

AI 在正式执行前必须先输出其中之一：

- `TEST_MODE=CLI`
- `TEST_MODE=MCP`

如果用户没有指定，必须先询问用户要测哪一种。

### 2.1 调用映射示例

同一动作：创建文档。

#### MCP

```json
{
  "tool": "document",
  "action": "create",
  "notebook": "<id>",
  "path": "/Inbox/Test Doc",
  "markdown": "hello"
}
```

#### CLI

```bash
siyuan-sisyphus document create --notebook <id> --path "/Inbox/Test Doc" --markdown "hello"
```

---

## 3. 覆盖范围

本手册覆盖以下 10 个聚合工具：

- `notebook`
- `document`
- `block`
- `av`
- `file`
- `search`
- `tag`
- `system`
- `flashcard`
- `mascot`

重点覆盖：

- 工具与 action 是否可见
- 基础读写链路是否正常
- 路径与树结构语义是否正确
- 权限拦截是否正确
- 搜索 / 标签 / 系统接口是否正常
- flashcard 的只读发现与条件式写链路
- AV 的读写、搜索、复制链路
- 清理是否完整

---

## 4. 执行前检查

### 4.1 `CLI` 模式检查

必须确认：

- `siyuan-sisyphus` 或 `siyuan` 命令可执行
- 已配置 `apiUrl` / `token`，或用户允许使用 `--url` / `--token`
- 能成功执行：

```bash
siyuan-sisyphus system get-version
```

### 4.2 `MCP` 模式检查

必须确认：

- MCP server 可连接
- 能列出工具
- 能成功执行：

```json
{
  "tool": "system",
  "action": "get_version"
}
```

### 4.3 工具可见性

必须能看到以下工具：

- `notebook`
- `document`
- `block`
- `av`
- `file`
- `search`
- `tag`
- `system`
- `flashcard`
- `mascot`

---

## 5. 核心测试流程

以下流程对 `CLI` 和 `MCP` 完全一致，只是调用入口不同。

### 5.1 system

至少执行：

- `system.get_version`
- `system.get_current_time`
- `system.conf`

### 5.2 notebook

至少执行：

- `notebook.list`
- `notebook.create`
- `notebook.rename`
- `notebook.get_conf`
- `notebook.get_child_docs`
- `notebook.set_open_state`
- `notebook.remove`

### 5.3 document

至少执行：

- `document.create`
- `document.get_path`
- `document.get_hpath`
- `document.get_ids`
- `document.get_child_docs`
- `document.list_tree`
- `document.search_docs`
- `document.get_doc`
- `document.remove`

要求验证：

- `create.path` 使用人类可读路径
- `get_path` 返回存储路径
- `get_child_docs` 只返回直属子项

### 5.4 block

至少执行：

- `block.append`
- `block.prepend`
- `block.insert`
- `block.update`
- `block.get_children`
- `block.get_kramdown`
- `block.get_attrs`
- `block.set_attrs`
- `block.exists`
- `block.info`
- `block.word_count`
- `block.breadcrumb`
- `block.dom`
- `block.delete`

如当前环境稳定，也建议覆盖：

- `block.move`
- `block.set_fold_state`
- `block.transfer_ref`
- `block.batch_insert`
- `block.batch_update`
- `block.recent_updated`

### 5.5 search / tag

至少执行：

- `search.fulltext`
- `search.query_sql`（只测 `SELECT`）
- `search.search_tag`
- `search.get_backlinks` 或 `search.get_backmentions`
- `tag.list`
- `tag.rename`
- `tag.remove`

要求验证：

- 唯一关键字能被全文搜索到
- `query_sql` 非 `SELECT` 语句应被拒绝
- 标签重命名、删除语义正确

### 5.6 file

优先覆盖低风险 action：

- `file.render_template`
- `file.render_sprig`
- `file.export_md`
- `file.get_doc_assets`

`upload_asset` / `export_resources` 仅在本轮确有测试资源且不会动到用户本地文件时执行。

### 5.7 mascot

至少执行：

- `mascot.get_balance`
- `mascot.shop`
- `mascot.buy`（仅当余额足够且安全）

### 5.8 flashcard

优先执行只读链路：

- `flashcard.get_decks`
- `flashcard.list_cards`
- `flashcard.get_cards`

只有已经拿到真实 `deckID` / `cardID` 时，才允许执行：

- `flashcard.add_card`
- `flashcard.review_card`
- `flashcard.skip_review_card`
- `flashcard.remove_card`

---

## 6. AV / 数据库专项规则

### 6.1 本项目当前真实能力边界

截至当前版本，`av` **不能从零创建 brand-new real AV block**。

当前可依赖的能力是：

- 操作现有真实 AV
- `duplicate_block` 复制现有数据库块
- 对已有 AV 做行、列、单元格、搜索、主键读取等操作

所以本轮 AV 测试要按下面三种情况处理：

#### 情况 A：用户提供现有真实 AV

可以执行：

- `get`
- `render_attribute_view`
- `get_attribute_view_keys`
- `get_attribute_view_filter_sort`
- `get_primary_key_values`
- `add_column`
- `add_rows`
- `set_cell`
- `batch_set_cells`
- `search`
- `remove_rows`
- `remove_column`

#### 情况 B：用户未提供现有 AV，但允许基于现有数据库复制

可先执行：

- `duplicate_block`

然后对复制出的测试数据库执行与情况 A 相同的测试，并在结束后删除测试数据库块。

#### 情况 C：既没有现成 AV，也没有可复制来源

则 AV 写操作统一记为 `BLOCKED`，只执行可读检查。

### 6.2 AV 强约束

AI 不得：

- 用 Markdown 表格冒充真实 AV
- 用普通块或 DOM 片段冒充数据库块
- 在没有真实 `rowID` 的情况下伪造 `set_cell` 成功

### 6.3 AV 建议顺序

1. 确认 AV 来源：用户提供 / 复制获得
2. `av.get`
3. `av.render_attribute_view`
4. `av.get_attribute_view_keys`
5. `av.get_primary_key_values`
6. `av.add_column`
7. 创建测试块
8. `av.add_rows`
9. `av.set_cell`
10. `av.batch_set_cells`
11. `av.search`
12. `av.get_attribute_view_filter_sort`
13. `av.remove_rows`
14. `av.remove_column`
15. 如果本轮复制了数据库块，最后删除副本

---

## 7. 权限测试

如当前环境允许，建议对**本轮测试笔记本**做一轮最小权限验证：

1. 读取当前权限配置
2. 改成只读或无权限
3. 验证读/写动作被拒绝
4. 恢复原权限

禁止把用户已有笔记本拿来做破坏性权限测试。

---

## 8. 命名约定

统一使用带时间戳的测试名：

- 测试笔记本：`AI Interface Test <timestamp>`
- 测试文档：`AI Interface Root <timestamp>`
- 测试标签：`#ai-interface-test-<timestamp>#`
- AV 测试列：`AI Text <timestamp>`
- AV 测试值：`AI interface value <timestamp>`

---

## 9. 清理要求

测试结束后必须确认：

1. 删除本轮创建的测试块
2. 删除本轮创建的测试文档
3. 删除本轮创建或复制出的测试 AV / 数据库块
4. 删除本轮新增的 AV 行与列
5. 删除本轮测试标签
6. 恢复测试期间修改过的权限
7. 删除本轮测试笔记本

若清理失败，必须明确列出残留对象，不得谎称“清理完成”。

---

## 10. 最终报告格式

最终报告必须包含：

### 10.1 头信息

- `TEST_MODE=CLI` 或 `TEST_MODE=MCP`
- 测试时间
- 目标版本（如果能获取）

### 10.2 步骤结果表

每一步包含：

- 步骤号
- tool
- action
- `PASS` / `FAIL` / `BLOCKED`
- 关键返回摘要

### 10.3 覆盖矩阵

对每个 action 标记：

- `PASS`
- `FAIL`
- `BLOCKED`
- `MISS`

### 10.4 问题汇总

至少区分：

- 真实缺陷
- 环境限制
- 符合预期

### 10.5 清理结论

- `CLEAN`
- `DIRTY`

---

## 11. 一句话执行提示

可以直接给 AI 这样的指令：

- `请按 AI_INTERFACE_TEST.md，用 CLI 模式完整测试，只测 CLI，不要切到 MCP。`
- `请按 AI_INTERFACE_TEST.md，用 MCP 模式完整测试，只测 MCP，不要切到 CLI。`


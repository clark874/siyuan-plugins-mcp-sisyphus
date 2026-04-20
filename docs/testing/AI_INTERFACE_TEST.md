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
- AV 的创建、读写、搜索、复制链路
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

### 6.1 主测试路径

AV 测试必须由 AI 在本轮测试中**自己创建真实 AV 块**，不得把“复制已有数据库”当作主路径。

标准起手动作必须是：

- `av.render_attribute_view`
- 参数必须包含 `blockID` + `createIfNotExist=true`
- 可省略 `id`，让 MCP/CLI 自动生成 `avID`

创建成功后，必须立即记录两个标识：

- `AV_ID`：返回中的 `avID` / `id`
- `AV_BLOCK_ID`：返回中的 materialized `blockID`

后续所有 AV 写操作都应优先显式携带 `AV_BLOCK_ID` 作为权限上下文，尤其是：

- `add_rows`
- `add_column`
- `remove_rows`
- `remove_column`
- `set_cell`
- `batch_set_cells`

这一步是本项目当前 AV 测试的标准写法，不允许省略。

### 6.2 标准调用链路

AI 必须在自己创建的 AV 上完成以下动作链路：

1. `render_attribute_view`
2. `get`
3. `get_attribute_view_keys`
4. `get_attribute_view_filter_sort`
5. `search`
6. `get_primary_key_values`
7. 创建 3 个普通块，准备绑定为数据库行
8. `add_rows`
9. `add_column`
10. `set_cell`
11. `batch_set_cells`
12. `duplicate_block`
13. `remove_rows`
14. `remove_column`

推荐按以下参数模式执行：

- `render_attribute_view`：创建本轮测试 AV，拿到 `AV_ID` 与 `AV_BLOCK_ID`
- `add_rows`：使用 `avID=AV_ID`、`blockID=AV_BLOCK_ID`、`blockIDs=[...]`
- `add_column`：使用 `avID=AV_ID`、`blockID=AV_BLOCK_ID`
- `set_cell`：使用 `avID=AV_ID`、`blockID=AV_BLOCK_ID`
- `batch_set_cells`：使用 `avID=AV_ID`、`blockID=AV_BLOCK_ID`
- `remove_rows`：使用 `avID=AV_ID`、`blockID=AV_BLOCK_ID`
- `remove_column`：使用 `avID=AV_ID`、`blockID=AV_BLOCK_ID`

### 6.3 通过标准

可以参考下面这组标准结果来判断是否通过：

| 动作 | 通过标准 |
| --- | --- |
| `render_attribute_view` | 成功创建 AV 块，并返回新的 `avID` 与 materialized `blockID` |
| `get` | 能获取完整 AV 结构 |
| `get_attribute_view_keys` | 初始至少返回 `主键(block)`、`单选(select)` 两列 |
| `get_attribute_view_filter_sort` | 能返回当前筛选 / 排序信息；空数组也算通过 |
| `search` | 能正常返回搜索结果或合理的空结果说明 |
| `get_primary_key_values` | 能返回当前主键值列表 |
| `add_rows` | 成功添加 3 行，并在响应中拿到对应 `rowID` |
| `add_column` | 成功新增一列，例如 `备注(text)` |
| `set_cell` | 能成功给第一行写入单元格值 |
| `batch_set_cells` | 能成功批量给多行写入值 |
| `duplicate_block` | 能复制出一个新的 AV 块，并返回新的 `avID` |
| `remove_rows` | 能删除指定测试行 |
| `remove_column` | 能删除本轮新增测试列 |

下面这个实际案例可以作为参考验收结果：

| 动作 | 示例结果 |
| --- | --- |
| `render_attribute_view` | 创建 AV 块成功（示例 `avID: 20260420234836-a2uhpwt`） |
| `get` | 获取到完整 AV 结构，包含 3 行 2 列 |
| `get_attribute_view_keys` | 返回 2 列：主键(block)、单选(select) |
| `get_attribute_view_filter_sort` | 返回空筛选 / 排序 |
| `search` | 搜索 `表格` 返回空，并给出合理提示 |
| `get_primary_key_values` | 返回 3 个主键值：行 1、行 2、行 3 |
| `add_rows` | 成功添加 3 行 |
| `add_column` | 新增 `备注` 列（示例 `keyID: 20260420234938-3ofgulm`） |
| `set_cell` | 第一行备注被设为 `测试备注` |
| `batch_set_cells` | 三行单选列分别设为 `选项A`、`选项B`、`选项C` |
| `duplicate_block` | 复制出一个新的 AV 块（示例 `avID: 20260420234949-753pglm`） |
| `remove_rows` | 删除第三行 |
| `remove_column` | 删除 `备注` 列 |

最终状态的标准描述应类似：

- 原 AV 剩余 2 行
- 保留 2 列：`主键`、`单选`
- 旁边多出一个复制出的 AV 块

### 6.4 AV 强约束

AI 不得：

- 把“复制已有数据库”当作 AV 主测试路径
- 跳过 `render_attribute_view(createIfNotExist=true, blockID=...)` 这一步
- 创建 AV 后不记录 `AV_ID` 与 `AV_BLOCK_ID`
- 在 `add_column`、`set_cell`、`batch_set_cells`、`remove_rows`、`remove_column` 时省略 `blockID`
- 用 Markdown 表格冒充真实 AV
- 用普通块或 DOM 片段冒充数据库块
- 在没有真实 `rowID` 的情况下伪造 `set_cell` / `batch_set_cells` 成功
- 把空结果或提示性结果误判为接口失败，只要返回语义自洽即可

### 6.5 AV 建议顺序

1. 创建本轮测试文档或块，作为 AV 创建目标
2. 执行 `av.render_attribute_view`，带 `createIfNotExist=true`
3. 记录 `AV_ID`
4. 记录 `AV_BLOCK_ID`
5. 执行 `av.get`
6. `av.get_attribute_view_keys`
7. `av.get_attribute_view_filter_sort`
8. `av.search`
9. `av.get_primary_key_values`
10. 创建 3 个测试块
11. `av.add_rows`
12. 从响应中记录真实 `rowID`
13. `av.add_column`
14. `av.set_cell`
15. `av.batch_set_cells`
16. `av.duplicate_block`
17. `av.remove_rows`
18. `av.remove_column`
19. 删除复制出的测试 AV 块
20. 删除原始测试 AV 块

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
- AV 测试名：`AI AV Test <timestamp>`
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

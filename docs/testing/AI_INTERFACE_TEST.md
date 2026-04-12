# SiYuan MCP 接口 AI 测试手册

这是一份**给 AI 执行**的接口测试手册。

请调用 `siyuan-mcp-sisyphus` 进行测试。

目标是让 AI 在尽量少猜测的前提下，对当前 MCP 暴露的 `notebook` / `document` / `block` / `av` / `file` / `search` / `tag` / `system` / `flashcard` / `mascot` 十类工具进行**系统化全量回归测试**，重点覆盖：

- 聚合工具是否正确暴露
- 文档路径语义是否正确
- 树形查询是否正确
- 权限拦截是否有效
- 数据库（AV）读写链路是否正常
- 常见读写操作是否正常
- 搜索与查询功能是否正常
- 标签工具是否正常
- 系统工具是否正常
- 闪卡发现 / 查询 / 复习 / 加删卡链路是否正常
- `mascot` 余额 / 商店 / 购买链路是否正常

---

## 1. 适用范围

本手册适用于当前插件版本的以下能力：

- `notebook(action="get_child_docs")`
- `document(action="get_child_blocks")`
- `document(action="get_child_docs")`
- `block` 工具基于块 / 文档 ID 的权限校验
- `document.get_path` / `document.get_hpath(id=...)` 的读权限校验
- `document.move` 的来源与目标权限校验
- `av` 工具对真实数据库的读取、列操作、行绑定、单元格写入、复制与主键读取
- `search` 工具的全文搜索、SQL、标签搜索、反向链接 / 提及
- `tag` 工具对标签列表、改名、删除的聚合封装
- `system` 工具对系统信息、配置、消息与帮助的聚合封装
- `flashcard` 工具对卡包发现、卡片查询、复习流与加删卡的聚合封装
- `mascot` 工具对余额、商店与购买的聚合封装

---

## 2. AI 执行规则

AI 在执行本手册时，必须遵守以下规则：

1. **只能操作自己创建的测试笔记本和测试文档**，不要改动用户已有内容。
2. 测试笔记本名称统一使用：
   - `AI MCP Interface Test <时间戳>`
3. 每一步都要记录：
   - 调用的 tool
   - 参数
   - 返回结果
   - 是否符合预期
4. 如果某一步失败：
   - 记录 `FAIL`
   - 保留实际返回
   - 在不破坏环境的前提下继续执行后续测试
5. 如果某个 action 没有暴露出来：
   - 记录为 `BLOCKED`
   - 不要伪造结果
6. 高风险删除 / 移动动作，只允许针对**测试过程中创建的对象**执行。
7. 测试结束后必须做清理：
   - 删除测试文档
   - 删除测试笔记本
   - 恢复测试过程中修改过的权限
   - 清理 `av` 测试中新加的行 / 列（如果这些对象确实由测试创建）

### 2.1 AV 特别规则

由于当前 MCP **不能从零创建真实 AV 数据库块**，AI 必须遵守：

1. AI 不得用 Markdown 表格冒充真实 AV。
2. AI 不得声称自己“新建了一个真实数据库”。
3. 如需执行 `av` 写测试，必须由用户事先在 SiYuan 中创建一个真实数据库并把 `providedAvID` 提供给 AI。
4. 如果用户没有提供可访问的真实 AV，则所有依赖该 AV 的写测试统一标记为 `BLOCKED`。
5. `av` 的破坏性修改只允许落在：
   - 用户明确授权用于测试的现有 AV
   - 或该 AV 中由本轮测试新加的列 / 新绑的行
6. 如果 `add_rows` 无法返回或无法推导出真实 **row item ID**，后续 `set_cell` / `batch_set_cells` 必须记为 `FAIL` 或 `BLOCKED`，不得猜测 `rowID`。

### 2.2 flashcard 特别规则

由于 `flashcard` 的部分 action 依赖真实 `deckID` / `cardID`，AI 必须遵守：

1. 优先执行安全的只读发现链路：
   - `flashcard(action="get_decks")`
   - `flashcard(action="list_cards", ...)`
   - `flashcard(action="get_cards", deckID=...)`
2. 只有在本轮测试中已经拿到真实 `deckID` 后，才允许执行 `add_card`。
3. 只有在本轮测试中已经拿到真实 `cardID` 后，才允许执行 `review_card` / `skip_review_card`。
4. `remove_card` 属于删除类高风险动作，只允许移除本轮测试通过 `add_card` 加入到 deck 的测试块。
5. 不得猜测 `deckID` / `cardID`；若环境无法提供，相关步骤统一记为 `BLOCKED`。
6. 不得把 `block(action="set_attrs", attrs={"custom-riff-decks":"..."})` 伪装成 `flashcard` tool 已覆盖；该能力可作为补充说明，但不能替代 `flashcard` action 测试。

### 2.3 状态定义

- `PASS`：已执行且结果符合预期
- `FAIL`：已执行但结果不符合预期
- `BLOCKED`：因环境、权限、前置资源或未暴露 action 无法执行
- `MISS`：本轮没有覆盖到该 action，仅用于最终覆盖矩阵，不得在执行过程中替代 `BLOCKED`

---

## 3. 通过标准

只有同时满足以下条件，才能判定本轮测试通过：

1. `listTools()` 中能看到预期 tool 与 action
2. 树形查询结果符合“**只返回直属子项**”的约定
3. 路径相关接口符合：
   - `create.path` 使用人类可读路径
   - `get_path` 返回存储路径
   - `get_hpath` / `get_ids` 转换正确
4. 权限测试中，被禁止的调用必须返回 `permission_denied`
5. 权限恢复后，读写操作恢复正常
6. 搜索功能正常：全文搜索、SQL 查询、标签搜索、反向链接均可用
7. SQL 安全守卫有效：非 `SELECT` / `WITH` 语句被拒绝
8. 在用户已提供真实 AV 的前提下，`av` 至少完成一轮：
   - 读库
   - 加列
   - 绑行
   - 写单元格
   - 清理测试行 / 测试列
9. `mascot.get_balance` 与 `mascot.shop` 正常；若余额足够则 `buy` 也应可验证
10. `flashcard` 至少完成一轮只读发现；若环境提供真实 `deckID` / `cardID`，则 `get_cards`、`review_card`、`skip_review_card`、`add_card`、`remove_card` 也应按条件验证
11. 清理完成，无遗留测试对象

---

## 4. 执行前检查

### 4.1 工具可见性检查

确认存在以下 10 个聚合工具：

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

说明：

- `system(action="workspace_info")` 默认应为关闭状态时，需要在报告中标记为高风险 action。
- 若默认不可见但手动启用后可用，记为符合预期。

### 4.2 关键 action 检查

确认至少包含以下 action：

#### notebook

- `list`
- `create`
- `open`
- `close`
- `remove`
- `rename`
- `get_conf`
- `set_conf`
- `set_icon`
- `get_permissions`
- `set_permission`
- `get_child_docs`

#### document

- `create`
- `rename`
- `remove`
- `move`
- `get_path`
- `get_hpath`
- `get_ids`
- `get_child_blocks`
- `get_child_docs`
- `set_icon`
- `list_tree`
- `search_docs`
- `get_doc`
- `create_daily_note`

#### block

- `append`
- `prepend`
- `insert`
- `update`
- `delete`
- `move`
- `fold`
- `unfold`
- `get_kramdown`
- `get_children`
- `transfer_ref`
- `set_attrs`
- `get_attrs`
- `exists`
- `info`
- `breadcrumb`
- `dom`
- `recent_updated`
- `word_count`

#### file

- `upload_asset`
- `render_template`
- `render_sprig`
- `export_md`
- `export_resources`

#### tag

- `list`
- `rename`
- `remove`

#### av

- `get`
- `search`
- `add_rows`
- `remove_rows`
- `add_column`
- `remove_column`
- `set_cell`
- `batch_set_cells`
- `duplicate_block`
- `get_primary_key_values`

#### system

- `workspace_info`
- `network`
- `changelog`
- `conf`
- `sys_fonts`
- `boot_progress`
- `push_msg`
- `push_err_msg`
- `get_version`
- `get_current_time`

#### search

- `fulltext`
- `query_sql`
- `search_tag`
- `get_backlinks`
- `get_backmentions`

#### flashcard

- `list_cards`
- `get_decks`
- `get_cards`
- `review_card`
- `skip_review_card`
- `add_card`
- `remove_card`

#### mascot

- `get_balance`
- `shop`
- `buy`

如果缺少任一关键 action，记录 `BLOCKED` 并在最终报告里指出。

### 4.3 十类 tool 权限预热

为了避免 AI 在测试进行到一半时，首次调用某个 tool 才弹出权限确认而卡住，需要在**测试刚开始阶段**主动把 10 个聚合 tool 都至少调用一次。

#### 阶段 A：创建测试对象前先预热能直接调用的 tool

1. `notebook(action="list")`
2. `system(action="get_version")`
3. `search(action="search_tag", k="test")`
4. `tag(action="list")`
5. `flashcard(action="get_decks")`
6. `mascot(action="get_balance")`

#### 阶段 B：创建最小测试对象后再预热依赖对象 ID 的 tool

完成以下最小准备后再继续：

1. 创建测试笔记本，得到 `testNotebookId`
2. 在该笔记本下创建 `/SourceDoc`，得到 `sourceDocId`

然后立即执行：

3. `document(action="get_path", id=sourceDocId)`
4. `block(action="get_children", id=sourceDocId)`
5. `file(action="render_sprig", template="warmup")`
6. `flashcard(action="list_cards", scope="all", filter="due")`
7. 如果用户已提供 `providedAvID`，执行：
   - `av(action="get", id=providedAvID)`
   否则执行：
   - `av(action="search", keyword="test")`

#### 说明

- 这一步的目标是**提前触发 10 个 tool 的权限请求**，不是验证业务功能。
- `document` 与 `block` 的预热**不要**依赖用户已有对象，统一使用测试过程中刚创建的 `sourceDocId`。
- `av` 预热优先使用用户提供的 `providedAvID`；如果还没有该信息，只允许做安全的只读探测。
- `flashcard` 预热优先使用只读 action，不要在预热阶段执行 `review_card` / `add_card` / `remove_card`。
- 这些预热调用本身也要记录进测试日志，但不单独计入正式用例结果。
- 只有在十个 tool 都至少被调用过一次之后，才进入正式测试步骤。

---

## 5. 测试数据约定

AI 需要创建一套固定结构的数据，后续所有测试尽量复用。

### 5.1 测试笔记本

创建一个测试笔记本：

```json
{
  "action": "create",
  "name": "AI MCP Interface Test <timestamp>"
}
```

保存返回的：

- `testNotebookId`

### 5.2 测试文档结构

在该笔记本中创建以下文档：

#### 根级文档

- `/SourceDoc`
- `/TargetDoc`
- `/PathMoveDoc`
- `/DeleteDoc`
- `/RenderDoc`

#### 子文档

- `/TargetDoc/ChildDoc`

创建后保存以下 ID：

- `sourceDocId`
- `targetDocId`
- `pathMoveDocId`
- `deleteDocId`
- `renderDocId`
- `childDocId`

### 5.3 测试块与标签数据

AI 需要在 `SourceDoc` 中额外准备以下内容，供后续测试复用：

- 一个标题块：`# Source`
- 一个普通段落：`seed`
- 一个唯一词：`ai-interface-needle-<timestamp>`
- 一个唯一标签：`#ai-interface-test-<timestamp>#`
- 一个引用源块与一个引用目标块（供 `transfer_ref` / backlink 测试）

保存返回的：

- `tagLabel`
- `refSourceBlockId`
- `refTargetBlockId`

### 5.4 flashcard 测试辅助块

AI 还需要在 `SourceDoc` 中再准备 1～2 个普通块，供 `flashcard.add_card` / `remove_card` 复用，例如：

- `flashcard question seed`
- `flashcard answer seed`

保存返回的：

- `flashcardBlockId1`
- `flashcardBlockId2`

### 5.5 AV 测试辅助块

如果用户已提供 `providedAvID`，AI 还需要在 `SourceDoc` 中再准备 2 个普通段落块，供 `av.add_rows` 绑定为数据库行，例如：

- `av row seed 1`
- `av row seed 2`

保存返回的：

- `avRowBlockId1`
- `avRowBlockId2`

### 5.6 路径与顺序语义约定

后续测试统一以以下约定为准：

- `document.create.path` 使用**人类可读路径**，如 `/SourceDoc`
- `document.get_path` 返回**存储路径**，如 `/xxxxxxxxxxxxxx-xxxxxxx.sy`
- `document.get_hpath` 返回**层级路径**，如 `/SourceDoc`
- `notebook.get_child_docs` 与 `document.get_child_docs` 都只返回**直属子文档**
- `document.get_child_blocks` 与 `block.get_children(docId)` 都只返回**直属子块**

---

## 6. 主流程回归测试

这一组用例构成顺序执行的主流程。若后续补充覆盖章节需要复用结果，应直接引用本章节步骤号。

### T01 - notebook 基础读能力

#### 目标

验证 `notebook` 基本接口可用。

#### 步骤

1. `notebook(action="list")`
2. `notebook(action="get_conf", notebook=testNotebookId)`
3. `notebook(action="open", notebook=testNotebookId)`
4. `notebook(action="close", notebook=testNotebookId)`
5. 再次 `notebook(action="open", notebook=testNotebookId)`

#### 预期

- `list` 返回数组，且包含测试笔记本
- `get_conf` 返回配置对象
- `open` / `close` / 再次 `open` 返回成功

---

### T02 - notebook 权限查询

#### 目标

验证 `notebook.get_permissions` 支持全量 / 单笔记本两种查询，并返回正确格式。

#### 步骤

1. `notebook(action="get_permissions")`
2. `notebook(action="get_permissions", notebook="all")`
3. `notebook(action="get_permissions", notebook=testNotebookId)`
4. `notebook(action="get_permissions", notebook="__missing_notebook__")`

#### 预期

- 第 1、2 步返回包含 `notebooks` 数组
- 两次全量返回中都存在 `id = testNotebookId` 的条目
- 第 3 步返回单对象 `notebook`
- 单对象至少包含：
  - `id`
  - `name`
  - `permission`
- `permission` 必须是以下四种之一：
  - `none`
  - `r`
  - `rw`
  - `rwd`
- 第 4 步返回结构化错误，且错误信息明确说明 notebook 不存在
- 若无论传什么都只返回全量列表，记录为 `FAIL`
- 若返回旧三态值 `readonly` / `write`，记录为 `FAIL`

---

### T03 - notebook 根级子文档查询

#### 目标

验证 `notebook.get_child_docs` 只返回测试笔记本根下直属文档。

#### 步骤

调用：

```json
{
  "action": "get_child_docs",
  "notebook": "<testNotebookId>"
}
```

#### 预期

返回数组，并满足：

- 包含：
  - `sourceDocId`
  - `targetDocId`
  - `pathMoveDocId`
  - `deleteDocId`
- 不包含：
  - `childDocId`

---

### T04 - 文档路径语义：`get_path`

#### 目标

验证文档 ID 到存储路径的转换正确。

#### 步骤

调用：

```json
{
  "action": "get_path",
  "id": "<sourceDocId>"
}
```

#### 预期

返回对象至少包含：

- `notebook = testNotebookId`
- `path` 形如：
  - `/xxxxxxxxxxxxxx-xxxxxxx.sy`

记录该路径为：

- `sourceStoragePath`

---

### T05 - 文档路径语义：`get_hpath`

#### 目标

验证文档 ID / 存储路径到层级路径的转换正确。

#### 步骤

1. 通过 ID 查询：

```json
{
  "action": "get_hpath",
  "id": "<sourceDocId>"
}
```

2. 通过 `notebook + path` 查询：

```json
{
  "action": "get_hpath",
  "notebook": "<testNotebookId>",
  "path": "<sourceStoragePath>"
}
```

#### 预期

两次返回都应为：

- `/SourceDoc`

---

### T06 - 文档路径语义：`get_ids`

#### 目标

验证层级路径到文档 ID 的逆向转换。

#### 步骤

调用：

```json
{
  "action": "get_ids",
  "notebook": "<testNotebookId>",
  "path": "/SourceDoc"
}
```

#### 预期

返回数组：

- 必须包含 `sourceDocId`
- 理想情况下仅包含 `sourceDocId`

---

### T07 - 文档重命名：路径形态

#### 目标

验证 `rename(notebook + path + title)` 正常。

#### 步骤

调用：

```json
{
  "action": "rename",
  "notebook": "<testNotebookId>",
  "path": "<sourceStoragePath>",
  "title": "SourceDoc Path Renamed"
}
```

随后再次调用：

```json
{
  "action": "get_hpath",
  "id": "<sourceDocId>"
}
```

#### 预期

- 重命名成功
- `get_hpath` 返回：
  - `/SourceDoc Path Renamed`

---

### T08 - 文档重命名：ID 形态

#### 目标

验证 `rename(id + title)` 正常。

#### 步骤

调用：

```json
{
  "action": "rename",
  "id": "<sourceDocId>",
  "title": "SourceDoc ID Renamed"
}
```

随后再次检查：

```json
{
  "action": "get_hpath",
  "id": "<sourceDocId>"
}
```

#### 预期

- 重命名成功
- 最终层级路径为：
  - `/SourceDoc ID Renamed`

---

### T09 - document 子文档查询

#### 目标

验证 `document.get_child_docs` 只返回直属子文档。

#### 步骤

调用：

```json
{
  "action": "get_child_docs",
  "id": "<targetDocId>"
}
```

#### 预期

返回数组，并满足：

- 包含 `childDocId`
- 不应包含 `sourceDocId`
- 不应包含其它根级文档

---

### T10 - block 基础写入

#### 目标

在 `SourceDoc` 中构建可验证的块顺序。

#### 步骤

依次执行：

1. 在文档末尾追加：

```json
{
  "action": "append",
  "dataType": "markdown",
  "data": "- doc append",
  "parentID": "<sourceDocId>"
}
```

2. 在文档开头插入：

```json
{
  "action": "prepend",
  "dataType": "markdown",
  "data": "- doc prepend",
  "parentID": "<sourceDocId>"
}
```

3. 在 `append` 生成的块前插入：

```json
{
  "action": "insert",
  "dataType": "markdown",
  "data": "- insert before append",
  "nextID": "<appendBlockId>"
}
```

保存：

- `appendBlockId`
- `prependBlockId`
- `insertBlockId`

#### 预期

三个操作都成功返回块变更结果。

---

### T11 - block 子块顺序查询

#### 目标

验证 `block.get_children(docId)` 顺序正确。

#### 步骤

调用：

```json
{
  "action": "get_children",
  "id": "<sourceDocId>"
}
```

#### 预期

返回块数组，按内容顺序应至少满足：

1. `- doc prepend`
2. `# Source`
3. `seed`
4. `- insert before append`
5. `- doc append`

---

### T12 - document 子块查询

#### 目标

验证 `document.get_child_blocks` 与 `block.get_children(docId)` 一致。

#### 步骤

调用：

```json
{
  "action": "get_child_blocks",
  "id": "<sourceDocId>"
}
```

并与 T11 的结果对比。

#### 预期

- 两者返回的直属子块列表一致
- 顺序一致

---

### T13 - block 更新与属性

#### 目标

验证块更新与属性接口可用。

#### 步骤

1. 更新 `appendBlockId`：

```json
{
  "action": "update",
  "dataType": "markdown",
  "data": "- doc append updated",
  "id": "<appendBlockId>"
}
```

2. 设置属性：

```json
{
  "action": "set_attrs",
  "id": "<appendBlockId>",
  "attrs": {
    "custom-ai-test": "ok"
  }
}
```

3. 读取属性：

```json
{
  "action": "get_attrs",
  "id": "<appendBlockId>"
}
```

#### 预期

- 更新成功
- `get_attrs` 返回中包含：
  - `"custom-ai-test": "ok"`

---

### T14 - block 折叠与展开

#### 目标

验证 `fold` / `unfold` 可执行。

#### 步骤

对 `appendBlockId` 调用：

```json
{
  "action": "fold",
  "id": "<appendBlockId>"
}
```

然后：

```json
{
  "action": "unfold",
  "id": "<appendBlockId>"
}
```

#### 预期

两个调用都返回成功。

---

### T15 - block 移动

#### 目标

验证块移动后顺序变化正确。

#### 步骤

调用：

```json
{
  "action": "move",
  "id": "<insertBlockId>",
  "previousID": "<appendBlockId>",
  "parentID": "<sourceDocId>"
}
```

然后再次调用：

```json
{
  "action": "get_children",
  "id": "<sourceDocId>"
}
```

#### 预期

最终顺序中：

- `- doc append updated`
- `- insert before append`

两者相邻，且 `insert before append` 在后面。

---

### T16 - kramdown 导出

#### 目标

验证 `block.get_kramdown` 能读出更新后的内容。

#### 步骤

调用：

```json
{
  "action": "get_kramdown",
  "id": "<sourceDocId>"
}
```

#### 预期

返回结果中应包含：

- `doc append updated`

---

### T17 - file 与 system 基础接口

#### 目标

验证基础 `file` 与 `system` 接口正常。

#### 步骤

1. `system(action="get_version")`
2. `system(action="get_current_time")`
3. `file(action="render_sprig", template="codex-{{ now | date \"2006\" }}")`
4. `file(action="export_md", id=sourceDocId)`

#### 预期

1. `get_version` 返回 `version`
2. `get_current_time` 返回数字型时间
3. `render_sprig` 返回类似 `codex-2026`
4. `export_md` 返回内容中包含：
   - `/SourceDoc ID Renamed`
   - `doc append updated`

---

### T18 - mascot 基础能力

#### 目标

验证 `mascot` 聚合工具已暴露，且余额 / 商店链路可用。

#### 步骤

1. `mascot(action="get_balance")`
2. `mascot(action="shop")`

保存：

- `mascotBalanceBefore`
- `mascotLifetimeEarnedBefore`
- `mascotShopItems`
- 若商店非空，记录一个最低价格商品的 `cheapestMascotItemId`

#### 预期

- `get_balance` 返回结构化余额信息
- `shop` 返回商品数组
- 商品项至少包含：
  - `item_id`
  - `label`
  - `cost`

---

### T19 - mascot 购买链路

#### 目标

在余额允许时验证 `mascot.buy`。

#### 步骤

1. 如果 `mascotShopItems` 为空，记录 `BLOCKED`
2. 如果 `mascotBalanceBefore < cheapest item cost`，记录 `BLOCKED`
3. 否则执行：
   - `mascot(action="buy", item_id=cheapestMascotItemId)`
4. 再次调用：
   - `mascot(action="get_balance")`

#### 预期

- 若余额不足：本用例记为 `BLOCKED`，并明确说明是余额限制，不是接口失败
- 若执行购买：
  - `buy` 返回结构化成功结果
  - 第二次 `get_balance` 的余额应减少，或返回值能明确表达购买已生效

---

### T20 - 文档移动：ID 形态

#### 目标

验证 `document.move(fromIDs + toID)` 正常。

#### 步骤

调用：

```json
{
  "action": "move",
  "fromIDs": ["<deleteDocId>"],
  "toID": "<targetDocId>"
}
```

#### 预期

- 返回成功
- 随后再次用 `document.get_path(id=deleteDocId)`，确认其路径已进入 `TargetDoc` 目录下

---

### T21 - 文档移动：路径形态

#### 目标

验证 `document.move(fromPaths + toNotebook + toPath)` 正常。

#### 步骤

1. 获取 `pathMoveDocId` 的存储路径，记为 `pathMoveStoragePath`
2. 获取 `targetDocId` 的存储路径，记为 `targetStoragePath`
3. 调用：

```json
{
  "action": "move",
  "fromPaths": ["<pathMoveStoragePath>"],
  "toNotebook": "<testNotebookId>",
  "toPath": "<targetStoragePath>"
}
```

4. 再次调用：

```json
{
  "action": "get_path",
  "id": "<pathMoveDocId>"
}
```

#### 预期

- 移动成功
- 新路径应位于 `TargetDoc` 下面

---

## 7. 权限回归测试

这一部分是本次改动的重点，必须执行。

### 7.1 权限错误结构统一要求

所有权限拒绝都应返回结构化错误，至少满足：

```json
{
  "error": {
    "type": "permission_denied",
    "notebook": "<testNotebookId>",
    "current_permission": "<当前权限>",
    "required_permission": "<read|write|delete>"
  }
}
```

允许 `message` 文本有细微差异，但 `type`、`current_permission`、`required_permission` 必须正确。

### T22 - `r` 权限下允许读、禁止写删

#### 目标

验证测试笔记本设为 `r` 后：

- 读操作允许
- 写操作被拦截
- 删除操作被拦截

#### 步骤

先设置：

```json
{
  "action": "set_permission",
  "notebook": "<testNotebookId>",
  "permission": "r"
}
```

读操作示例：

1. `notebook.get_conf`
2. `notebook.get_child_docs`
3. `document.get_path(id=sourceDocId)`
4. `document.get_hpath(id=sourceDocId)`
5. `document.get_child_docs(id=targetDocId)`
6. `document.get_child_blocks(id=sourceDocId)`
7. `block.get_children(id=sourceDocId)`
8. `block.get_kramdown(id=sourceDocId)`
9. `block.get_attrs(id=appendBlockId)`

写操作示例：

10. `document.create`
11. `document.rename(id=sourceDocId, ...)`
12. `document.move(fromIDs=[pathMoveDocId], toID=targetDocId)`
13. `block.append(parentID=sourceDocId, ...)`
14. `block.update(id=appendBlockId, ...)`
15. `block.move(id=insertBlockId, ...)`
16. `block.fold(id=appendBlockId)`
17. `block.unfold(id=appendBlockId)`

删除操作示例：

18. `document.remove(id=deleteDocId)`
19. `block.delete(id=appendBlockId)`
20. `notebook.remove(notebook=testNotebookId)`

#### 预期

- 读操作都应成功
- 写操作都应失败，且 `required_permission = write`
- 删除操作都应失败，且 `required_permission = delete`

---

### T23 - `rw` 权限下允许读写、禁止删除

#### 目标

验证测试笔记本设为 `rw` 后：

- 读操作允许
- 普通写操作允许
- 删除操作被拦截

#### 步骤

先设置：

```json
{
  "action": "set_permission",
  "notebook": "<testNotebookId>",
  "permission": "rw"
}
```

复用 T22 中相同的一组读 / 写 / 删除动作进行验证。

#### 预期

- 读操作都应成功
- 普通写操作都应成功
- 删除操作都应失败，且：
  - `current_permission = rw`
  - `required_permission = delete`

---

### T24 - `none` 权限下禁止读写删

#### 目标

验证测试笔记本设为 `none` 后，读写删除都会被拦截。

#### 步骤

先设置：

```json
{
  "action": "set_permission",
  "notebook": "<testNotebookId>",
  "permission": "none"
}
```

复用 T22 中相同的一组读 / 写 / 删除动作进行验证。

#### 预期

- 读操作都应失败，且：
  - `current_permission = none`
  - `required_permission = read`
- 写操作都应失败，且：
  - `current_permission = none`
  - `required_permission = write`
- 删除操作都应失败，且：
  - `current_permission = none`
  - `required_permission = delete`

---

### T25 - `rwd` 权限下允许读写删

#### 目标

验证测试笔记本设为 `rwd` 后：

- 读操作允许
- 写操作允许
- 删除操作允许

#### 步骤

调用：

```json
{
  "action": "set_permission",
  "notebook": "<testNotebookId>",
  "permission": "rwd"
}
```

随后至少执行一组读操作、一组写操作和一组删除操作验证恢复成功，例如：

读操作：

```json
{
  "action": "get_path",
  "id": "<sourceDocId>"
}
```

```json
{
  "action": "get_children",
  "id": "<sourceDocId>"
}
```

写操作：

```json
{
  "action": "append",
  "dataType": "markdown",
  "data": "- permission restored",
  "parentID": "<sourceDocId>"
}
```

删除操作：

```json
{
  "action": "delete",
  "id": "<tempBlockId>"
}
```

#### 预期

- 设置成功
- 读操作成功，返回正常数据
- 追加成功
- 删除成功
- 如继续执行 `document.create` / `document.rename` / `document.remove` / `block.update` / `block.delete`，也应恢复成功

---

### T26 - 权限状态切换与恢复复核

#### 目标

验证权限状态在 `r -> rw -> none -> rwd` 的切换过程中立即生效，且恢复后不会残留上一状态的拦截行为。

#### 步骤

按顺序执行：

1. 设置为 `r`，验证一条读成功、一条写失败、一条删失败
2. 设置为 `rw`，验证一条读成功、一条写成功、一条删失败
3. 设置为 `none`，验证一条读失败、一条写失败、一条删失败
4. 设置为 `rwd`，验证一条读成功、一条写成功、一条删成功

#### 预期

- 每次 `set_permission` 之后，新权限立即生效
- 不需要重启插件或重新创建对象
- 恢复到 `rwd` 后，不再残留任何来自 `r` / `rw` / `none` 的错误拦截

---

## 8. 搜索功能测试

### T27 - 全文搜索

#### 目标

验证 `search.fulltext` 能搜索到测试文档中的内容。

#### 步骤

调用：

```json
{
  "action": "fulltext",
  "query": "ai-interface-needle-<timestamp>"
}
```

#### 预期

- 返回对象包含 `blocks` 数组
- 返回对象包含 `matchedBlockCount`（数字）
- 搜索结果中应包含 `SourceDoc` 文档中的匹配块

---

### T28 - SQL 查询与安全守卫

#### 目标

验证 `search.query_sql` 能执行 SQL 查询，并拒绝非 `SELECT` 语句。

#### 步骤

1. 合法查询：

```json
{
  "action": "query_sql",
  "stmt": "SELECT * FROM blocks WHERE content LIKE '%ai-interface-needle-%' LIMIT 5"
}
```

2. 非法查询（应被拒绝）：

```json
{
  "action": "query_sql",
  "stmt": "DROP TABLE blocks"
}
```

#### 预期

- 合法查询返回数组，且包含匹配的块数据
- 非法查询返回错误，包含 `Only SELECT and WITH (CTE) statements are allowed` 或等价提示

---

### T29 - 标签搜索

#### 目标

验证 `search.search_tag` 能返回标签列表。

#### 步骤

调用：

```json
{
  "action": "search_tag",
  "k": "ai-interface-test"
}
```

#### 预期

- 返回对象包含 `tags` 数组
- 返回对象包含 `k` 字段
- 搜索结果中能匹配到 `tagLabel` 或其前缀

---

### T30 - 反向链接与反向提及

#### 目标

验证 `search.get_backlinks` 和 `search.get_backmentions` 能查询给定块的引用关系。

#### 步骤

1. 查询反向链接：

```json
{
  "action": "get_backlinks",
  "id": "<sourceDocId>"
}
```

2. 查询反向提及：

```json
{
  "action": "get_backmentions",
  "id": "<sourceDocId>"
}
```

#### 预期

- `get_backlinks` 返回对象包含 `backlinks` 数组和 `backmentions` 数组
- `get_backmentions` 返回对象包含 `backmentions` 数组
- 两个调用都应成功，即使结果为空数组

---

## 9. 全量覆盖补充测试

本章节只负责**补齐主流程尚未明确覆盖的 action**。如果前面某一步已经自然覆盖某个 action，必须在补充测试记录里明确写“已由 Txx 覆盖”，不需要重复执行。

### T31 - notebook 补充动作

#### 目标

覆盖 `set_conf` / `set_icon` / `rename` / `remove` 的完整链路。

#### 步骤

1. `notebook(action="set_icon", notebook=testNotebookId, icon="1f4d4")`
2. 读取 `get_permissions` 或 `list`，确认笔记本仍可见
3. `notebook(action="set_conf", notebook=testNotebookId, conf={ "name": "AI MCP Interface Test <timestamp> Updated" })`
4. `notebook(action="rename", notebook=testNotebookId, name="AI MCP Interface Test <timestamp> Final")`
5. `remove` 由清理阶段覆盖，并在最终报告中引用清理结果

#### 预期

- `set_icon` / `set_conf` / `rename` 均成功
- 笔记本始终可正常读取
- `remove` 在清理阶段成功或被明确记录为 `FAIL`

---

### T32 - document 补充动作

#### 目标

覆盖 `set_icon` / `list_tree` / `search_docs` / `get_doc` / `create_daily_note`，并验证树深度与长文档渐进披露。

#### 步骤

1. `document(action="set_icon", id=targetDocId, icon="1f4c4")`
2. `document(action="list_tree", notebook=testNotebookId, path="/")`
3. `document(action="list_tree", notebook=testNotebookId, path="/", maxDepth=0)`
4. `document(action="search_docs", notebook=testNotebookId, query="TargetDoc")`
5. `document(action="get_doc", id=sourceDocId)`
6. `document(action="get_doc", id=<workspace 内已知较长文档 ID>, mode="markdown", page=1, pageSize=8000)`
7. 若第 6 步返回 `pageCount > 1`，继续 `document(action="get_doc", id=<同一文档ID>, mode="markdown", page=2, pageSize=8000)`
8. `document(action="create_daily_note", notebook=testNotebookId)`

#### 预期

- `set_icon` 成功
- `list_tree` 返回树中包含 `TargetDoc` 与 `ChildDoc`
- `list_tree(maxDepth=0)` 会折叠更深层节点；若节点有子项，应出现 `childCount` 与 `childrenTruncated`
- `search_docs` 返回结果中包含 `TargetDoc`
- `get_doc(mode="markdown")` 返回 Markdown 文本与元数据；`mode="html"` 若可用，应返回 HTML 视图载荷
- 对长文档调用 `get_doc(mode="markdown")` 时，若内容超过阈值，应返回：
  - `truncated = true`
  - `contentLength`
  - `showing`
  - `page`
  - `pageSize`
  - `pageCount`
  - 引导使用 `get_child_blocks` / `get_kramdown` 的 `hint`
- 若 `pageCount > 1`，第 7 步应能拿到不同于第一页的后续内容
- `create_daily_note` 返回日记文档；若当天已存在则返回已有文档

说明：

- “较长文档 ID”可先通过 `search.query_sql` 在工作区中查找总长度较大的文档，再读取其中一个只读文档；不要为此修改用户数据。

---

### T33 - block 补充读接口

#### 目标

覆盖 `exists` / `info` / `breadcrumb` / `dom` / `recent_updated` / `word_count`。

#### 步骤

1. `block(action="exists", id=appendBlockId)`
2. `block(action="info", id=appendBlockId)`
3. `block(action="breadcrumb", id=appendBlockId)`
4. `block(action="dom", id=appendBlockId)`
5. `block(action="recent_updated")`
6. `block(action="word_count", ids=[sourceDocId, appendBlockId])`

#### 预期

- `exists` 返回 `true`
- `info` 返回块所属根文档信息
- `breadcrumb` 返回非空路径
- `dom` 返回渲染后的 HTML / DOM 文本
- `recent_updated` 返回最近更新块列表，且应能看到测试块或测试文档相关块
- `word_count` 返回统计结果，且总数大于 `0`

---

### T34 - block 引用转移

#### 目标

覆盖 `transfer_ref`。

#### 步骤

1. 在 `SourceDoc` 中确认存在：
   - `refTargetBlockId`：被引用块
   - `refSourceBlockId`：包含对 `refTargetBlockId` 的块引用
2. 再创建另一个块 `refTargetBlockId2`
3. 调用：

```json
{
  "action": "transfer_ref",
  "fromID": "<refTargetBlockId>",
  "toID": "<refTargetBlockId2>"
}
```

#### 预期

- 调用成功
- 原先引用 `refTargetBlockId` 的位置被转移到 `refTargetBlockId2`
- 若工具返回受影响块列表，应记录下来

---

### T35 - file 全量覆盖

#### 目标

覆盖 `upload_asset` / `render_template` / `render_sprig` / `export_md` / `export_resources`。

#### 步骤

1. 准备一个极小文本文件，例如内容为 `ai-interface-test`
2. 直接传本地文件路径：

```json
{
  "action": "upload_asset",
  "assetsDirPath": "/assets/",
  "localFilePath": "<local-file-path>"
}
```

3. 若文件大于配置阈值（默认 `10 MB`），第一次调用应被中止；只有在获得用户明确同意后，才允许使用：

```json
{
  "action": "upload_asset",
  "assetsDirPath": "/assets/",
  "localFilePath": "<local-file-path>",
  "confirmLargeFile": true
}
```

4. `file(action="render_template", id=sourceDocId, path="<workspace-template-path>")`
   - 若当前环境没有可安全使用的模板文件，记录 `BLOCKED`
5. `file(action="render_sprig", template="hello-{{ `codex` | upper }}")`
6. `file(action="export_md", id=sourceDocId)`
7. `file(action="export_resources", paths=["<uploadedAssetPath>"])`

#### 预期

- `upload_asset` 成功并返回资源路径
- 若文件大于配置阈值且未传 `confirmLargeFile=true`，必须返回“停止当前操作并询问用户”的结构化结果
- `render_template` 成功返回渲染内容，或在模板文件不存在时记录 `BLOCKED`
- `render_sprig` 成功返回 `hello-CODEX`
- `export_md` 成功返回 Markdown
- `export_resources` 成功返回 ZIP 导出结果

---

### T36 - tag 全量覆盖

#### 目标

覆盖 `list` / `rename` / `remove`。

#### 步骤

1. 先用 `tag(action="list")` 确认存在 `tagLabel`
2. `tag(action="rename", oldLabel=tagLabel, newLabel="ai-interface-test-renamed-<timestamp>")`
3. 再次 `tag(action="list")` 验证新标签存在
4. `tag(action="remove", label="ai-interface-test-renamed-<timestamp>")`
5. 再次 `tag(action="list")` 验证该标签已删除

#### 预期

- `list` 可正常返回标签
- `rename` 成功，原标签被替换
- `remove` 成功，标签不再出现

---

### T37 - system 全量覆盖

#### 目标

覆盖 `workspace_info` / `network` / `changelog` / `conf` / `sys_fonts` / `boot_progress` / `push_msg` / `push_err_msg` / `get_version` / `get_current_time` / `help`。

#### 步骤

依次执行：

1. `system(action="help")`
2. `file(action="help")`
3. `document(action="help")`
4. `search(action="help")`
5. `system(action="workspace_info")`
6. `system(action="network")`
7. `system(action="changelog")`
8. `system(action="conf")`
9. `system(action="conf", mode="get", keyPath="conf.appearance.mode")`
10. `system(action="conf", mode="get", keyPath="conf.langs[0]")`
11. `system(action="sys_fonts")`
12. `system(action="boot_progress")`
13. `system(action="push_msg", msg="AI interface test message")`
14. `system(action="push_err_msg", msg="AI interface test error")`
15. `system(action="get_version")`
16. `system(action="get_current_time")`

#### 预期

- `help` 伪 action 返回分层结构，至少包含：
  - `commonActions`
  - `advancedActions`
  - `actions`
  - `guidance`
- `workspace_info` 返回工作区元数据
- `network` / `conf` 返回已脱敏信息
- `conf` 的 summary 顶层能看到 `conf` / `isPublish` / `start`
- `conf(mode="get")` 只有使用 `conf.` 前缀路径时才应成功
- `sys_fonts` 返回字体列表
- `push_msg` / `push_err_msg` 返回成功，且不会中断后续测试
- `get_version` / `get_current_time` 返回结构化字段
- 如 `system(action="conf", mode="get", keyPath="appearance.themeMode")` 这类旧示例仍出现在返回 hint 或 help 中，记录为 `FAIL`

---

### T38 - flashcard 全量覆盖

#### 目标

覆盖 `list_cards` / `get_decks` / `get_cards` / `review_card` / `skip_review_card` / `add_card` / `remove_card`。

#### 步骤

1. `flashcard(action="get_decks")`
2. 记录一个可安全使用的 `deckID` 为 `testDeckID`
   - 如果没有任何 deck，记录后续依赖 deck 的步骤为 `BLOCKED`
3. `flashcard(action="list_cards", scope="all", filter="due")`
4. 如果已有 `testDeckID`，执行：
   - `flashcard(action="list_cards", scope="deck", deckID=testDeckID, filter="due")`
   - `flashcard(action="list_cards", scope="deck", deckID=testDeckID, filter="new")`
   - `flashcard(action="list_cards", scope="deck", deckID=testDeckID, filter="old")`
   - `flashcard(action="get_cards", deckID=testDeckID, page=1, pageSize=32)`
5. 如果 `testNotebookId` 已知，执行：
   - `flashcard(action="list_cards", scope="notebook", notebook=testNotebookId, filter="due")`
6. 如果 `sourceDocId` 已知，执行：
   - `flashcard(action="list_cards", scope="tree", rootID=sourceDocId, filter="due")`
7. 如果已有 `testDeckID` 且已准备 `flashcardBlockId1`，执行：
   - `flashcard(action="add_card", deckID=testDeckID, blockIDs=[flashcardBlockId1])`
8. 第 7 步成功后，再次执行：
   - `flashcard(action="get_cards", deckID=testDeckID, page=1, pageSize=64)`
   - 尝试定位与 `flashcardBlockId1` 对应的 `cardID`，记为 `testCardID`
9. 如果已拿到 `testCardID`，执行：
   - `flashcard(action="review_card", deckID=testDeckID, cardID=testCardID, rating=3)`
   - `flashcard(action="skip_review_card", deckID=testDeckID, cardID=testCardID)`
   否则将这两步记录为 `BLOCKED`
10. 如果第 7 步成功，执行：
    - `flashcard(action="remove_card", deckID=testDeckID, blockIDs=[flashcardBlockId1])`
11. 再次执行 `flashcard(action="get_cards", deckID=testDeckID, page=1, pageSize=64)` 复核移除效果

#### 预期

- `get_decks` 返回结构化 deck 列表，能发现可用 `deckID`
- `list_cards` 返回结构化结果，且包含：
  - `action`
  - `scope`
  - `filter`
  - `cards`
- 当 `filter="new"` 时，返回结果应仅包含新卡状态；当 `filter="old"` 时，应仅包含旧卡状态；若为空也应返回空数组而不是报错
- `get_cards` 返回：
  - `cards`
  - `total`
  - `pageCount`
  - `page`
- `add_card` / `remove_card` 返回结构化 `result`，且效果能被后续 `get_cards` 侧面验证
- 只有在已拿到真实 `cardID` 时，`review_card` / `skip_review_card` 才执行；否则必须记为 `BLOCKED`
- 不得猜测 `deckID` / `cardID`
- `remove_card` 只允许作用于本轮测试加入的 `flashcardBlockId1`

---

### T39 - help 与渐进披露补充

#### 目标

验证 `help` 伪 action、结果截断与分页提示都已生效。

#### 步骤

1. `search(action="help")`
2. `block(action="help")`
3. 通过 `search(action="query_sql", stmt="SELECT id, content, type, updated FROM blocks ORDER BY updated DESC LIMIT 80")` 验证 SQL 截断
4. 通过 `search(action="fulltext", query="测试", page=1, pageSize=100)` 验证全文搜索截断
5. 对一个子块较多的文档或块执行 `block(action="get_children", id=..., page=1, pageSize=50)` 验证子块分页
6. 若返回 `pageCount > 1`，继续执行 `block(action="get_children", id=..., page=2, pageSize=50)`

#### 预期

- `help` 返回里，basic / advanced action 有清晰分层
- SQL 查询在结果较大时返回：
  - `truncated = true`
  - `showing = 50`
  - `total`
  - `hint` 中提示 `LIMIT/OFFSET`
- 全文搜索在结果较大时返回：
  - `truncated = true`
  - `showing = 20`
  - `total`
  - `paginationHint`
- `block.get_children` 在结果较大时返回：
  - `children`
  - `totalChildren`
  - `page`
  - `pageSize`
  - `pageCount`
  - `showing`
  - `truncated = true`
  - 引导读取局部内容的 `hint`
- 若 `pageCount > 1`，第 6 步应返回与第一页不同的子块切片

---

### T40 - av 只读能力

#### 目标

验证 `av` 工具已暴露，且在用户提供真实 AV 时可安全读取。

#### 步骤

1. `av(action="search", keyword="test")`
2. 如果已有 `providedAvID`，执行：
   - `av(action="get", id=providedAvID)`
   - `av(action="get_primary_key_values", avID=providedAvID)`

#### 预期

- `search` 返回结构化结果；即使为空，也应有明确字段表示搜索结果
- 如果已有 `providedAvID`：
  - `get` 返回完整 AV payload
  - `get_primary_key_values` 返回库名、主键或行值结构
- 如果没有 `providedAvID`：
  - 只读探测完成后，将依赖真实 AV 的后续用例标记为 `BLOCKED`

---

### T41 - av 写链路（需用户先提供真实 AV）

#### 目标

验证现有真实 AV 的最小可写链路：加列、绑行、写值、清理。

#### 前置条件

- 用户已提供 `providedAvID`
- 已准备 `avRowBlockId1` / `avRowBlockId2`
- AI 仅修改本轮新加的测试列和新绑定的测试行

#### 步骤

1. `av(action="add_column", avID=providedAvID, keyName="AI Test Text <timestamp>", keyType="text")`
2. 记录返回中的测试列标识为 `avTestColumnID`
3. `av(action="add_rows", avID=providedAvID, blockIDs=[avRowBlockId1, avRowBlockId2])`
4. 从 `add_rows` 返回或随后 `av.get` 结果中，记录两条测试行的 `row item ID`：
   - `avTestRowID1`
   - `avTestRowID2`
5. `av(action="set_cell", avID=providedAvID, rowID=avTestRowID1, columnID=avTestColumnID, valueType="text", text="hello av")`
6. `av(action="batch_set_cells", avID=providedAvID, items=[...])`
7. 视情况执行一次 `av(action="get", id=providedAvID)` 复核写入结果
8. `av(action="remove_rows", avID=providedAvID, srcIDs=[avRowBlockId1, avRowBlockId2])`
9. `av(action="remove_column", avID=providedAvID, keyID=avTestColumnID)`

#### 预期

- `add_column` 成功，且能拿到可继续写入的列标识
- `add_rows` 成功，且能解析出 `row item ID`
- `set_cell` / `batch_set_cells` 成功
- 清理时测试行和测试列都能删除

#### 特别判定规则

- 如果 `add_rows` 只返回 source block ID，或无法解析 row item ID，则后续写单元格步骤记为 `FAIL` 或 `BLOCKED`，不得猜测 ID
- `rowID` 只能使用 AV 行项 ID，不能误用：
  - source block ID
  - cell value ID
- 如果用户未提供 `providedAvID`，整个用例组统一为 `BLOCKED`

---

### T42 - av 复制能力

#### 目标

验证 `duplicate_block` 是否按内核真实语义返回“已准备好的复制结果”。

#### 步骤

1. 若未提供 `providedAvID`，记录 `BLOCKED`
2. 否则执行：
   - `av(action="duplicate_block", avID=providedAvID)`
3. 若本轮只验证 prepare-only 语义，则记录返回中的：
   - `duplicatedAvID`
   - `duplicatedBlockID`
   - `prepared`
   - `semantics`
4. 若本轮要验证“复制并插入”，则调用：
   - `av(action="duplicate_block", avID=providedAvID, previousID=refSourceBlockId)`
5. 对插入模式，继续验证：
   - `block(action="exists", id=duplicatedBlockID)`
   - `av(action="get", id=duplicatedAvID)`
6. **不要**把 prepare-only 模式下返回的 `duplicatedBlockID` 直接当成“已经存在的可读块”作为通过条件

#### 预期

- 返回结构必须明确表达这是“内核已准备好的复制结果”
- 返回中至少应包含：
  - 新 `avID`
  - 未来将使用的 `blockID`
  - `prepared = true`
  - 类似 `kernel_prepared_duplicate` 的语义标记
- 不要求 `duplicatedBlockID` 在当前时刻已存在
- 当传入 `previousID` 时，应改为完整复制插入语义，并满足：
  - 新 `duplicatedBlockID` 已存在
  - 新 `duplicatedAvID` 可读
  - 返回类似 `duplicated_and_inserted` 的语义标记
- 如果 MCP 仍把“块尚未物化”误报为失败，记录为 `FAIL`

---

### T43 - 设置页补充检查（仅限 `file.upload_asset` 相关）

#### 目标

验证插件设置页里 `Files` 分组的上传资产配置联动，不把它与 MCP 主流程混在一起。

#### 步骤

1. 打开插件设置页，切到 `📁 Files`
2. 确认 `Upload Asset` 默认启用，且右侧默认不显示重复的阈值说明文案
3. 关闭 `Upload Asset`：
   - 阈值数字输入框应隐藏
4. 再启用 `Upload Asset`：
   - 开关、数字输入框、`MB` 单位应处于同一视觉组
   - 数字输入框前不应有明显多余空白
   - 数字输入框应为紧凑宽度，不再是默认长输入框
5. 依次输入 `0`、`1.9`、`9999`，保存后重开设置页：
   - 最终值应分别规范化为 `1`、`1`、`1024`
6. 输入一个正常值（如 `25`），保存后重开设置页：
   - 阈值应保持为 `25`

#### 预期

- 设置联动正确
- 输入规范化正确
- 不应影响 `file.upload_asset` 的接口测试结论

---

### T44 - 权限覆盖矩阵复核

#### 目标

确认所有带权限约束的 action 至少被测到一次。

#### 检查要求

最终报告必须额外给出一张覆盖矩阵，逐项标记下列 action 是否已被验证：

- `notebook`：`open` `close` `get_conf` `set_conf` `set_icon` `get_child_docs` `get_permissions` `set_permission` `rename` `remove`
- `document`：`create` `rename` `remove` `move` `get_path` `get_hpath` `get_ids` `get_child_blocks` `get_child_docs` `set_icon` `list_tree` `search_docs` `get_doc` `create_daily_note`
- `block`：`insert` `prepend` `append` `update` `delete` `move` `fold` `unfold` `get_kramdown` `get_children` `transfer_ref` `set_attrs` `get_attrs` `exists` `info` `breadcrumb` `dom` `recent_updated` `word_count`
- `av`：`get` `search` `add_rows` `remove_rows` `add_column` `remove_column` `set_cell` `batch_set_cells` `duplicate_block` `get_primary_key_values`
- `file`：`upload_asset` `render_template` `render_sprig` `export_md` `export_resources`
- `search`：`fulltext` `query_sql` `search_tag` `get_backlinks` `get_backmentions`
- `tag`：`list` `rename` `remove`
- `system`：`workspace_info` `network` `changelog` `conf` `sys_fonts` `boot_progress` `push_msg` `push_err_msg` `get_version` `get_current_time`
- `flashcard`：`list_cards` `get_decks` `get_cards` `review_card` `skip_review_card` `add_card` `remove_card`
- `mascot`：`get_balance` `shop` `buy`

如果某项未覆盖，必须明确标记为 `MISS`，不能默认算通过。

---

## 10. 清理步骤

AI 必须清理自己创建的数据。

### 建议清理顺序

1. 如果权限不是 `rwd`，先恢复为 `rwd`
2. 如果执行过 `av` 写测试，先删除测试过程中新增的 AV 行 / 列
3. 删除测试过程中新增的块（如有必要）
4. 删除测试文档
5. 删除测试笔记本

### 最低要求

至少确保：

- 测试笔记本被删除
- 没有遗留测试文档

---

## 11. 最终报告模板

AI 完成测试后，必须输出如下结构的报告。

### 11.1 总结

- 测试时间
- 测试目标
- 总体结果：`PASS` / `FAIL` / `PARTIAL`

### 11.2 环境信息

- SiYuan 版本
- 可见工具列表
- 是否看到了：
  - `notebook.get_child_docs`
  - `document.get_child_blocks`
  - `document.get_child_docs`
  - `av.get`
  - `av.add_rows`
  - `search.fulltext`
  - `search.query_sql`
  - `tag.list`
  - `system.workspace_info`
  - `flashcard.get_decks`
  - `flashcard.get_cards`
  - `mascot.get_balance`

### 11.3 主流程结果

按如下格式逐条列出：

- `T01 PASS` - 原因
- `T02 PASS` - 原因
- `T03 FAIL` - 实际返回 xxx，预期 yyy

### 11.4 补充覆盖结果

- `T31 PASS/BLOCKED/FAIL` - 原因
- 已由前文覆盖的 action，要写明引用的 `Txx`

### 11.5 关键结论

必须明确回答以下问题：

1. `notebook.get_child_docs` 是否只返回直属子文档？
2. `document.get_child_docs` 是否只返回直属子文档？
3. `document.get_child_blocks` 是否与 `block.get_children(docId)` 一致？
4. `r` 下读操作是否允许？
5. `r` 下写操作是否被拦截？
6. `r` 下删除操作是否被拦截？
7. `rw` 下读操作是否允许？
8. `rw` 下普通写操作是否允许？
9. `rw` 下删除操作是否被拦截？
10. `none` 下读操作是否被拦截？
11. `none` 下写操作是否被拦截？
12. `none` 下删除操作是否被拦截？
13. `rwd` 下读操作是否恢复正常？
14. `rwd` 下写操作是否恢复正常？
15. `rwd` 下删除操作是否恢复正常？
16. 权限在 `r -> rw -> none -> rwd` 切换后是否立即生效？
17. `document.get_path` 是否已受读权限保护？
18. `block` 工具是否已不再通过“把块 ID 当文档 ID”导致权限漏检？
19. `search.fulltext` 是否能正常搜索内容？
20. `search.query_sql` 是否拒绝非 `SELECT` 语句？
21. `search.get_backlinks` / `search.get_backmentions` 是否正常返回？
22. `tag.list` / `tag.rename` / `tag.remove` 是否正常？
23. `system` 工具全部 action 是否可正常返回？
24. `file.upload_asset` / `file.render_template` / `file.export_resources` 是否正常？
25. 在用户已提供真实 AV 的前提下，`av.get` / `add_column` / `add_rows` / `set_cell` / `batch_set_cells` / `remove_rows` / `remove_column` 是否正常？
26. `av.duplicate_block` 是否返回了可解释、可继续追踪的结果？
27. `flashcard.get_decks` / `list_cards` / `get_cards` 是否正常？
28. 若环境能提供真实 `cardID`，`flashcard.review_card` / `skip_review_card` 是否正常？
29. 若环境能提供真实 `deckID`，`flashcard.add_card` / `remove_card` 是否正常？
30. `mascot.get_balance` / `shop` 是否正常？
31. 若余额足够，`mascot.buy` 是否正常？
32. 是否所有已暴露 action 都至少测试到一次？

### 11.6 覆盖矩阵

必须输出按 tool 分组的 action 覆盖矩阵：

- `PASS`：已执行且结果符合预期
- `FAIL`：已执行但结果不符合预期
- `BLOCKED`：环境限制导致无法执行
- `MISS`：本轮未覆盖到

### 11.7 遗留问题

如果有异常，必须列出：

- 失败步骤
- 调用参数
- 实际返回
- 推测原因

### 11.8 最终 Bug 列表（必须放在报告最后）

在整份最终报告的**最后**，必须单独输出一个 `Bug 列表` 小节，用来汇总所有接口设计或返回语义问题。

以下情况即使测试步骤本身“功能上成功”，也必须记入 bug：

- 成功后返回 `null`
- 成功后只返回空字符串、空数组、空对象，且**不足以表达操作是否成功**
- 返回内容语义过弱，容易让模型误判为失败、未执行或无结果
- 文档说明与真实返回值不一致

每条 bug 至少包含：

- 对应步骤号 / action
- 调用参数摘要
- 实际返回
- 为什么这属于“无意义返回”或“易误解返回”
- 建议的期望返回形式

对于“返回 `null` 等无意义内容”，不要因为功能验证通过就省略，必须在**最终报告最后**明确写出。

---

## 12. 建议给 AI 的执行提示词

可以直接把下面这段提示词连同本文件一起交给 AI：

> 请严格按照 `AI_INTERFACE_TEST.md` 执行 SiYuan MCP 接口测试。  
> 只允许操作你自己创建的测试笔记本和测试文档。  
> 如果要测试 `av` 写链路，必须要求用户先提供一个现成的真实数据库 `avID`；不允许把 Markdown 表格当数据库。  
> 如果要测试 `flashcard.review_card` / `skip_review_card` / `add_card` / `remove_card`，必须先通过安全的只读步骤拿到真实 `deckID` / `cardID`；拿不到就标记为 `BLOCKED`，不允许猜测。  
> 每一步都要记录调用参数、返回结果、预期结果和 PASS/FAIL。  
> 如果某一步失败，保留现场并继续执行后续安全步骤。  
> 必须覆盖所有已暴露的聚合 tool 和 action；如果某项因环境原因无法执行，标记为 BLOCKED，不允许跳过不记。  
> 测试结束后必须恢复权限并清理测试数据，最后按文档中的“最终报告模板”输出完整报告、关键结论、覆盖矩阵，以及最后的 `Bug 列表`。

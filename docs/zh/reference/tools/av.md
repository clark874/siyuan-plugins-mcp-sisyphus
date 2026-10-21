# av 工具

这个工具覆盖属性视图与数据库式操作。

适用场景：你需要查看或修改真实的思源属性视图，而不是用 Markdown 表格模拟数据库。

相关页面：

- [常见任务](../common-tasks.md)
- [权限模型](../permissions.md)

## 常见动作

| 分组 | 动作 |
|------|---------|
| 读取 | `get`, `render`, `get_attribute_view_keys`, `get_attribute_view_filter_sort`, `search`, `get_primary_key_values` |
| 行操作 | `add_rows`, `remove_rows` |
| 列操作 | `add_column`, `remove_column` |
| 单元格更新 | `set_cells` |
| 结构 | `duplicate` |

## 参数与语义

- `render` 在 `createIfNotExist=true` 且传入 `blockID` 时，也可创建并实体化 AV。此时 `blockID` 表示目标父级 / 插入上下文，MCP 会通过思源风格的 spun AV block DOM 与 transaction 完成插入。
- 只需视图与字段结构时使用 `ignoreRows=true`。思源会省略行值，既不修改数据库，也能显著压缩 Agent 盘点数据库结构时的返回量。
- 读取行时固定采用三步法：先用 `ignoreRows=true` 查看结构，再用 `query` 或 `get_primary_key_values` 定位行，最后渲染窄结果。默认每页 10 行。
- 思源 3.8.1 将字段和行放在 `view` 内；MCP 会将其规范化为一份紧凑 `table`，并保留不含行副本的视图元数据。默认不返回内核原始行；只有诊断紧凑投影缺失字段时才使用 `verbose=true`。
- 紧凑单元格保留 `set_cells` 所需的行 ID、列 ID 与列类型；日期保留 epoch 边界和时间语义，不经本地时区做有损转换。
- 渲染已有 AV 时，规范参数名是 `id`，值为 AV ID。为了减少 Agent 从 `search` 到 `render` 的参数转换，`render` 也接受 `avID` 作为兼容别名，且 `av.search` 结果会包含可复用的 `renderArgs`。
- 保留 `render(createIfNotExist=true)` 返回的 `blockID`。后续 AV 读写通常只需要 `avID`；MCP 会从行绑定块、镜像数据库块，或 blocks 表中的 AV 块记录自动解析 owning database block。需要固定某个数据库块视图、存在多个镜像候选，或需要为刚创建的空 AV 提供显式兜底时，再传 `blockID`。
- `set_cells` 由 `valueType` 决定值类型，既支持单格字段，也支持 `cells` / `items` 数组。
- `rowID` 指行 item ID，不是源块 ID。
- AV 写操作会尽量对齐思源前端 transaction operation，包括行、列、单元格操作，以及数据库块 `updated` 刷新元数据。
- `duplicate` 对齐思源“复制为镜像”的流程：复制 AV 定义、生成数据库块 DOM，并通过 transaction 插入镜像数据库块。提供 `previousID` 时会作为插入位置；否则使用 `blockID` 或自动解析到的 owning database block 作为默认插入上下文。

## 安全规则

- AV 操作是真实数据库操作，不是 Markdown 表格编辑。
- 结构化数据应使用 `av`，不要在 Markdown 中模拟数据库行为。

## 示例

MCP：

```json
{
  "action": "get",
  "id": "<attribute-view-id>"
}
```

```json
{
  "action": "add_column",
  "avID": "<attribute-view-id>",
  "keyName": "Status",
  "keyType": "select"
}
```

CLI：

```bash
siyuan av get --id <attribute-view-id>
siyuan av render --av-id <attribute-view-id>
siyuan av add-column --av-id <attribute-view-id> --key-name Status --key-type select
siyuan av add-rows --av-id <attribute-view-id> --block-ids <block-id>
siyuan av add-rows --av-id <attribute-view-id> --primary-key-texts "Plain text row"
```

## 动作列表

- `get`
- `render`
- `get_attribute_view_keys`
- `get_attribute_view_filter_sort`
- `search`
- `add_rows`
- `remove_rows`
- `add_column`
- `remove_column`
- `set_cells`
- `duplicate`
- `get_primary_key_values`


## 思源 3.8.8 扩展

- `get_automations` 读取完整规则；`set_automations` 经严格预检整体保存配置，支持新增、修改、停用和移除。所有视图、镜像共享该配置；移除规则不会删除既有条目。
- `preview_collection` 分页预览启用规则匹配的块；`collect_blocks` 提交选定 `blockIDs`，内核重新匹配后绑定。来源块与目标数据库都需要写权限，不自动清理旧条目。
- `preview_template` 对实际源条目求值，允许临时 `inputs` 覆盖，不保存或触发规则。通过规则的 `fields` 使用 `mode="template"` 完成自动赋值；模板必须符合思源原生语法。
- `render.temporarySort={column,order}` 仅影响本次读取，`order` 为 `ASC` 或 `DESC`，不会改变持久视图排序。
- 所有内容写入均检查可能触发的自动化：包括普通块自动收集、跨库目标、共享镜像与被编辑主键绑定的来源块。严格模式的预检摘要包含规则配置；规则变化后须重新预检。
- 自动化仍沿用文本知识边界，不写入关联、资源和计算字段。无法完整验证范围时拒绝内容写入。

先调用对应动作的 `help` 取得完整参数，使用真实规则、条目、字段和块标识；不要复制占位标识执行。严格写入使用相同业务参数预检，再携带返回的 `issuedRequestId` 与对应摘要凭据执行一次。

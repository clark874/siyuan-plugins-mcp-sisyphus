# av

This tool covers attribute view and database-style operations.

When to read this page: you need to inspect or mutate a real SiYuan attribute view instead of using Markdown tables.

Related pages:

- [Common Tasks](../common-tasks.md)
- [Permissions](../permissions.md)

## Common Actions

| Group | Actions |
|------|---------|
| Read | `get`, `render`, `get_attribute_view_keys`, `get_attribute_view_filter_sort`, `search`, `get_primary_key_values` |
| Row operations | `add_rows`, `remove_rows` |
| Column operations | `add_column`, `remove_column` |
| Cell updates | `set_cells` |
| Structure | `rename`, `duplicate` |

## Parameters and Semantics

- `render` can also create and materialize an AV when `createIfNotExist=true` and `blockID` is provided. In this mode, `blockID` is the target parent/insertion context, and MCP inserts a SiYuan-style spun AV block through a transaction.
- Use `ignoreRows=true` when you need only view/schema metadata. SiYuan omits row values, which keeps database discovery and Agent planning compact without changing the AV.
- Read rows in three steps: inspect structure with `ignoreRows=true`, locate rows with `query` or `get_primary_key_values`, then render a narrow page. The default page size is 10.
- SiYuan 3.8.1 returns columns and rows under `view`; MCP normalizes that shape into one compact `table` and retains row-free view metadata. Raw kernel rows are omitted by default; use `verbose=true` only when diagnosing a field missing from the compact projection.
- Compact cells preserve row IDs, column IDs and column types needed by `set_cells`. Dates retain epoch boundaries and time semantics instead of being converted through a lossy local timezone.
- To render an existing AV, pass the AV ID as `id`. For smoother Agent workflows, `render` also accepts `avID` as a compatibility alias, and `av.search` results include reusable `renderArgs`.
- Keep the `blockID` returned by `render(createIfNotExist=true)`. Later AV reads and writes usually only need `avID`; MCP resolves the owning database block from row bindings, mirror database blocks, or the blocks-table AV block record. Pass `blockID` when you need an exact database-block view context, when multiple mirrors are possible, or as an explicit fallback for a brand-new empty AV.
- `set_cells` is typed by `valueType` and accepts either single-cell fields or a `cells` / `items` array.
- `rowID` refers to the row item ID, not the source block ID.
- AV writes follow SiYuan frontend transaction operations where possible, including row/column/cell operations and database block `updated` refresh metadata.
- `rename` uses the native `setAttrViewName` transaction and records the previous name for undo when available.
- `duplicate` follows SiYuan's copy-as-mirror flow: it duplicates the AV definition, spins the AV block DOM, and inserts the mirror database block through a transaction. `previousID` controls the insertion position when provided; otherwise `blockID` or an automatically resolved owning database block is used as the default insertion context.

## Safety Rules

- AV operations are real database operations, not Markdown table edits.
- Use `av` for structured data instead of faking database behavior in Markdown.

## Examples

MCP:

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

```json
{
  "action": "rename",
  "avID": "<attribute-view-id>",
  "name": "Research Assets"
}
```

CLI:

```bash
siyuan av get --id <attribute-view-id>
siyuan av render --av-id <attribute-view-id>
siyuan av add-column --av-id <attribute-view-id> --key-name Status --key-type select
siyuan av add-rows --av-id <attribute-view-id> --block-ids <block-id>
siyuan av add-rows --av-id <attribute-view-id> --primary-key-texts "Plain text row"
```

## Action List

- `get`
- `render`
- `get_attribute_view_keys`
- `get_attribute_view_filter_sort`
- `search`
- `rename`
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

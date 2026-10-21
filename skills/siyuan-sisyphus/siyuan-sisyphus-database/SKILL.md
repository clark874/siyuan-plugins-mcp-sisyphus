---
name: siyuan-sisyphus-database
description: CLI-only playbook for SiYuan attribute views with siyuan-sisyphus. Use to inspect AV metadata, render views, add columns or rows, and update cells while keeping AV, view, row, column, and block IDs distinct. Do not use for read-only SQL analytics; use search-query instead.
compatibility: "Requires the maintained siyuan-sisyphus CLI to be installed and configured for the target SiYuan workspace."
---

# Operate SiYuan Databases with the CLI

## Resolve the CLI entry first

Before the first SiYuan CLI call in every new session, verify that the local command is available:

```bash
command -v siyuan-sisyphus
siyuan-sisyphus --version
```

If the command is missing, resolve a locally installed or user-provided maintained CLI entry before continuing. Do not use `npx` as an implicit fallback. A public npm package may lag the locally maintained plugin and silently omit custom actions or safety contracts.

After resolving the entry, start with the read-only live bootstrap:

```bash
siyuan-sisyphus system bootstrap --json
```

Never guess attribute-view identifiers. Inspect the AV and its views before changing rows or cells.

```bash
siyuan-sisyphus av get --id '<av-id>' --json
```
```bash
siyuan-sisyphus av render --id '<av-id>' --page '1' --page-size '10' --ignore-rows --json
```
```bash
siyuan-sisyphus av get-primary-key-values --av-id '<av-id>' --keyword '<row keyword>' --page '1' --page-size '10' --json
```
```bash
siyuan-sisyphus av render --id '<av-id>' --page '1' --page-size '10' --query '<row keyword>' --json
```
```bash
siyuan-sisyphus av search --keyword 'project' --json
```

思源 3.8.8 新增自动化工作流：先调用 `siyuan-sisyphus help av get-automations` 与 `siyuan-sisyphus help av set-automations` 读取完整配置，再按同一严格写入协议整体保存；规则变更使旧预检凭据失效。设置启用规则要求来源块及派生目标所有镜像可写；普通块更新触发的全局收集也受同一权限检查。使用 `siyuan-sisyphus help av preview-collection` 分页只读预览，然后通过 `siyuan-sisyphus help av collect-blocks` 收集明确 blockIDs；内核会重新匹配，不自动清理旧条目。使用 `siyuan-sisyphus help av preview-template` 对真实条目求值，再把模板字段配置交给原生规则执行；关联、资源和计算目标字段不支持。`siyuan-sisyphus help av render` 的 temporarySort={column,order} 仅影响本次读取，不保存共享排序。

数据库读取固定采用三步法：先以 `ignoreRows=true` 查看视图和列，再以 `query` 或 `get_primary_key_values` 定位行，最后用小页渲染读取所需值。除非明确诊断内核原始字段，不得设置 `verbose=true`，也不得无过滤全量渲染。

Keep these identifiers distinct: AV ID identifies the database; view ID identifies a table/board view; row ID identifies a key value; column ID identifies a key; block ID identifies note content.

## Mutations

```bash
siyuan-sisyphus av add-column --av-id '<av-id>' --key-name 'Status' --key-type 'select' --json
```
```bash
siyuan-sisyphus av add-rows --av-id '<av-id>' --view-id '<view-id>' --block-ids-json '["<block-id>"]' --json
```
```bash
siyuan-sisyphus av set-cells --av-id '<av-id>' --cells-json '[{"rowID":"<row-id>","columnID":"<column-id>","valueType":"text","text":"Done"}]' --json
```

Before writing cells, render the current view and map column names to column IDs. Preserve the declared value type; do not put a date-shaped string into a number/date/select column without using the action’s expected value shape. Re-render after mutation. Read `siyuan-sisyphus help av set-cells` for the current cell schema.

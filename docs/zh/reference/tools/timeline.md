# timeline 工具

`timeline` 用于管理命名的文档/全局快照节点、查看文档块级差异，以及选择性恢复历史内容。

如需完整的 Agent 工作流与安全检查清单，加载官方 Skill `siyuan://skills/siyuan-mcp-timeline`，或调用 MCP Prompt `siyuan_timeline`。另见[常见任务](../common-tasks.md#比较并恢复文档时间线)。

## 动作

| 动作 | 必填字段 | 说明 |
|------|----------|------|
| `list_nodes` | `scope` | `document` 和 `all` 还需 `documentId`；按时间倒序分页 |
| `create_node` | `name`, `scope` | 文档节点还需 `documentId`；返回稳定标识 `tag` |
| `compare_node` | `documentId`, `tag` | 创建一次未标记的当前状态快照，分页返回块级差异 |
| `delete_node` | `tag` | 文档 tag 还需 `documentId`；高危且默认关闭 |
| `rollback_document` | `documentId`, `tag` | 只恢复单篇文档文件，不进行整库 checkout；高危且默认关闭 |
| `rollback_block` | `documentId`, `tag`, `changeKey` | 重新计算 Diff，并恢复仍能匹配的单个块变更；高危且默认关闭 |

## 工作流

```text
timeline(action="list_nodes", scope="all", documentId="<文档 ID>")
timeline(action="create_node", name="改写前", scope="document", documentId="<文档 ID>")
timeline(action="compare_node", documentId="<文档 ID>", tag="<tag>", page=1, pageSize=20)
timeline(action="rollback_block", documentId="<文档 ID>", tag="<tag>", changeKey="<changeKey>")
```

`compare_node` 默认只返回发生变化的块；需要上下文时可设置 `includeUnchanged=true`。每个变更包含历史/当前 Markdown、不透明的 `changeKey`，以及是否支持块级回退。

## 安全与权限

- 列出、比较文档节点需要笔记本读权限。
- 创建文档节点需要写权限。
- 删除文档节点和所有回退动作统一要求 `rwd`。
- 全局节点只暴露快照元数据，不绑定具体笔记本权限。
- `delete_node` 只删除保护 tag 和文档索引记录，底层仓库快照仍会保留。
- 调用 `delete_node`、`rollback_document` 或 `rollback_block` 前必须获得用户明确确认；CLI 主动调用视为确认。
- 旧版节点关联、迁移与转换仍只在插件时间线 UI 中提供。

## CLI 示例

```bash
siyuan-sisyphus timeline create-node --name "改写前" --scope document --document-id <文档 ID> --json
siyuan-sisyphus timeline compare-node --document-id <文档 ID> --tag <tag> --page-size 20 --json
```

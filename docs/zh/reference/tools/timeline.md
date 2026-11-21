# timeline

`timeline` 用于列出或创建命名快照节点，并将文档与指定节点或近期原生历史检查点比较。

| action | 必填字段 | 说明 |
| --- | --- | --- |
| `list_nodes` | `scope` | `document` 与 `all` 还需 `documentId`。 |
| `create_node` | `name`, `scope` | 文档范围还需 `documentId`。 |
| `compare_node` | `documentId`, `tag` | 返回分页块级差异。 |
| `compare_recent` | `documentId` | 读取最近一个内容不同的原生历史检查点。 |

文档节点也使用全局仓库快照。多篇文档请逐次创建。仓库快照和标签请求每次最多等待 15 秒，包含严格写入提交后的标签回读。超时后先用 `list_nodes` 核对标签，再决定是否补建。

`timeline_app` 打开唯一内联 App，模型隐藏 action 仅包含列出、创建和比较。MCP、CLI 与 MCP App 均不再暴露节点删除、文档回退或块回退；旧版恢复能力只作为本地插件界面的独立事项处理。

# feedback 工具

`feedback` 工具用于向插件开发者提交纯文本产品反馈。

## 动作

| 动作 | 用途 |
|------|------|
| `submit` | 通过配置好的 WPS 表单渠道发送问题反馈、改进建议或使用体验。 |

## 示例

```json
{
  "action": "submit",
  "description": "document create 的帮助说明不够直观。",
  "impact": "Agent 容易选择错误的路径格式。",
  "suggestion": "在必填字段附近增加一个更短的示例。",
  "agent": "Claude Desktop / Claude Sonnet 4.5"
}
```

来源和插件版本字段会自动填写。

请避免发送密钥、API token、私密笔记内容或敏感本地路径。

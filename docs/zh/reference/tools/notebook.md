# notebook 工具

这个工具覆盖笔记本 CRUD、笔记本配置，以及笔记本级权限控制。

适用场景：你需要列出笔记本、管理笔记本设置，或修改某个笔记本的权限级别。

相关页面：

- [权限模型](../permissions.md)
- [常见任务](../common-tasks.md)

## 常见动作

| 动作 | 必填字段 | 权限 | 说明 |
|--------|----------|------|------|
| `list` | 无 | 无 | 列出所有笔记本 |
| `create` | `name` | 无 | 可选 `icon` |
| `set_open_state` | `notebook`, `opened` | 读 | 打开或关闭笔记本 |
| `remove` | `notebook` | 删 | 需要确认 |
| `rename` | `notebook`, `name` | 写 | 重命名笔记本 |
| `get_conf` | `notebook` | 读 | 读取笔记本配置 |
| `set_conf` | `notebook`, `conf` | 写 | 更新配置对象 |
| `set_icon` | `notebook`, `icon` | 写 | 建议用 Unicode 十六进制图标 |
| `get_permissions` | 无或 `notebook` | 无 | 查看权限 |
| `set_permission` | `notebook`, `permission` | 无 | 需要确认 |
| `get_child_docs` | `notebook` | 读 | 获取根级子文档 |

## 安全规则

- `remove` 需要用户明确确认
- `set_permission` 会影响后续访问边界，也应显式确认

## 示例

MCP：

```json
{ "action": "list" }
```

```json
{ "action": "set_permission", "notebook": "<id>", "permission": "rw" }
```

CLI：

```bash
siyuan notebook list
siyuan notebook set-permission --notebook <id> --permission rw
```

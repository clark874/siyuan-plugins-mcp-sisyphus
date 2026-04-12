# API 参考

SiYuan MCP Sisyphus 完整 API 参考文档。本文档描述所有可用的 MCP 工具和 action。

## 目录

- [概述](#概述)
- [权限模型](#权限模型)
- [高危操作](#高危操作)
- [路径语义](#路径语义)
- [错误码](#错误码)
- [工具](#工具)
  - [notebook](#notebook)
  - [document](#document)
  - [block](#block)
  - [av](#av)
  - [file](#file)
  - [search](#search)
  - [tag](#tag)
  - [system](#system)
  - [flashcard](#flashcard)
  - [mascot](#mascot)

## 概述

SiYuan MCP Sisyphus 提供 **10 个聚合工具**，包含 **79 个 action**，覆盖思源笔记的绝大部分功能：

| 工具 | Action 数量 | 描述 |
|------|-------------|------|
| `notebook` | 12 | 笔记本管理 |
| `document` | 16 | 文档操作 |
| `block` | 19 | 块编辑和属性 |
| `av` | 10 | 属性视图（数据库）操作 |
| `file` | 5 | 文件上传、导出、模板 |
| `search` | 5 | 搜索和查询操作 |
| `tag` | 3 | 标签管理 |
| `system` | 10 | 系统和通知操作 |
| `flashcard` | 7 | 闪卡复习和卡组 |
| `mascot` | 3 | 余额、商店和购买 |

每个工具都需要一个必需的 `action` 字段来指定要执行的操作。

## 权限模型

插件实现了四级权限模型，用于笔记本级别的访问控制：

| 级别 | 读取 | 写入 | 删除 | 描述 |
|------|------|------|------|------|
| `rwd` | 是 | 是 | 是 | 完全访问（新笔记本默认） |
| `rw` | 是 | 是 | 否 | 可读写但不可删除 |
| `r` | 是 | 否 | 否 | 只读访问 |
| `none` | 否 | 否 | 否 | 无访问权限 |

权限通过 `notebook(action="set_permission")` 管理，并立即对后续调用生效。

## 高危操作

以下操作在执行前需要用户明确确认：

| 工具 | Action | 原因 |
|------|--------|------|
| `notebook` | `remove` | 删除整个笔记本 |
| `notebook` | `set_permission` | 更改访问权限 |
| `document` | `remove` | 删除文档 |
| `document` | `move` | 移动文档位置 |
| `block` | `delete` | 删除块 |
| `block` | `move` | 移动块 |
| `file` | `upload_asset` | 上传本地文件（大于 10MB 的文件也需要确认） |
| `tag` | `remove` | 删除标签 |
| `flashcard` | `remove_card` | 从卡组移除卡片 |

## 路径语义

有两种路径类型，请勿混淆使用。

### 人类可读路径

用于：`document(action="create")`、`document(action="get_ids")`

- 格式：`/Inbox/Weekly Note`
- 必须以 `/` 开头
- 父路径必须已存在

### 存储路径

用于：`document(action="rename")`、`document(action="remove")`、`document(action="move")`、`document(action="get_hpath")`、`document(action="list_tree")`

- 格式：`/20240318112233-abc123.sy`
- 表示实际文件存储位置
- 使用 `document(action="get_path", id="...")` 获取存储路径

**安全的工作流程**：先调用 `document(action="get_path", id=...)`，然后复用返回的存储路径。

## 错误码

MCP 服务器返回的常见错误类型：

| 错误类型 | 描述 |
|----------|------|
| `validation_error` | 参数无效或缺少必需字段 |
| `permission_denied` | 操作权限不足 |
| `api_error` | 思源 API 返回错误 |
| `internal_error` | MCP 服务器内部错误 |
| `action_disabled` | Action 在配置中被禁用 |

## 工具

### notebook

笔记本操作聚合工具。

#### list

**描述**：列出工作区中的所有笔记本。

**权限要求**：无

**参数**：无

**返回值**：笔记本数组，包含 `id`、`name`、`icon`、`closed` 状态。

**示例**：
```json
{
  "action": "list"
}
```

#### create

**描述**：创建新笔记本。

**权限要求**：无

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `name` | string | 是 | 笔记本名称 |
| `icon` | string | 否 | 可选图标（建议使用 Unicode 十六进制，如 "1f4d4"） |

**返回值**：创建的笔记本对象。

**示例**：
```json
{
  "action": "create",
  "name": "我的笔记本",
  "icon": "1f4d4"
}
```

#### open

**描述**：打开已关闭的笔记本。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `notebook` | string | 是 | 笔记本 ID |

**示例**：
```json
{
  "action": "open",
  "notebook": "20240318112233-abc123"
}
```

#### close

**描述**：关闭打开的笔记本。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `notebook` | string | 是 | 笔记本 ID |

**示例**：
```json
{
  "action": "close",
  "notebook": "20240318112233-abc123"
}
```

#### remove

**描述**：永久删除笔记本。

**权限要求**：删除权限（rwd）

**需要确认**：是

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `notebook` | string | 是 | 笔记本 ID |

**示例**：
```json
{
  "action": "remove",
  "notebook": "20240318112233-abc123"
}
```

#### rename

**描述**：重命名笔记本。

**权限要求**：写权限（rw/rwd）

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `notebook` | string | 是 | 笔记本 ID |
| `name` | string | 是 | 新笔记本名称 |

**示例**：
```json
{
  "action": "rename",
  "notebook": "20240318112233-abc123",
  "name": "新名称"
}
```

#### get_conf

**描述**：获取笔记本配置。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `notebook` | string | 是 | 笔记本 ID |

**返回值**：配置对象，包含 `name`、`closed`、`refCreateSavePath`、`createDocNameTemplate`、`dailyNoteSavePath`、`dailyNoteTemplatePath`。

**示例**：
```json
{
  "action": "get_conf",
  "notebook": "20240318112233-abc123"
}
```

#### set_conf

**描述**：设置笔记本配置。

**权限要求**：写权限（rw/rwd）

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `notebook` | string | 是 | 笔记本 ID |
| `conf` | object | 是 | 配置对象 |

**示例**：
```json
{
  "action": "set_conf",
  "notebook": "20240318112233-abc123",
  "conf": {
    "name": "新名称",
    "closed": false,
    "dailyNoteSavePath": "/daily"
  }
}
```

#### set_icon

**描述**：设置笔记本图标。

**权限要求**：写权限（rw/rwd）

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `notebook` | string | 是 | 笔记本 ID |
| `icon` | string | 是 | 图标值（建议使用 Unicode 十六进制） |

**示例**：
```json
{
  "action": "set_icon",
  "notebook": "20240318112233-abc123",
  "icon": "1f4d4"
}
```

#### get_permissions

**描述**：获取笔记本的权限级别。

**权限要求**：无

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `notebook` | string | 否 | 笔记本 ID，"all"，或省略表示全部 |

**示例**：
```json
{
  "action": "get_permissions",
  "notebook": "all"
}
```

#### set_permission

**描述**：设置笔记本的权限级别。

**权限要求**：无（但会影响后续操作）

**需要确认**：是

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `notebook` | string | 是 | 笔记本 ID |
| `permission` | string | 是 | 权限级别：`none`、`r`、`rw`、`rwd` |

**示例**：
```json
{
  "action": "set_permission",
  "notebook": "20240318112233-abc123",
  "permission": "rw"
}
```

#### get_child_docs

**描述**：获取笔记本根目录下的直接子文档。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `notebook` | string | 是 | 笔记本 ID |

**示例**：
```json
{
  "action": "get_child_docs",
  "notebook": "20240318112233-abc123"
}
```

---

### document

文档操作聚合工具。

#### create

**描述**：使用 Markdown 内容创建新文档。

**权限要求**：写权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `notebook` | string | 是 | 笔记本 ID |
| `path` | string | 是 | 人类可读路径（如 `/Inbox/Note`） |
| `markdown` | string | 是 | Markdown 内容 |
| `icon` | string | 否 | 可选文档图标 |

**示例**：
```json
{
  "action": "create",
  "notebook": "20240318112233-abc123",
  "path": "/收件箱/周报",
  "markdown": "# 周报\n\n内容...",
  "icon": "1f4d4"
}
```

#### rename

**描述**：重命名文档。

**权限要求**：写权限

**参数**（ID 模式）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 文档 ID |
| `title` | string | 是 | 新文档标题 |

**参数**（路径模式）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `notebook` | string | 是 | 笔记本 ID |
| `path` | string | 是 | 存储路径 |
| `title` | string | 是 | 新文档标题 |

**示例**：
```json
{
  "action": "rename",
  "id": "20240318112233-abc123",
  "title": "新标题"
}
```

#### remove

**描述**：删除文档。

**权限要求**：删除权限（rwd）

**需要确认**：是

**参数**（ID 模式）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 文档 ID |

**参数**（路径模式）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `notebook` | string | 是 | 笔记本 ID |
| `path` | string | 是 | 存储路径 |

**示例**：
```json
{
  "action": "remove",
  "id": "20240318112233-abc123"
}
```

#### move

**描述**：将文档移动到新位置。

**权限要求**：写权限

**需要确认**：是

**参数**（ID 模式）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `fromIDs` | string[] | 是 | 源文档 ID 数组 |
| `toID` | string | 是 | 目标文档 ID 或笔记本 ID |

**参数**（路径模式）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `fromPaths` | string[] | 是 | 源存储路径数组 |
| `toNotebook` | string | 是 | 目标笔记本 ID |
| `toPath` | string | 是 | 目标存储路径（必须存在） |

**示例**：
```json
{
  "action": "move",
  "fromIDs": ["20240318112233-abc123"],
  "toID": "20240318112233-def456"
}
```

#### get_path

**描述**：通过文档 ID 获取存储路径。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 文档 ID |

**返回值**：存储路径字符串。

**示例**：
```json
{
  "action": "get_path",
  "id": "20240318112233-abc123"
}
```

#### get_hpath

**描述**：获取人类可读路径。

**权限要求**：读权限

**参数**（ID 模式）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 文档 ID |

**参数**（路径模式）：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `notebook` | string | 是 | 笔记本 ID |
| `path` | string | 是 | 存储路径 |

**示例**：
```json
{
  "action": "get_hpath",
  "id": "20240318112233-abc123"
}
```

#### get_ids

**描述**：通过人类可读路径获取文档 ID。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `path` | string | 是 | 人类可读路径 |
| `notebook` | string | 是 | 笔记本 ID |

**返回值**：文档 ID 数组。

**示例**：
```json
{
  "action": "get_ids",
  "path": "/收件箱/周报",
  "notebook": "20240318112233-abc123"
}
```

#### get_child_blocks

**描述**：获取文档的直接子块。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 文档 ID |

**示例**：
```json
{
  "action": "get_child_blocks",
  "id": "20240318112233-abc123"
}
```

#### get_child_docs

**描述**：获取文档的直接子文档。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 文档 ID |

**示例**：
```json
{
  "action": "get_child_docs",
  "id": "20240318112233-abc123"
}
```

#### set_icon

**描述**：设置文档图标。

**权限要求**：写权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 文档 ID |
| `icon` | string | 是 | 图标值 |

**示例**：
```json
{
  "action": "set_icon",
  "id": "20240318112233-abc123",
  "icon": "1f4d4"
}
```

#### set_cover

**描述**：设置文档封面图片。

**权限要求**：写权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 文档 ID |
| `source` | string | 是 | URL 或 `/assets/...` 路径 |

**示例**：
```json
{
  "action": "set_cover",
  "id": "20240318112233-abc123",
  "source": "https://example.com/image.png"
}
```

#### clear_cover

**描述**：清除文档封面图片。

**权限要求**：写权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 文档 ID |

**示例**：
```json
{
  "action": "clear_cover",
  "id": "20240318112233-abc123"
}
```

#### list_tree

**描述**：列出笔记本路径下的嵌套文档树。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `notebook` | string | 是 | 笔记本 ID |
| `path` | string | 是 | 存储路径或 `/` 表示根目录 |
| `maxDepth` | number | 否 | 最大深度（默认 3） |

**示例**：
```json
{
  "action": "list_tree",
  "notebook": "20240318112233-abc123",
  "path": "/",
  "maxDepth": 3
}
```

#### search_docs

**描述**：按标题关键词搜索文档。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `notebook` | string | 是 | 用于权限控制的笔记本 ID |
| `query` | string | 是 | 搜索关键词 |
| `path` | string | 否 | 可选的存储路径缩小范围 |

**示例**：
```json
{
  "action": "search_docs",
  "notebook": "20240318112233-abc123",
  "query": "周报"
}
```

#### get_doc

**描述**：获取文档内容和元数据。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 文档 ID |
| `mode` | string | 否 | `markdown`（默认）或 `html` |
| `size` | number | 否 | 最大内容大小提示 |
| `page` | number | 否 | 页码（从 1 开始） |
| `pageSize` | number | 否 | 每页字符数（默认 8000） |

**示例**：
```json
{
  "action": "get_doc",
  "id": "20240318112233-abc123",
  "mode": "markdown",
  "page": 1,
  "pageSize": 8000
}
```

#### create_daily_note

**描述**：创建或返回今天的日记。

**权限要求**：写权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `notebook` | string | 是 | 笔记本 ID |
| `app` | string | 否 | 可选的应用标识符 |

**示例**：
```json
{
  "action": "create_daily_note",
  "notebook": "20240318112233-abc123"
}
```

---

### block

块操作聚合工具。

#### insert

**描述**：在指定位置插入新块。

**权限要求**：写权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `dataType` | string | 是 | `markdown` 或 `dom` |
| `data` | string | 是 | 块内容 |
| `nextID` | string | 否 | 在此块之前插入 |
| `previousID` | string | 否 | 在此块之后插入 |
| `parentID` | string | 否 | 父块/文档 ID |

**示例**：
```json
{
  "action": "insert",
  "dataType": "markdown",
  "data": "* 新条目",
  "parentID": "20240318112233-abc123"
}
```

#### prepend

**描述**：在父块开头插入块。

**权限要求**：写权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `dataType` | string | 是 | `markdown` 或 `dom` |
| `data` | string | 是 | 块内容 |
| `parentID` | string | 是 | 父块或文档 ID |

**示例**：
```json
{
  "action": "prepend",
  "dataType": "markdown",
  "data": "# 标题",
  "parentID": "20240318112233-abc123"
}
```

#### append

**描述**：在父块末尾插入块。

**权限要求**：写权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `dataType` | string | 是 | `markdown` 或 `dom` |
| `data` | string | 是 | 块内容 |
| `parentID` | string | 是 | 父块或文档 ID |

**示例**：
```json
{
  "action": "append",
  "dataType": "markdown",
  "data": "- [ ] 待办事项",
  "parentID": "20240318112233-abc123"
}
```

#### update

**描述**：更新块内容。

**权限要求**：写权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `dataType` | string | 是 | `markdown` 或 `dom` |
| `data` | string | 是 | 新块内容 |
| `id` | string | 是 | 块 ID |

**示例**：
```json
{
  "action": "update",
  "dataType": "markdown",
  "data": "更新后的内容",
  "id": "20240318112233-abc123"
}
```

#### delete

**描述**：删除块。

**权限要求**：删除权限（rwd）

**需要确认**：是

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 块 ID |

**示例**：
```json
{
  "action": "delete",
  "id": "20240318112233-abc123"
}
```

#### move

**描述**：将块移动到新位置。

**权限要求**：写权限

**需要确认**：是

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 块 ID |
| `previousID` | string | 否 | 在此块之后定位 |
| `parentID` | string | 否 | 新父块 ID |

**注意**：`previousID` 或 `parentID` 至少提供一个。

**示例**：
```json
{
  "action": "move",
  "id": "20240318112233-abc123",
  "parentID": "20240318112233-def456"
}
```

#### fold

**描述**：折叠可折叠块。

**权限要求**：写权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 可折叠块 ID |

**示例**：
```json
{
  "action": "fold",
  "id": "20240318112233-abc123"
}
```

#### unfold

**描述**：展开可折叠块。

**权限要求**：写权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 可折叠块 ID |

**示例**：
```json
{
  "action": "unfold",
  "id": "20240318112233-abc123"
}
```

#### get_kramdown

**描述**：获取块的 kramdown 格式内容。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 块 ID 或文档 ID |

**示例**：
```json
{
  "action": "get_kramdown",
  "id": "20240318112233-abc123"
}
```

#### get_children

**描述**：分页获取子块。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 块 ID 或文档 ID |
| `page` | number | 否 | 页码（从 1 开始，默认 1） |
| `pageSize` | number | 否 | 每页项目数（默认 50） |

**示例**：
```json
{
  "action": "get_children",
  "id": "20240318112233-abc123",
  "page": 1,
  "pageSize": 50
}
```

#### transfer_ref

**描述**：将块引用从一个块转移到另一个块。

**权限要求**：写权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `fromID` | string | 是 | 源块 ID |
| `toID` | string | 是 | 目标块 ID |
| `refIDs` | string[] | 否 | 特定的引用块 ID |

**示例**：
```json
{
  "action": "transfer_ref",
  "fromID": "20240318112233-abc123",
  "toID": "20240318112233-def456"
}
```

#### set_attrs

**描述**：设置块属性。

**权限要求**：写权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 块 ID |
| `attrs` | object | 是 | 属性键值对 |

**示例**：
```json
{
  "action": "set_attrs",
  "id": "20240318112233-abc123",
  "attrs": {
    "custom-key": "value"
  }
}
```

#### get_attrs

**描述**：获取块属性。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 块 ID |

**示例**：
```json
{
  "action": "get_attrs",
  "id": "20240318112233-abc123"
}
```

#### exists

**描述**：检查块是否存在。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 块 ID |

**示例**：
```json
{
  "action": "exists",
  "id": "20240318112233-abc123"
}
```

#### info

**描述**：获取块位置和根文档元数据。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 块 ID |

**示例**：
```json
{
  "action": "info",
  "id": "20240318112233-abc123"
}
```

#### breadcrumb

**描述**：获取块的面包屑路径。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 块 ID |
| `excludeTypes` | string[] | 否 | 要排除的块类型 |

**示例**：
```json
{
  "action": "breadcrumb",
  "id": "20240318112233-abc123",
  "excludeTypes": ["paragraph"]
}
```

#### dom

**描述**：获取块的渲染 DOM。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 块 ID |

**示例**：
```json
{
  "action": "dom",
  "id": "20240318112233-abc123"
}
```

#### recent_updated

**描述**：获取最近更新的块。

**权限要求**：读权限（按笔记本权限过滤）

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `count` | number | 否 | 返回的最大块数 |

**示例**：
```json
{
  "action": "recent_updated",
  "count": 20
}
```

#### word_count

**描述**：获取块的字数统计。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `ids` | string[] | 是 | 块 ID 数组 |

**示例**：
```json
{
  "action": "word_count",
  "ids": ["20240318112233-abc123", "20240318112233-def456"]
}
```

---

### av

属性视图（数据库）操作聚合工具。

#### get

**描述**：通过 AV ID 获取完整属性视图数据。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 属性视图 ID |

**示例**：
```json
{
  "action": "get",
  "id": "20240318112233-abc123"
}
```

#### search

**描述**：按关键词搜索属性视图。

**权限要求**：读权限（按笔记本权限过滤）

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `keyword` | string | 是 | 搜索关键词 |
| `excludes` | string[] | 否 | 要排除的 AV ID |

**示例**：
```json
{
  "action": "search",
  "keyword": "项目"
}
```

#### render_attribute_view

**描述**：按可选视图、分页、查询和分组分页上下文渲染属性视图。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 属性视图 ID |
| `blockID` | string | 否 | 可选数据库块 ID |
| `viewID` | string | 否 | 可选目标视图 ID |
| `page` | number | 否 | 页码（从 1 开始） |
| `pageSize` | number | 否 | 每页行数 |
| `query` | string | 否 | 可选行查询 |
| `groupPaging` | object | 否 | 可选分组分页映射 |
| `createIfNotExist` | boolean | 否 | 缺失时创建默认视图 |

#### get_attribute_view_keys

**描述**：获取属性视图的 key/列信息。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 属性视图 ID |

#### get_attribute_view_filter_sort

**描述**：获取数据库块视图上的筛选和排序配置。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 属性视图 ID |
| `blockID` | string | 是 | 数据库块 ID |

#### add_rows

**描述**：将现有块添加为属性视图的行。

**权限要求**：写权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `avID` | string | 是 | 属性视图 ID |
| `blockIDs` | string[] | 是 | 要添加为行的块 ID |
| `blockID` | string | 否 | 数据库块 ID |
| `viewID` | string | 否 | 目标视图 ID |
| `groupID` | string | 否 | 目标组 ID |
| `previousID` | string | 否 | 前一行项目 ID |
| `ignoreDefaultFill` | boolean | 否 | 跳过过滤器/组的默认填充 |

**示例**：
```json
{
  "action": "add_rows",
  "avID": "20240318112233-abc123",
  "blockIDs": ["20240318112233-def456"]
}
```

#### remove_rows

**描述**：从属性视图中移除行。

**权限要求**：写权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `avID` | string | 是 | 属性视图 ID |
| `srcIDs` | string[] | 是 | 要移除的行块/项目 ID |

**示例**：
```json
{
  "action": "remove_rows",
  "avID": "20240318112233-abc123",
  "srcIDs": ["20240318112233-def456"]
}
```

#### add_column

**描述**：向属性视图添加列。

**权限要求**：写权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `avID` | string | 是 | 属性视图 ID |
| `keyName` | string | 是 | 列名称 |
| `keyType` | string | 是 | 列类型（见下文） |
| `keyID` | string | 否 | 可选列键 ID |
| `keyIcon` | string | 否 | 可选列图标 |
| `previousKeyID` | string | 否 | 在此键 ID 之后插入 |

**列类型**：`text`、`number`、`date`、`select`、`mSelect`、`url`、`email`、`phone`、`mAsset`、`template`、`created`、`updated`、`checkbox`、`relation`、`rollup`、`lineNumber`

**示例**：
```json
{
  "action": "add_column",
  "avID": "20240318112233-abc123",
  "keyName": "状态",
  "keyType": "select"
}
```

#### remove_column

**描述**：从属性视图中移除列。

**权限要求**：写权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `avID` | string | 是 | 属性视图 ID |
| `keyID` | string | 否 | 列键 ID |
| `columnID` | string | 否 | keyID 的别名 |
| `removeRelationDest` | boolean | 否 | 同时移除反向关联元数据 |

**注意**：`keyID` 或 `columnID` 至少提供一个。

**示例**：
```json
{
  "action": "remove_column",
  "avID": "20240318112233-abc123",
  "keyID": "20240318112233-def456"
}
```

#### set_cell

**描述**：更新属性视图的一个单元格。

**权限要求**：写权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `avID` | string | 是 | 属性视图 ID |
| `rowID` | string | 是 | 行项目 ID |
| `columnID` | string | 是 | 列键 ID |
| `valueType` | string | 是 | 单元格值类型 |

**值类型特定字段**：

| 值类型 | 必填字段 | 说明 |
|--------|----------|------|
| `text` | `text` | 文本内容 |
| `number` | `number` | 数值 |
| `date` | `date` | ISO 字符串或时间戳毫秒 |
| `checkbox` | `checked` | 布尔状态 |
| `select` | `option` | 选中的选项 |
| `multi_select` | `options` | 选项数组 |
| `relation` | `relationBlockIDs` | 关联块 ID |
| `url` | `url` | URL 值 |
| `email` | `email` | 邮箱值 |
| `phone` | `phone` | 电话值 |
| `mAsset` | `assets` | 资源条目 |

**示例**：
```json
{
  "action": "set_cell",
  "avID": "20240318112233-abc123",
  "rowID": "20240318112233-def456",
  "columnID": "20240318112233-ghi789",
  "valueType": "text",
  "text": "你好世界"
}
```

#### batch_set_cells

**描述**：批量更新多个单元格。

**权限要求**：写权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `avID` | string | 是 | 属性视图 ID |
| `items` | array | 是 | 单元格更新数组 |

`items` 中的每个条目遵循与 `set_cell` 参数相同的结构。

**示例**：
```json
{
  "action": "batch_set_cells",
  "avID": "20240318112233-abc123",
  "items": [
    {
      "rowID": "20240318112233-def456",
      "columnID": "20240318112233-ghi789",
      "valueType": "text",
      "text": "值 1"
    },
    {
      "rowID": "20240318112233-def456",
      "columnID": "20240318112233-jkl012",
      "valueType": "number",
      "number": 42
    }
  ]
}
```

#### duplicate_block

**描述**：从现有属性视图复制数据库块。

**权限要求**：写权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `avID` | string | 是 | 源属性视图 ID |
| `previousID` | string | 否 | 在此块 ID 之后插入 |

**示例**：
```json
{
  "action": "duplicate_block",
  "avID": "20240318112233-abc123"
}
```

#### get_primary_key_values

**描述**：获取属性视图的主键值。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `avID` | string | 是 | 属性视图 ID |
| `keyword` | string | 否 | 过滤关键词 |
| `page` | number | 否 | 页码（从 1 开始） |
| `pageSize` | number | 否 | 每页行数 |

**示例**：
```json
{
  "action": "get_primary_key_values",
  "avID": "20240318112233-abc123",
  "keyword": "项目"
}
```

---

### file

文件和资源操作聚合工具。

#### upload_asset

**描述**：上传本地文件到思源资源目录。

**权限要求**：无（但需要用户确认）

**需要确认**：是（大于 10MB 的文件也需要确认）

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `assetsDirPath` | string | 是 | 资源目录（如 `/assets/`） |
| `localFilePath` | string | 是 | 要上传的本地文件路径 |
| `confirmLargeFile` | boolean | 否 | 大于 10MB 文件的确认 |

**示例**：
```json
{
  "action": "upload_asset",
  "assetsDirPath": "/assets/",
  "localFilePath": "/Users/me/image.png"
}
```

#### render_template

**描述**：使用文档上下文渲染模板。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 用于上下文的文档 ID |
| `path` | string | 是 | 工作区内的模板路径 |

**示例**：
```json
{
  "action": "render_template",
  "id": "20240318112233-abc123",
  "path": "/templates/daily.md"
}
```

#### render_sprig

**描述**：渲染 Sprig 模板。

**权限要求**：无

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `template` | string | 是 | Sprig 模板内容 |

**示例**：
```json
{
  "action": "render_sprig",
  "template": "Hello {{ .name }}"
}
```

#### export_md

**描述**：将文档导出为 Markdown。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 文档 ID |

**示例**：
```json
{
  "action": "export_md",
  "id": "20240318112233-abc123"
}
```

#### export_resources

**描述**：将资源导出为 ZIP 压缩包。

**权限要求**：无

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `paths` | string[] | 是 | 要导出的资源路径 |
| `name` | string | 否 | 导出文件名 |
| `outputPath` | string | 否 | 保存 ZIP 的本地路径 |

**示例**：
```json
{
  "action": "export_resources",
  "paths": ["/assets/image.png"],
  "name": "backup.zip",
  "outputPath": "/Users/me/Downloads/backup.zip"
}
```

#### list_unused_assets

**描述**：列出未被引用的资源文件。

#### get_doc_assets

**描述**：列出文档引用的全部资源。

**权限要求**：读权限

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 文档 ID |

#### get_doc_image_assets

**描述**：列出文档引用的图片资源。

**权限要求**：读权限

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 文档 ID |

#### get_image_ocr_text

**描述**：读取图片资源已存储的 OCR 文本。

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `path` | string | 否 | 资源路径；省略时返回空文本 |

---

### search

搜索和查询操作聚合工具。

#### fulltext

**描述**：在所有块中进行全文搜索。

**权限要求**：读权限（按笔记本权限过滤）

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `query` | string | 是 | 搜索查询 |
| `method` | number | 否 | 0=关键词，1=查询语法，2=SQL，3=正则 |
| `types` | object | 否 | 块类型过滤 |
| `paths` | string[] | 否 | 限制在笔记本路径 |
| `groupBy` | number | 否 | 0=不分组，1=按文档分组 |
| `orderBy` | number | 否 | 排序方式（0-7） |
| `page` | number | 否 | 页码 |
| `pageSize` | number | 否 | 每页结果数（最大 128） |
| `stripHtml` | boolean | 否 | 添加纯文本字段 |

**示例**：
```json
{
  "action": "fulltext",
  "query": "会议纪要",
  "method": 0,
  "page": 1,
  "pageSize": 32
}
```

#### query_sql

**描述**：执行只读 SQL 查询。

**权限要求**：读权限（行按权限过滤）

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `stmt` | string | 是 | SELECT 或 WITH 语句 |

**示例**：
```json
{
  "action": "query_sql",
  "stmt": "SELECT * FROM blocks WHERE content LIKE '%待办%' LIMIT 10"
}
```

**注意**：只允许 `SELECT` 和 `WITH` 语句。禁止修改查询。

#### search_tag

**描述**：按关键词搜索标签。

**权限要求**：无

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `k` | string | 是 | 标签关键词 |

**示例**：
```json
{
  "action": "search_tag",
  "k": "项目"
}
```

#### get_backlinks

**描述**：查找链接到某个块的文档/块。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 块或文档 ID |
| `keyword` | string | 否 | 关键词过滤 |
| `refTreeID` | string | 否 | 限制在文档树 |

**示例**：
```json
{
  "action": "get_backlinks",
  "id": "20240318112233-abc123"
}
```

#### get_backmentions

**描述**：查找提及某个块名称的文档/块。

**权限要求**：读权限

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `id` | string | 是 | 块或文档 ID |
| `keyword` | string | 否 | 关键词过滤 |
| `refTreeID` | string | 否 | 限制在文档树 |

**示例**：
```json
{
  "action": "get_backmentions",
  "id": "20240318112233-abc123"
}
```

---

### tag

标签操作聚合工具。

#### list

**描述**：列出工作区中的所有标签。

**权限要求**：无

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `sort` | number | 否 | 排序模式 |
| `ignoreMaxListHint` | boolean | 否 | 忽略最大列表提示 |
| `app` | string | 否 | 应用标识符 |

**示例**：
```json
{
  "action": "list"
}
```

#### rename

**描述**：全局重命名标签。

**权限要求**：无

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `oldLabel` | string | 是 | 现有标签 |
| `newLabel` | string | 是 | 新标签 |

**示例**：
```json
{
  "action": "rename",
  "oldLabel": "old-tag",
  "newLabel": "new-tag"
}
```

#### remove

**描述**：移除标签。

**权限要求**：无

**需要确认**：是

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `label` | string | 是 | 要移除的标签 |

**示例**：
```json
{
  "action": "remove",
  "label": "old-tag"
}
```

---

### system

系统和通知操作聚合工具。

#### push_msg

**描述**：推送通知消息。

**权限要求**：无

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `msg` | string | 是 | 消息内容 |
| `timeout` | number | 否 | 显示超时（毫秒） |

**示例**：
```json
{
  "action": "push_msg",
  "msg": "来自 MCP 的问候！",
  "timeout": 5000
}
```

#### push_err_msg

**描述**：推送错误通知消息。

**权限要求**：无

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `msg` | string | 是 | 错误消息内容 |
| `timeout` | number | 否 | 显示超时（毫秒） |

**示例**：
```json
{
  "action": "push_err_msg",
  "msg": "出错了！",
  "timeout": 10000
}
```

#### get_version

**描述**：获取思源版本。

**权限要求**：无

**参数**：无

**示例**：
```json
{
  "action": "get_version"
}
```

#### get_current_time

**描述**：获取当前系统时间。

**权限要求**：无

**参数**：无

**返回值**：包含 `currentTime` 和 `iso` 字段的对象。

**示例**：
```json
{
  "action": "get_current_time"
}
```

#### workspace_info

**描述**：获取工作区元数据。

**权限要求**：无

**注意**：暴露绝对工作区路径。默认禁用。

**参数**：无

**示例**：
```json
{
  "action": "workspace_info"
}
```

#### network

**描述**：获取网络代理信息。

**权限要求**：无

**参数**：无

**示例**：
```json
{
  "action": "network"
}
```

#### changelog

**描述**：获取当前版本更新日志。

**权限要求**：无

**参数**：无

**示例**：
```json
{
  "action": "changelog"
}
```

#### conf

**描述**：获取系统配置。

**权限要求**：无

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `mode` | string | 否 | `summary`（默认）或 `get` |
| `keyPath` | string | 否 | 字段的点/括号路径 |
| `maxDepth` | number | 否 | 最大遍历深度 |
| `maxItems` | number | 否 | 每级最大键数 |

**示例**：
```json
{
  "action": "conf",
  "mode": "get",
  "keyPath": "conf.appearance.mode"
}
```

#### sys_fonts

**描述**：列出可用的系统字体。

**权限要求**：无

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `mode` | string | 否 | `summary`（默认）或 `list` |
| `offset` | number | 否 | 分页偏移 |
| `limit` | number | 否 | 分页大小 |
| `query` | string | 否 | 按名称过滤 |

**示例**：
```json
{
  "action": "sys_fonts",
  "mode": "list",
  "offset": 0,
  "limit": 50
}
```

#### boot_progress

**描述**：获取启动进度详情。

**权限要求**：无

**参数**：无

**示例**：
```json
{
  "action": "boot_progress"
}
```

---

### flashcard

闪卡复习和卡组操作聚合工具。

#### list_cards

**描述**：列出到期的闪卡。

**权限要求**：无

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `scope` | string | 是 | `all`、`deck`、`notebook` 或 `tree` |
| `filter` | string | 是 | `due`、`new` 或 `old` |
| `deckID` | string | 否 | scope=deck 时必需 |
| `notebook` | string | 否 | scope=notebook 时必需 |
| `rootID` | string | 否 | scope=tree 时必需 |

**示例**：
```json
{
  "action": "list_cards",
  "scope": "all",
  "filter": "due"
}
```

#### get_decks

**描述**：获取闪卡卡组定义。

**权限要求**：无

**参数**：无

**示例**：
```json
{
  "action": "get_decks"
}
```

#### get_cards

**描述**：分页列出卡组中的所有卡片。

**权限要求**：无

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `deckID` | string | 是 | 卡组 ID（空字符串表示全部） |
| `page` | number | 否 | 页码（从 1 开始） |
| `pageSize` | number | 否 | 每页卡片数（最大 512） |

**示例**：
```json
{
  "action": "get_cards",
  "deckID": "20240318112233-abc123",
  "page": 1,
  "pageSize": 32
}
```

#### review_card

**描述**：提交闪卡复习结果。

**权限要求**：无

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `deckID` | string | 是 | 卡组 ID |
| `cardID` | string | 是 | 卡片 ID |
| `rating` | number | 是 | 复习评分 |
| `reviewedCards` | array | 否 | 额外复习数据 |

**示例**：
```json
{
  "action": "review_card",
  "deckID": "20240318112233-abc123",
  "cardID": "20240318112233-def456",
  "rating": 5
}
```

#### skip_review_card

**描述**：在复习流程中跳过当前闪卡。

**权限要求**：无

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `deckID` | string | 是 | 卡组 ID |
| `cardID` | string | 是 | 卡片 ID |

**示例**：
```json
{
  "action": "skip_review_card",
  "deckID": "20240318112233-abc123",
  "cardID": "20240318112233-def456"
}
```

#### add_card

**描述**：将现有块添加到闪卡卡组。

**权限要求**：无

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `deckID` | string | 是 | 卡组 ID |
| `blockIDs` | string[] | 是 | 要添加的块 ID |

**示例**：
```json
{
  "action": "add_card",
  "deckID": "20240318112233-abc123",
  "blockIDs": ["20240318112233-def456"]
}
```

#### remove_card

**描述**：从闪卡卡组中移除块。

**权限要求**：无

**需要确认**：是

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `deckID` | string | 是 | 卡组 ID |
| `blockIDs` | string[] | 是 | 要移除的块 ID |

**示例**：
```json
{
  "action": "remove_card",
  "deckID": "20240318112233-abc123",
  "blockIDs": ["20240318112233-def456"]
}
```

---

### mascot

吉祥物余额和照料操作聚合工具。每次成功的 MCP 工具调用都会赚取 1 枚硬币。

#### get_balance

**描述**：获取吉祥物的当前可消费余额。

**权限要求**：无

**参数**：无

**返回值**：包含 `balance` 和 `totalEarned` 字段的对象。

**示例**：
```json
{
  "action": "get_balance"
}
```

#### shop

**描述**：列出吉祥物商店库存。

**权限要求**：无

**参数**：无

**返回值**：商店项目数组，包含 `id`、`label`、`cost`、`type` 和 `emoji`。

**示例**：
```json
{
  "action": "shop"
}
```

#### buy

**描述**：从吉祥物商店购买物品。

**权限要求**：无

**参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `item_id` | string | 是 | 商店物品 ID |

**示例**：
```json
{
  "action": "buy",
  "item_id": "cat-food"
}
```

**可用物品**：

| ID | 名称 | 价格 | 类型 | Emoji |
|----|------|------|------|-------|
| `cat-food` | 猫粮 | 5 | 食物 | |
| `milk` | 牛奶 | 3 | 饮料 | |
| `dried-fish` | 鱼干 | 4 | 食物 | |
| `can-food` | 罐头 | 6 | 食物 | |
| `catnip` | 猫薄荷 | 5 | 零食 | |
| `chicken-leg` | 鸡腿 | 7 | 食物 | |
| `cheese` | 奶酪 | 4 | 零食 | |

---

## Action 汇总

总计：**10 个工具** 包含 **79 个 action**

| 工具 | 数量 | Actions |
|------|------|---------|
| notebook | 12 | list, create, open, close, remove, rename, get_conf, set_conf, set_icon, get_permissions, set_permission, get_child_docs |
| document | 16 | create, rename, remove, move, get_path, get_hpath, get_ids, get_child_blocks, get_child_docs, set_icon, set_cover, clear_cover, list_tree, search_docs, get_doc, create_daily_note |
| block | 19 | insert, prepend, append, update, delete, move, fold, unfold, get_kramdown, get_children, transfer_ref, set_attrs, get_attrs, exists, info, breadcrumb, dom, recent_updated, word_count |
| av | 13 | get, render_attribute_view, get_attribute_view_keys, get_attribute_view_filter_sort, search, add_rows, remove_rows, add_column, remove_column, set_cell, batch_set_cells, duplicate_block, get_primary_key_values |
| file | 13 | upload_asset, render_template, render_sprig, export_md, export_resources, list_unused_assets, get_doc_assets, get_doc_image_assets, get_image_ocr_text, remove_unused_assets, rename_asset, delete_asset, set_image_alpha |
| search | 5 | fulltext, query_sql, search_tag, get_backlinks, get_backmentions |
| tag | 3 | list, rename, remove |
| system | 10 | push_msg, push_err_msg, get_version, get_current_time, workspace_info, network, changelog, conf, sys_fonts, boot_progress |
| flashcard | 7 | list_cards, get_decks, get_cards, review_card, skip_review_card, add_card, remove_card |
| mascot | 3 | get_balance, shop, buy |

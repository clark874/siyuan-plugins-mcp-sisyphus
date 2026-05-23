# SiYuan Sisyphus MCP & CLI 设计与实现洞察

> 基于多轮体验测试和迭代反馈的经验总结


---

## 架构设计洞察

### 1. 渐进式信息读取设计

**核心原则**: 避免一次性返回巨大对象，让 AI 按需探索。

**实践案例**:
```typescript
// system(action="conf") 的设计
// 第一步：获取摘要
{ mode: "summary" }  // 返回 32 个顶层配置项列表

// 第二步：按需深入
{ mode: "get", keyPath: "appearance.mode" }  // 返回具体值
```

**设计优势**:
- 减少 token 消耗
- 降低认知负担
- 支持探索式交互

**应用场景**:
- 系统配置读取 (`system.conf`)
- 定位式配置读取 (`system.conf` + `keyPath`)
- 文档树层级控制 (`document.list_tree` with `maxDepth`)

### 2. 聚合工具设计模式

**核心原则**: 按功能域聚合相关操作，而非按操作类型分散。

**对比**:
```
传统设计: createDoc / deleteDoc / renameDoc / moveDoc (按操作)
当前设计: document(action="create"|"remove"|"rename"|"move") (按功能域)
```

**设计优势**:
- 减少工具数量，降低选择成本
- 相关操作内聚，便于理解
- 统一的权限检查和错误处理

**实现要点**:
- 使用 `action` 参数区分具体操作
- 每个 action 有独立的参数校验
- 统一的响应结构（`success` / `error` / `uiRefresh`）

### 3. 权限系统分层设计

**权限模型**:
```
none: 完全不可访问
r:    只读
rw:   读写（不可删除）
rwd:  读写删（完全访问）
```

**关键设计决策**:
1. **笔记本级权限**: 以笔记本为最小权限单元
2. **运行时检查**: 每次操作前解析目标资源所属笔记本
3. **清晰错误信息**: 返回 `current_permission` 和 `required_permission`

**错误响应示例**:
```json
{
  "error": {
    "type": "permission_denied",
    "notebook": "xxx",
    "current_permission": "r",
    "required_permission": "write"
  }
}
```

### 4. UI 自动刷新机制

**设计原则**: 数据操作与界面同步解耦，通过事件机制触发刷新。

**实现模式**:
```typescript
// 操作成功后返回 uiRefresh 字段
{
  "success": true,
  "uiRefresh": {
    "applied": true,
    "operations": [
      { "type": "reloadProtyle", "id": "..." },
      { "type": "reloadFiletree" }
    ]
  }
}
```

**优势**:
- 用户界面实时同步
- 支持批量操作后统一刷新
- 客户端可自定义刷新策略

---

## API 设计最佳实践

### 1. 写操作返回值精简

**原则**: 写操作返回确认信息而非完整资源。

**推荐结构**:
```typescript
{
  "success": true,
  "id": "block-id",           // 创建的/更新的资源 ID
  "parentID": "...",          // 父级上下文
  "previousID": "...",        // 位置上下文
  "dataType": "markdown",     // 数据类型
  "uiRefresh": { ... }        // UI 刷新指令
}
```

**避免**: 返回完整 DOM 操作数组或资源全文（除非明确请求）。

### 2. 路径双轨制

**两种路径类型**:

| 类型 | 用途 | 示例 |
|------|------|------|
| Human-readable | 创建、ID 查询 | `/Inbox/Weekly Note` |
| Storage path | 重命名、移动、删除 | `/20240318112233-abc123.sy` |

**最佳实践**:
1. 文档中明确标注每种操作接受的 path 类型
2. 校验失败时提示 "当前 path 类型不匹配"
3. 提供 `lookup` 工具进行路径转换

**安全流程**:
```
document(action="lookup", id=..., include="path") -> 获取 storage path
-> 复用 storage path 进行 rename/move/remove
```

### 3. 权限过滤与数据安全

**关键原则**: 任何返回数据的操作都必须经过权限过滤。

**需要过滤的场景**:
- 全文搜索 (`search.fulltext`)
- SQL 查询 (`search.query_sql`)
- 最近更新 (`block.recent_updated`)
- 反链查询 (`search.get_backlinks`)

**过滤策略**:
```typescript
// 对搜索结果进行权限过滤
const filtered = results.filter(item => {
  const notebook = extractNotebook(item);
  return permissionManager.canRead(notebook);
});

// 返回过滤信息
{
  "results": filtered,
  "filteredOutCount": results.length - filtered.length,
  "pathApplied": true
}
```

### 4. 降级与容错设计

**Fallback 模式**:
当主数据源不可用时，提供替代方案并明确标记。

**示例** (反链查询):
```json
{
  "backlinks": [...],
  "fallbackUsed": true,
  "sourcePayloadMissing": true,
  "fallbackQuery": "sql",
  "resultConfidence": "fallback",
  "warning": "SiYuan returned no backlink payload; SQL fallback results are shown."
}
```

**设计要点**:
- 明确标记 fallback 使用情况
- 提供结果可信度指标
- 包含警告信息供上层决策

### 5. 帮助系统的自文档化

**设计**: 每个工具支持 `action="help"`，返回：
- 所有 action 列表
- 必填字段说明
- 使用提示和示例
- 相关资源链接

**实现价值**:
- 降低学习成本
- 支持 AI 自动发现能力
- 减少文档与实现不一致

---

## 测试策略建议

### 1. 全量回归测试框架

**测试维度**:

| 维度 | 覆盖内容 | 工具 |
|------|----------|------|
| 功能覆盖 | 所有 actions | 12 个工具 |
| 权限测试 | r/rw/none/rwd 四档 | notebook 工具 |
| 场景测试 | 真实用户工作流 | 多角色模拟 |
| 边界测试 | 空值、超长、特殊字符 | 各工具边界 |

**测试环境隔离**:
- 使用专用测试笔记本
- 测试数据与生产数据分离
- 写操作仅落在测试对象上

### 2. 多角色体验测试

**角色设计**:
```
产品经理: 需求文档、PRD、版本规划
开发者: 技术笔记、代码片段、API 文档
研究生: 文献管理、论文写作、知识图谱
创作者: 文章写作、素材整理、灵感记录
项目经理: 任务追踪、会议记录、权限管理
```

**测试价值**:
- 发现不同场景下的体验差异
- 验证功能覆盖的完整性
- 收集多元化反馈

### 3. 权限边界测试要点

**必测场景**:
1. **读取测试**: `none` 权限笔记本数据不应泄露
2. **写入测试**: `r` 权限笔记本应阻断写入
3. **删除测试**: `rw` 权限笔记本应阻断删除
4. **跨笔记本测试**: 操作涉及多笔记本时的权限检查

**验证方法**:
```typescript
// 设置权限 -> 执行操作 -> 验证结果
notebook(action="set_permission", permission="none");
// 尝试读取
document(action="get_doc", ...);  // 应返回 permission_denied
```

### 4. 索引延迟处理

**已知问题**: 文档创建后，立即查询可能遇到索引延迟。

**处理策略**:
1. **文档提示**: 在 help 中说明可能的延迟
2. **重试机制**: AI 在 create 后如需立即查询，应容忍短暂重试
3. **返回值设计**: 创建操作返回完整信息，减少立即查询需求

---

## 部署经验总结

### 1. 错误处理模式

**结构化错误**:
```typescript
{
  "error": {
    "type": "permission_denied" | "not_found" | "validation_error" | "api_error",
    "message": "人类可读描述",
    "...": "额外上下文"
  }
}
```

**类型定义**:
- `permission_denied`: 权限不足
- `not_found`: 资源不存在
- `validation_error`: 参数校验失败
- `api_error`: 底层 API 错误

### 2. 时间格式统一

**问题**: SQL 查询返回 `20260219162616` 格式，与其他地方不一致。

**建议**: 提供标准化时间格式：
```typescript
// 原始格式
"created": "20260219162616"

// 标准化后
"created": "2026-02-19T16:26:16+08:00",
"createdEpoch": 1708333576000
```

### 3. 批量操作支持

**需求场景**:
- 批量创建块
- 批量更新单元格
- 批量移动文档

**实现建议**:
- 复用事务 API (`/api/transactions`)
- 提供 `batch_*` 系列 actions
- 返回批量操作结果和失败项

### 4. 性能优化要点

**N+1 查询问题**:
- `list_tree` 逐个获取文档信息
- 解决方案：批量获取或缓存

**大数据量处理**:
- 搜索结果分页
- SQL 查询结果截断提示
- 树形结构深度控制 (`maxDepth`)

---

## 总结

SiYuan Sisyphus MCP & CLI 的设计遵循以下核心原则：

1. **AI 优先**: 所有设计决策考虑 AI 使用场景
2. **渐进披露**: 避免信息过载，支持探索式交互
3. **安全第一**: 权限检查贯穿所有数据访问
4. **反馈清晰**: 操作结果明确，错误信息可行动
5. **实时同步**: 数据操作与界面状态保持一致

这些原则使得 MCP 不仅是一个 API 封装，更是一个适合 AI 长期稳定依赖的知识管理基础设施。

---

*文档整理时间: 2026-04-14*
*基于: AI_MCP_EXPERIENCE_REPORT_001-005, API_MAPPING, API_UPDATE_SUGGESTIONS*

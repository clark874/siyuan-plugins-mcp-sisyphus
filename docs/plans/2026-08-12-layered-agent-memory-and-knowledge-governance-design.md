# 分层 Agent 记忆与知识治理设计

## 目标

将 MCP 接入、工作区导航、专题知识和知识原子治理分层，避免一次性专题实验进入所有会话的启动上下文，同时保留“先查库、再生成”的跨 Agent 工作方式。

## 边界

- `/AGENTS.md` 只保存稳定工作区地图、通用检索顺序和少量长期入口，不保存专题原子枚举、动态计数、审计结果或一次性兼容性发现。
- 初始化说明只发布 `/AGENTS.md` 的状态和读取指针，不再嵌入全文；`bootstrap.nextCalls` 继续把读取记忆放在浏览笔记本之前。
- 专题事实保留在专题知识中枢和操作知识库。`textnets` 的原子列表、环境兼容性和项目边界不进入全局记忆。
- `name`、`alias`、候选编译、冲突预检、四层改名审计和 SQL 回读封装为 `knowledge-governance` 场景 Skill，通过 MCP、CLI、Prompt 和 Skills-over-MCP 按需发布。
- 动态数量由 SQL 实时计算。更新时间状态仅说明记忆最近保存，不代表内容已经与数据库核账。

## 数据流

```text
MCP initialize
  -> 返回记忆路径、更新时间状态和读取要求
  -> Agent 调用 bootstrap
  -> nextCalls 首项读取 /AGENTS.md
  -> /AGENTS.md 指向专题中枢或 knowledge-governance Skill
  -> Agent 按任务需要运行实时 SQL
  -> 写入后按稳定块 ID 与 SQL 双重回读
```

## 安全与维护

- 保留完整、机器可读的 Tool 输入 schema，不用不完整的公开 schema 换取微小载荷下降。
- 记忆缺失或过期时仍要求先取得用户同意再创建或刷新。
- 专题中枢修改前创建文档级时间线节点。
- 临时冷启动项目移入系统废纸篓，保留可恢复性。
- 每次发布统一更新版本、生成 Skill、完整测试、生产构建、安装产物和 Git 远端。

## 验收标准

1. 初始化说明不含 `/AGENTS.md` 正文，但能明确引导读取。
2. `bootstrap.memory` 明示更新时间状态不等于内容核验。
3. `/AGENTS.md` 不含 `textnets-*` 原子枚举、动态统计或专题 SQL。
4. 新知识治理 Skill 可通过资源、Prompt、CLI/MCP Skill 包发现。
5. 当前安装版可由 Git 提交重建，源码、`dist` 与安装目录一致。

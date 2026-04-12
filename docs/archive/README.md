# 文档归档说明

## 概述

本文档归档目录包含 SiYuan MCP Sisyphus 项目早期的体验报告和技术文档。这些文档记录了项目从 v0.1.x 到 v0.2.x 迭代过程中的测试发现、问题修复和功能演进。

## 归档文件列表

### 体验报告系列

| 文件名 | 日期 | 测试版本 | 核心内容 |
|--------|------|----------|----------|
| `AI_MCP_EXPERIENCE_REPORT_001.md` | 2026-04-03 | 3.6.2 | 首次全面体验报告，覆盖 7 个工具、59 个 action |
| `AI_MCP_EXPERIENCE_REPORT_002.md` | 2026-04-03 | - | 当前版本复盘，聚焦权限边界和契约一致性问题 |
| `AI_MCP_EXPERIENCE_REPORT_003.md` | 2026-04-06 | 3.6.3 | 全量回归测试，覆盖 9 个工具，包含复测结论 |
| `AI_MCP_EXPERIENCE_REPORT_004.md` | 2026-04-07 | 3.6.2 / 0.1.16 | 用户试用体验报告，真实用户视角 |
| `AI_MCP_EXPERIENCE_REPORT_TEAM_005.md` | 2026-04-07 | 3.6.2 / 0.1.16 | 多角色协同体验（PM/Dev/Grad/Creator/PMO）|

### 技术文档

| 文件名 | 日期 | 核心内容 |
|--------|------|----------|
| `API_MAPPING.md` | 2026-04-08 | API 映射关系与覆盖率分析 |
| `API_UPDATE_SUGGESTIONS.md` | 2026-04-08 | 基于体验报告的 API 更新建议 |

## 原始文件位置

所有原始文件仍保留在仓库根目录的 `doc/` 文件夹中：

```
doc/
├── AI_MCP_EXPERIENCE_REPORT_001.md
├── AI_MCP_EXPERIENCE_REPORT_002.md
├── AI_MCP_EXPERIENCE_REPORT_003.md
├── AI_MCP_EXPERIENCE_REPORT_004.md
├── AI_MCP_EXPERIENCE_REPORT_TEAM_005.md
├── API_MAPPING.md
└── API_UPDATE_SUGGESTIONS.md
```

## 内容整合状态

### 已整合到新文档的内容

以下主题的内容已提取并整合到 `docs/insights.md`：

1. **架构设计洞察**
   - 渐进式信息读取设计（system conf/sys_fonts）
   - 权限系统的错误信息设计
   - 聚合工具设计模式

2. **API 设计最佳实践**
   - 写操作返回值精简原则
   - 路径双轨制（human-readable vs storage path）
   - 权限过滤与数据安全

3. **测试策略建议**
   - 全量回归测试方法
   - 多角色体验测试框架
   - 权限边界测试要点

4. **部署经验总结**
   - UI 自动刷新机制
   - 索引延迟处理
   - 错误处理与降级策略

### 仅作为历史参考保留的内容

以下内容保留在原始文档中，仅作为历史参考：

1. **具体 Bug 修复记录** - 如 `exists` 对无效 ID 抛错、`duplicate_block` 假成功等问题已在后续版本修复
2. **版本特定的测试数据** - 包含具体 ID 和时间的测试记录
3. **已废弃的 API 建议** - 部分建议 API 可能已实现或调整

## 建议阅读顺序

### 对于新贡献者

1. 先阅读 `docs/insights.md` - 了解项目设计原则
2. 如需了解历史演进，阅读 `AI_MCP_EXPERIENCE_REPORT_004.md`（用户试用报告）- 最友好的入门介绍

### 对于维护者

1. `AI_MCP_EXPERIENCE_REPORT_003.md` - 最新的全量测试覆盖
2. `API_MAPPING.md` - API 覆盖情况
3. `API_UPDATE_SUGGESTIONS.md` - 待实现功能参考

### 对于研究者

1. `AI_MCP_EXPERIENCE_REPORT_001.md` - 首次全面评估方法论
2. `AI_MCP_EXPERIENCE_REPORT_TEAM_005.md` - 多角色测试方法论
3. `AI_MCP_EXPERIENCE_REPORT_002.md` - 问题分类与优先级方法论

## 文档演进时间线

```
2026-04-03  ├─ REPORT_001: 首次全面体验报告 (7 tools, 59 actions)
            └─ REPORT_002: 版本复盘与问题分析

2026-04-06  └─ REPORT_003: 全量回归测试 (9 tools, 100% coverage)

2026-04-07  ├─ REPORT_004: 用户试用体验
            └─ REPORT_TEAM_005: 多角色协同体验

2026-04-08  ├─ API_MAPPING.md: API 映射分析
            └─ API_UPDATE_SUGGESTIONS.md: 更新建议

2026-04-12  └─ 本文档归档整理完成
```

## 关键里程碑

| 里程碑 | 对应文档 | 说明 |
|--------|----------|------|
| v0.1.x 基础功能验证 | REPORT_001 | 首次全面测试，发现 14 个问题 |
| 权限系统完善 | REPORT_002 | 识别权限边界漏洞 |
| v0.1.16 功能完备 | REPORT_003 | 9 工具 100% 覆盖 |
| 用户体验优化 | REPORT_004/005 | 真实用户反馈 |
| v0.2.x 规划 | API_UPDATE_SUGGESTIONS | 新增 14+ actions |

---

*归档整理时间: 2026-04-12*

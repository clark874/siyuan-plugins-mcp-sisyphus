---
name: git-workflow-cn
description: >
  Chinese git workflow conventions including commit message generation and merge practices.
  Use when the user asks to "write a commit", "generate commit message", "写commit",
  "写提交信息", "生成commit", or any git operation where Chinese conventions apply.
  Also triggers for merge requests, branch operations, or git workflow questions in Chinese.
---

# 中文 Git 工作流规范

本 skill 规范项目中所有与 Git 相关的中文输出与操作习惯，包括提交信息撰写与分支合并策略。

---

## 一、中文 Commit Message 生成

根据当前暂存区的改动，生成符合标准格式的中文 commit message。

### 工作流

1. **查看改动范围**：执行 `git status` 与 `git diff --stat --staged`，快速了解修改了哪些文件、增删行数。
2. **阅读关键 Diff**：对新增文件、核心逻辑改动执行 `git diff --staged -- <file>`，提取功能点；如果改动很多，优先阅读业务核心文件，忽略格式化、lock 文件等噪音。
3. **确定类型与范围**：根据改动性质选择 `<type>` 与 `<scope>`。
4. **撰写消息**：按下方格式输出；若用户偏好更详细版本，提供完整版与精简版两个选项。

### 格式规范

```
<type>emoji(<scope>): <subject>

- <动词> <改动点1>
- <动词> <改动点2>
- ...
```

#### type（必填）

| 类型     | Emoji | 含义                             |
| -------- | ----- | -------------------------------- |
| feat     | ✨     | 新功能                           |
| fix      | 🐛     | 修复问题                         |
| docs     | 📝     | 文档、注释、README 等            |
| style    | 💄     | 代码格式、分号、空行等无逻辑改动 |
| refactor | ♻️     | 重构（既非新功能也非修复）       |
| perf     | ⚡     | 性能优化                         |
| test     | ✅     | 测试相关                         |
| chore    | 🔧     | 构建、依赖、工具链、杂项         |
| revert   | ⏪     | 回滚提交                         |

Emoji 放在 `<type>` 与 `(<scope>)` 之间（无 scope 时紧跟 type），例如 `feat✨(scope): subject` 或 `docs📝: subject`。

#### scope（可选）

- 使用模块名、包名或目录名，如 `terrain_yolo_matching`、`projection`、`docs`
- 若改动跨多个大模块，可省略 scope

#### subject（必填）

- 简短概括，不超过 50 个汉字
- 句末不加句号
- 使用祈使语气/动宾结构，如 "重构采样逻辑"、"修复内存泄漏"

#### body（可选但推荐）

- 每条以动词开头：`新增`、`修复`、`重构`、`移除`、`优化`、`补全`、`更新`、`调整`、`统一`、`引入`、`升级`、`降级`
- 每条控制在 30 字以内，聚焦单一改动点
- 技术名词保留英文（函数名、类名、配置项、文件扩展名等），不强行翻译
- 按重要性排序，最重要的放在最前面
- 总条数建议 3~7 条；若改动极小（如单行修复），可省略 body，只保留 subject

#### 注意事项

- **不要猜测**：只根据实际 diff 内容描述，不脑补未发生的改动
- **区分主要与次要**：核心逻辑改动放在前面，格式化、依赖升级、配置文件调整放在后面或省略
- **中英混排**：中文与英文单词之间留一个空格，如 `单 ping 地形 patch`
- **多文件同功能**：若多个文件服务于同一功能，合并为一条描述，不逐文件罗列
- **数据/配置文件**：YAML、JSON、Notebook 等配置更新用 `更新配置` 或 `同步调整实验配置`

#### 示例

```
feat✨(terrain_yolo_matching): 重构投影采样与向量索引特征工程

- 新增足迹感知的单 ping 地形 patch 采样逻辑
- 向量索引支持 compact_stats_v1 / enhanced_profile_v1 特征
- 匹配评分由 cosine 相似度升级为 enhanced_profile_similarity_score
- 样本构建流程增加分阶段耗时统计
- 补全项目级 AGENTS.md 开发文档
```

```
fix🐛(projection): 修复单 ping 无有效波束时的越界采样

- 在 _valid_projection_ping_indices 中增加有限值校验
- 无有效命中时提前抛出 RuntimeError，避免传入空 patch
```

```
chore🔧: 升级 black 与 ruff 并统一代码格式

- 更新 pre-commit 配置至 v4.0
- 全库执行格式化，消除尾随空格
```

---

## 二、Merge 规范（默认 --no-ff）

### 原则

**所有涉及 merge 的操作，默认使用 `--no-ff`（no fast-forward）**，以保留完整的分支历史与功能边界，便于后续回溯、回滚与代码审查。

### 标准命令

```bash
# 合并特性分支到主分支（推荐）
git checkout main
git merge --no-ff feature/xxx

# 若需自定义合并提交信息
git merge --no-ff -m "merge✨: 合并某某功能分支" feature/xxx
```

### 例外情况

仅在以下场景允许省略 `--no-ff` 或使用其他合并策略：

1. **单人本地临时分支**：个人开发且未推送到远程的短期分支，可使用 fast-forward 保持历史线性
2. **明确使用 squash merge**：需要将多个提交压缩为一个时，使用 `git merge --squash`（但需单独提交）
3. **执行 rebase 后合并**：若已通过 `git rebase main` 将特性分支变基到最新主线，且用户明确要求 fast-forward

### merge commit message 规范

当使用 `--no-ff` 产生合并提交时，message 遵循以下格式：

```
merge✨(<source-branch>): 合并 <source-branch> 到 <target-branch>

- 合入功能：简述该分支带来的核心改动
- 关联：#123（如有 issue / PR 编号）
```

若用户未指定 message，自动生成并提示确认后再执行合并。

### 禁止行为

- 不要在公共主干分支上直接 fast-forward 合并功能分支，除非团队明确约定使用 rebase + ff 工作流
- 不要生成无意义的默认 merge message（如 "Merge branch 'feat/xxx'"），应补充中文说明

---

## 三、其他通用约定

- **分支命名**：使用英文小写 + 连字符，如 `feat/terrain-projection`、`fix/matching-bug`
- **提交前检查**：鼓励先执行 `git diff --cached --check` 检查空白错误
- **rebase 交互式清理**：在合并前，若特性分支提交历史混乱，建议使用 `git rebase -i main` 整理提交

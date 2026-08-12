# 思源 Agent 交接卡

> **跨模型/客户端交接的标准状态文档**。约 1500 token,代替完整聊天记录。
> 新 agent 接入时只需读本卡 + 入口 skill `siyuan-quick-start`,无需考古历史讨论。
> 最后更新:2026-08-12

---

## 一、当前环境

| 项 | 值 |
|----|----|
| 思源笔记 | 3.7.3(运行于 `127.0.0.1:6806`) |
| Sisyphus MCP | 0.7.5-local.14 **定制版**(运行于 `127.0.0.1:36806/mcp`) |
| ZCode 接入 | server 名 `siyuan`,`type: http`,session 启动自动连接 |
| 维护仓库 | `~/Downloads/siyuan-plugins-mcp-sisyphus-maintained` |
| 思源安装目录 | `~/Downloads/SiYuan/data/plugins/siyuan-plugins-mcp-sisyphus` |
| GitHub Fork | `clark874/siyuan-plugins-mcp-sisyphus`(分支 `codex/local-maintenance`) |

## 二、强制规则(不可违反)

1. **不读取/输出 token** —— 鉴权由客户端 `headers` 承载。
2. **不直连思源工作区文件** —— 所有操作经 MCP 工具,禁止读写 `~/Downloads/SiYuan/data/`。
3. **不探测端口、不手写 MCP 协议** —— `initialize`/`tools/list` 由客户端完成。
4. **普通文档路径优先用 `fs`**(人类可读路径 `/笔记本/.../文档`)。
5. **写前读、写后复核**;危险操作(`rm`/`mv`)需用户确认。

## 三、当前知识库

### 笔记本
- **工作日志**(id `20210823223507-wob4nnc`,权限 `rwd`,已开启)— 主笔记本
- 文章数据列表、根目录(已关闭)

### 工作日志目录结构(功能重组后,7 个一级目录)
```
00 导航与说明
01 学术研究与成果      在研论文15 / 科研管理6 / 投稿11 / 决策咨询4 / 灵感1
02 教学与学生指导      课程9 / 学生指导11 / 教师竞赛4 / 班主任5
03 行政事务与职业发展  会议 / 党务 / 学位答辩 / 职业发展 / 凭证账号
04 研究方法与数字工具  数据获取 / 清洗 / 统计 / 文本分析 / 网络 / 自动化 / 图表 / 设备 / 代码归档 / 研究设计(10 子类)
05 个人生活与记录
90 待整理与归档
```

### 关键知识资产
- **Scattertext 知识中枢**:`/工作日志/04 研究方法与数字工具/04 文本分析与自然语言处理/05 Scattertext/00 Scattertext方法与项目知识中枢`(id `20260810183622-w2qieo2`)
  - 含真实数据库「Scattertext 知识资产总表」(32 行 × 6 列)
  - 35 个块引用串联 33 个既有知识块
  - 别名:`Scattertext知识中枢` / `Scattertext总览` / `Scattertext知识地图`

## 四、当前能力

| 能力 | 工具 | 状态 |
|------|------|------|
| 文档读写 | `fs` | ✅ 可用 |
| 数据库(属性视图) | `av` | ✅ 可用(含定制 `rename`) |
| 全文检索 / SQL | `search` | ✅ 可用 |
| 时间线 / 快照 / 历史差异 | `timeline` | ✅ 可用 |
| 环境审计 | `system.audit_environment` | ✅ 可用(定制) |
| 扩展盘点 | `system.list_packages` | ✅ 可用(定制) |
| 虚拟引用直接读取 | — | ❌ 仅间接(全文检索模拟) |
| 第三方插件配置读取 | — | ❌ 不读取 |

## 五、Sisyphus 定制升级(相对上游 v0.6.0)

1. `system.audit_environment` — 思源环境总览(版本/配置/扩展)
2. `system.list_packages` — 插件/主题/挂件/图标/模板分页盘点
3. `av.rename` — 数据库重命名(含安全校验)
4. `mSelect`/`mAsset` 响应精简修复(选项文字不再丢失)
5. 最近更新面板:时间轴 + 历史差异 + 目录聚合(默认关闭)

## 六、推荐起始调用

```
mcp__siyuan__system(action="bootstrap")                          # 一键环境状态
mcp__siyuan__notebook(action="list")                              # 笔记本清单
mcp__siyuan__fs(action="tree", path="/工作日志", maxDepth=2)      # 目录结构
mcp__siyuan__search(action="fulltext", query="关键词")            # 全文检索
```

## 七、升级维护流程

**作者发新版时**(不要直接更新思源集市版,会覆盖定制):
```
git fetch upstream
git merge upstream/main          # 合并到 codex/local-maintenance
pnpm test                        # 跑全量测试
pnpm build                       # 构建
备份已安装插件 → 覆盖部署 → 重载
git commit && git push
```

**token 变化时**:
```
python3 ~/.zcode/skills/siyuan-quick-start/scripts/sync-mcp-config.py
```

## 八、设计背景(仅在需要追溯时阅读)

完整历史讨论见此前的 codex 对话记录。核心结论:
- 思源核心优势 = 完整开源 + 原生块对象模型 + 块数据库(非"独有虚拟引用/数据库")
- 推荐用法:目录管稳定归属 / 数据库管横向状态 / 虚拟引用管候选发现 / 正式引用管确认关系
- 跨项目知识中枢参考 Karpathy "LLM Wiki" 思路,但采用思源块模型而非 Obsidian 文件结构

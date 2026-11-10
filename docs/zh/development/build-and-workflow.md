# 构建与工作流

这个页面解释构建目标和日常开发工作流。

适用场景：你需要构建插件、构建 CLI，或者把插件链接进思源。

## 构建目标

- `renderer` -> `src/index.ts`
- `server` -> `src/core/server.ts`
- `cli` -> `src/cli/index.ts`

## 常用命令

```bash
pnpm dev
pnpm build
pnpm build:cli
pnpm make-link
pnpm make-install
```

## 工作流

- 日常插件开发使用 `pnpm dev`
- 发布前验证和打包使用 `pnpm build`
- 修改 CLI 行为时使用 `pnpm build:cli`
- CLI 运行时代码在 `src/cli/*`，npm 包元数据在 `cli/`

## 单一业务技能入口

用户侧只安装 `siyuan`。项目接续、完整资料录入、文献与论文教学由同一入口按任务读取内部规程；参数以实时帮助为准。源文件为 `skills/source/scenarios.mjs` 及录入、教学参考，`npm run skills:generate` 同步生成 Codex、Agent Kit 和 Codex Plugin 三处公开入口，`npm run skills:check` 拒绝额外入口。

资料交付分别核对：完整资料副本、能独立回答问题的知识原子、当前项目入口和状态。普通笔记不强制原子化，指定全文不能以摘要替代；强验证状态必须有真实证据。见 [资料录入契约](../../../skills/source/recording-contract.md) 和 [正负例](../../../skills/source/recording-examples.md)。

旧技能迁移依照精确名称及内容归属执行，备份放在扫描根之外；自有同名技能冲突时保留原件并停止。`skills update`、实际部署、宿主界面刷新是不同步骤。需要重新加载时由用户操作。

项目快照的 `summary` 是索引窗口，明确报告截断；指定完整阅读时继续取 `full` 和稳定块正文。`custom-source-role=source-document|source-entry` 与明确项目归属让资料进入项目快照，不以name/alias模糊猜归属。保留历史裁决，当前投影只能依据用户核准的新裁决更新。

开发发布按 [发布参考](../../development/release-workflow.md) 完成最终对象确认、两附件和稳定通道核验。公开操作前等待绑定精确提交的用户口令。

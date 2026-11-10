# 开发与发布参考

本说明供已授权的 Sisyphus 开发任务按需读取，不是用户笔记业务技能。业务唯一入口为 `siyuan`，源码在 `skills/source/scenarios.mjs` 与对应参考文件，由 `npm run skills:generate` 同源生成。

## 实施与验收

- 先读取真实调用链及当前差异；保留用户未提交内容。修改使用独立工作树。
- 优先相关既有测试。修改行为且无覆盖时只补当前主路径和必要失败路径；不得借机搭建测试体系。
- 技能源修改后运行 `npm run skills:check`，公开三个载体各只能包含一个 `siyuan/SKILL.md`，内部场景继续按需读取。
- 运行适用的类型检查、单元测试和自然任务验收。验证生成文件、独立代码审查、真实调用是不同证据，不相互替代。
- `npm run build` 生成插件和接入包；`npm run build:cli` 验证同源CLI，不代表已发布npm。

## 发布对象

根 `package.json`、`plugin.json`、Agent Kit delivery/Kimi manifest、Codex Plugin manifest、最新说明保持同一插件版本；CLI版本独立。更新 `CHANGELOG.md` 并校验 `package.zip`、`siyuan-agent-kit.zip` 内容与SHA-256。稳定通道为 `release-channel.json`，必须指向本次两附件及真实哈希。

公开前展示精确提交、版本、仓库、两附件及稳定通道，按用户规定取得绑定本次对象的口令；未收到不得推送或创建公开发行。不要把旧版确认沿用到新提交。公开后回验远端提交与下载附件哈希。

## 本机交付

安装使用既有同级暂存、校验、原子交换及恢复备份；禁止删目录后复制。技能迁移必须校验归属、保留用户同名内容，备份放扫描根之外。安装、进程实际加载版本与界面发现分别核验。思源／Codex重启与插件重载由用户执行，代理不代劳。

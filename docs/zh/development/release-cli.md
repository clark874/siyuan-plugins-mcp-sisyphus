# Release CLI

这个页面描述独立 CLI 包的发布流程。

适用场景：你要发布 `siyuan-sisyphus` 这个 npm 包。

## 工作流

1. 更新 `cli/package.json` 版本号
2. 执行 `pnpm build:cli`
3. 可选：在 `cli/` 目录下执行 `npm pack --dry-run`
4. 使用 `pnpm publish:cli` 或 `npm publish --access public` 发布

## 说明

- CLI 包从 `cli/` 子目录发布
- 运行时代码会打包到 `cli/dist/cli.cjs`

# Build and Workflow

This page explains the build targets and the normal development loop.

When to read this page: you need to build the plugin, build the CLI, or link the plugin into SiYuan.

## Build Targets

- `renderer` -> `src/index.ts`
- `server` -> `src/core/server.ts`
- `cli` -> `src/cli/index.ts`

## Common Commands

```bash
pnpm dev
pnpm build
pnpm build:cli
pnpm make-link
pnpm make-install
```

## Workflow

- Use `pnpm dev` for day-to-day plugin development
- Use `pnpm build` for release validation and packaging
- Use `pnpm build:cli` when you are changing CLI behavior
- CLI runtime code lives in `src/cli/*`, while npm package metadata lives in `cli/`

## 统一入口与录入验收

业务技能统一为 `siyuan`，内部场景按需读取。生成、迁移、全文与知识分层验收、项目快照及宿主刷新边界见 [工作流说明](../zh/development/build-and-workflow.md)。开发和发布使用 [发布参考](release-workflow.md)，不再作为业务技能安装。

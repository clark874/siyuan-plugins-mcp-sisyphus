# Release CLI

This page describes the standalone CLI package release flow.

When to read this page: you are publishing the `siyuan-sisyphus` npm package.

## Workflow

1. Update `cli/package.json` version
2. Run `pnpm build:cli`
3. Optionally run `npm pack --dry-run` in `cli/`
4. Publish with `pnpm publish:cli` or `npm publish --access public`

## Notes

- The CLI package is published from the `cli/` subdirectory
- Runtime code is bundled into `cli/dist/cli.cjs`

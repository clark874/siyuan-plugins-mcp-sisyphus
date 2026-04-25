---
name: siyuan-plugin-pub
description: Publish a SiYuan plugin release in this repo by syncing version files, updating changelog and bilingual READMEs, preparing the release commit, and giving exact tag/push commands.
---

# SiYuan Plugin Pub

Use this skill when the user wants to publish a new version of this SiYuan plugin repo, especially a small or medium release that needs a clean version bump, bilingual release notes, and executable git release steps.

This repo already keeps release history in:

- `plugin.json`
- `package.json`
- `CHANGELOG.md`
- `README.md`
- `README_zh_CN.md`

## Repo-Specific Rules

- Keep `plugin.json` and `package.json` on the exact same version string such as `0.1.12`.
- `CHANGELOG.md` is the source of truth for release notes and uses Chinese entries with newest version on top.
- `README.md` and `README_zh_CN.md` both maintain a short timeline section; update both when releasing.
- **CLI version is independent**: `cli/package.json` has its own version line and release cycle. Do not force it to match the plugin version.
- Prefer matching the repo's recent commit style, for example:
  - `feat：新增文档头图与本地上传确认流程，整理代码并发布 v0.1.11`
  - `feat：优化 MCP tool 行为一致性并发布 v0.1.10`
- Do not run `git tag` or `git push` until the user explicitly wants to execute publish commands.

## Recommended Workflow

1. Confirm the target version, usually `vX.Y.Z`.
2. Inspect current versions in `plugin.json` and `package.json`.
3. Update both version fields to the new numeric version without the leading `v`.
4. If the CLI also changed in this release, update `cli/package.json` → `version` independently.
5. Add a new top entry to `CHANGELOG.md` in the existing style:
   - heading format: `## vX.Y.Z - YYYY-MM-DD`
   - usually 2-3 concise bullets
   - focus on user-visible changes, not raw file diffs
   - mention CLI version bump if applicable, e.g. "CLI 包同步提升至 v0.1.5"
6. Update the timeline bullets in:
   - `README.md`
   - `README_zh_CN.md`
7. Check that English and Chinese descriptions have the same release meaning, even if not literally translated.
8. Review the diff for consistency.
9. Prepare:
   - a recommended commit message
   - exact `git tag` / `git push` commands for the user
   - CLI publish command if the CLI version changed

## Version Bump Guidance

If the user only asks to bump versions, update:

- `plugin.json` → `version`
- `package.json` → `version`

This repo also includes an interactive helper:

```bash
npm run update-version
```

Prefer direct file edits when the target version is already known. Use the script only when the user wants an interactive bump choice.

### CLI Version Bump

The CLI sub-package lives in `cli/` and is published to npm as `siyuan-sisyphus`. Its version is **independent** of the plugin version.

- Bump `cli/package.json` → `version` manually when CLI code changed.
- The `scripts/update_version.js` helper does **not** touch `cli/package.json`.
- If the CLI did not change in this release, leave its version untouched.

## Changelog Writing Guidance

Follow the current repo tone:

- Chinese, concise, and release-oriented
- 2-3 bullets for a normal patch release
- describe improvements as outcomes, not implementation trivia

Good themes for this repo include:

- 聚合 tool 行为一致性
- 权限 / 路径 / help / 返回结构优化
- 文档、配置说明、测试覆盖同步刷新
- 本地文件、导出、确认流程、安全边界改进

Prefer this structure:

```md
## v0.1.12 - 2026-04-04

- 变更点 1
- 变更点 2
- 变更点 3
```

When the CLI changed, add a bullet like:

```md
- CLI 包同步提升至 v0.1.5
```

## README Timeline Guidance

When updating `README.md` and `README_zh_CN.md`:

- add the new version bullet at the top of the timeline list
- keep the summary shorter than the changelog
- preserve the existing tone of each language
- ensure the version number matches `CHANGELOG.md`

## Diff Review Checklist

Before proposing release commands, verify:

- `plugin.json` and `package.json` versions match
- `CHANGELOG.md` has the new version at the top
- `README.md` timeline includes the new version
- `README_zh_CN.md` timeline includes the new version
- release wording is semantically aligned across changelog and both READMEs
- the diff scope matches the intended release
- **if CLI changed**: `cli/package.json` version was bumped and `cli/dist/cli.cjs` was rebuilt (or will be rebuilt during publish)

## Commit Message Guidance

Prefer the repo's existing Chinese `feat：...并发布 vX.Y.Z` pattern for normal releases.

Template:

```bash
git add plugin.json package.json CHANGELOG.md README.md README_zh_CN.md
git commit -m "feat：<本次发布的核心价值>并发布 vX.Y.Z"
```

Examples:

```bash
git commit -m "feat：补强资源导出与确认流程并发布 vX.Y.Z"
git commit -m "feat：完善 tool 帮助与路径语义并发布 vX.Y.Z"
```

If the release is almost entirely documentation, the prefix may still remain `feat：` if that matches recent repo history.

## Release Commands

### Plugin Release

After the commit exists, recommend:

```bash
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

If the user asks to publish from a branch other than `main`, adjust the push command to match the actual branch.

### CLI Release

The CLI is published to npm independently. Only run this when `cli/package.json` version was bumped:

```bash
pnpm publish:cli
```

This runs `pnpm build:cli && cd cli && npm publish --access public`.

**Prerequisites**:

- You are logged into npm (`npm whoami` returns your username)
- The `cli/package.json` → `version` is strictly higher than the latest published version on npm

### Combined Release (Plugin + CLI)

When both the plugin and CLI changed in the same cycle:

1. Bump plugin versions (`package.json`, `plugin.json`) and CLI version (`cli/package.json`)
2. Update `CHANGELOG.md` and both `README`s
3. Commit and tag the plugin release
4. Push tag and main branch
5. Publish CLI to npm:

```bash
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
pnpm publish:cli
```

## Output Shape

When using this skill, the response should usually contain:

1. A short release summary
2. The files updated (including `cli/package.json` if CLI changed)
3. A recommended commit message
4. The exact release commands to run next (plugin tag + push, and CLI publish if applicable)

Keep the result compact, repo-specific, and directly executable.

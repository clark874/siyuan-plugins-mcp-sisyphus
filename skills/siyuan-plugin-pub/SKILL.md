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
- Prefer matching the repo's recent commit style, for example:
  - `feat：新增文档头图与本地上传确认流程，整理代码并发布 v0.1.11`
  - `feat：优化 MCP tool 行为一致性并发布 v0.1.10`
- Do not run `git tag` or `git push` until the user explicitly wants to execute publish commands.

## Recommended Workflow

1. Confirm the target version, usually `vX.Y.Z`.
2. Inspect current versions in `plugin.json` and `package.json`.
3. Update both version fields to the new numeric version without the leading `v`.
4. Add a new top entry to `CHANGELOG.md` in the existing style:
   - heading format: `## vX.Y.Z - YYYY-MM-DD`
   - usually 2-3 concise bullets
   - focus on user-visible changes, not raw file diffs
5. Update the timeline bullets in:
   - `README.md`
   - `README_zh_CN.md`
6. Check that English and Chinese descriptions have the same release meaning, even if not literally translated.
7. Review the diff for consistency.
8. Prepare:
   - a recommended commit message
   - exact `git tag` / `git push` commands for the user

## Version Bump Guidance

If the user only asks to bump versions, update:

- `plugin.json` → `version`
- `package.json` → `version`

This repo also includes an interactive helper:

```bash
npm run update-version
```

Prefer direct file edits when the target version is already known. Use the script only when the user wants an interactive bump choice.

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

After the commit exists, recommend:

```bash
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

If the user asks to publish from a branch other than `main`, adjust the push command to match the actual branch.

## Output Shape

When using this skill, the response should usually contain:

1. A short release summary
2. The files updated
3. A recommended commit message
4. The exact release commands to run next

Keep the result compact, repo-specific, and directly executable.

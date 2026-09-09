---
name: siyuan-sisyphus-project-source
description: 思源项目源 CLI 工作流。用于登记本机项目、生成受限清单、识别项目并受控读取安全 UTF-8 文本。
compatibility: "Requires the maintained siyuan-sisyphus CLI to be installed and configured for the target SiYuan workspace."
---

# Read Registered SiYuan Project Sources with the CLI

## Resolve the CLI entry first

Before the first SiYuan CLI call in every new session, verify that the local command is available:

```bash
command -v siyuan-sisyphus
siyuan-sisyphus --version
```

If the command is missing, resolve a locally installed or user-provided maintained CLI entry before continuing. Do not use `npx` as an implicit fallback. A public npm package may lag the locally maintained plugin and silently omit custom actions or safety contracts.

After resolving the entry, start with the read-only live bootstrap:

```bash
siyuan-sisyphus system bootstrap --json
```

项目笔记需要引用工作目录中的真实文件时，先登记稳定项目身份和当前主机绑定，再生成受限清单：

```bash
siyuan-sisyphus file register-project-source --project-id 'water-paper' --workspace-root '/absolute/path/to/project' --source-kind 'git' --coverage 'tracked' --hub-block-id '<project-hub-block-id>' --core-files-json '[{"relativePath":"README.md","role":"source"},{"relativePath":"manuscript/main.docx","role":"manuscript"}]' --json
```
```bash
siyuan-sisyphus file scan-project-manifest --project-id 'water-paper' --max-entries '20000' --json
```
```bash
siyuan-sisyphus file list-project-sources --page '1' --page-size '20' --json
```
```bash
siyuan-sisyphus file read-project-source --project-id 'water-paper' --relative-path 'README.md' --offset '0' --limit '8000' --json
```
```bash
siyuan-sisyphus file resolve-project-source --project-id 'water-paper' --relative-path 'manuscript/main.docx' --json
```

`projectId`、思源项目中枢块 ID 与清单块 ID 属于可移植身份；`workspaceRoot` 只属于当前主机绑定。不得把本机绝对路径写成跨主机的项目身份。A 层核心文件必须由用户或项目契约显式指定；B 层只记录普通文件元数据；C 层记录排除项。扫描不返回文件内容，也不把目录加入 Agent 工作区。

`register_project_source` 与 `scan_project_manifest` 会更新插件私有登记表，必须先确认；扫描同时受条目数、单文件哈希字节数和总哈希读取量限制。`read_project_source` 是只读动作，只允许读取当前清单中已列出、绑定可用且未逃逸根目录的安全 UTF-8 文本；单文件上限 1 MiB，每次最多返回 20,000 字符，分页在脱敏后进行，响应分别报告 `listed`、`readable`、`contentRead` 与 `revisionVerified`。二进制、敏感、超限、未列入清单或绑定陈旧的文件不返回内容。`resolve_project_source` 会披露一个本机绝对路径，必须先确认；除非确需把路径交给已有本机工作区权限的客户端，否则优先使用受控读取。不得把解析成功、清单收录或文件可读报告为内容已经核验。

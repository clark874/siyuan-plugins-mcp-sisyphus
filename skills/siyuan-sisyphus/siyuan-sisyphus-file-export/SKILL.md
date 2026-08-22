---
name: siyuan-sisyphus-file-export
description: 思源文件与导出 CLI 工作流。用于附件上传、Markdown 导出、文档提取、资源 ZIP、OCR、模板、安全资产维护，以及项目知识与本机源文件目录的受控映射。
compatibility: "Requires the maintained siyuan-sisyphus CLI to be installed and configured for the target SiYuan workspace."
---

# Handle SiYuan Files and Exports with the CLI

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

File actions are the explicit exception to the normal remote-only data path: uploads and local exports may touch the machine running the server. Confirm local paths and scope first.

```bash
siyuan-sisyphus file upload-asset --assets-dir-path '/assets/' --local-file-path '/absolute/path/to/image.png' --json
```
```bash
siyuan-sisyphus file export-md --id '<doc-id>' --json
```
```bash
siyuan-sisyphus file extract-doc --id '<doc-id>' --output-dir '/tmp/siyuan-extract' --json
```
```bash
siyuan-sisyphus file export-resources --paths-json '["assets/file.png","assets/file.pdf"]' --json
```
```bash
siyuan-sisyphus file get-doc-assets --id '<doc-id>' --asset-type 'image' --json
```
```bash
siyuan-sisyphus file get-image-ocr-text --path 'assets/image.png' --json
```

Large uploads must stop and require explicit confirmation before retrying with the large-file confirmation field. A document extraction output directory may be cleared; use a task-specific empty directory. Before renaming, deleting, or removing unused assets, list the exact targets and obtain approval. Verify returned paths after the operation. Read `siyuan-sisyphus help file upload-asset` for current size and path constraints.

## 项目知识与源文件映射

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
siyuan-sisyphus file resolve-project-source --project-id 'water-paper' --relative-path 'manuscript/main.docx' --json
```

`projectId`、思源项目中枢块 ID 与清单块 ID 属于可移植身份；`workspaceRoot` 只属于当前主机绑定。不得把本机绝对路径写成跨主机的项目身份。A 层核心文件必须由用户或项目契约显式指定；B 层只记录普通文件元数据；C 层记录排除项。扫描不返回文件内容，也不把目录加入 Agent 工作区。

`register_project_source` 与 `scan_project_manifest` 会更新插件私有登记表，必须先确认；扫描同时受条目数、单文件哈希字节数和总哈希读取量限制。`resolve_project_source` 会披露一个本机绝对路径，也必须先确认。解析只返回路径、存在性和版本状态，不读取文件内容。若任务需要读取路径指向的文件，必须由当前客户端已有工作区权限处理，或等待后续受控读取能力；不得把解析成功报告为内容已经核验。

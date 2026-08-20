---
name: siyuan-sisyphus-file-export
description: CLI-only playbook for SiYuan assets and exports with siyuan-sisyphus. Use for uploads, Markdown export, document extraction, resource ZIP export, OCR text, templates, and safe asset maintenance.
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

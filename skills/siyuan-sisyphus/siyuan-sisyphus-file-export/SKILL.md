---
name: siyuan-sisyphus-file-export
description: CLI-only playbook for moving files and assets through `siyuan-sisyphus`. Use for uploading assets, exporting markdown, extracting documents with assets, exporting resource ZIPs, listing document assets, OCR text, and local filesystem safety.
---

# SiYuan Sisyphus CLI - Files and Export

File commands can cross the boundary between SiYuan storage and the local filesystem. Treat local reads and writes as high risk unless the user explicitly asked for them.

## Upload Assets

Uploads read a local file path. Get explicit approval before running:

```bash
siyuan-sisyphus file upload-asset --assets-dir-path "/assets/" --local-file-path "/absolute/path/to/image.png"
```

If the file is larger than the configured threshold, usually 10 MB, stop and ask before retrying:

```bash
siyuan-sisyphus file upload-asset --assets-dir-path "/assets/" --local-file-path "/absolute/path/to/video.mp4" --confirm-large-file
```

## Export Markdown

```bash
siyuan-sisyphus file export-md --id "<doc-id>" --json
```

Use this for SiYuan's markdown export representation. For reading a document inside an agent workflow, `fs read` or `document get-doc` is usually simpler.

## Extract Document With Assets

Use `extract-doc` when the goal is to inspect a document plus referenced images, spreadsheets, PDFs, or other assets.

```bash
siyuan-sisyphus file extract-doc --id "<doc-id>" --output-dir "/tmp/siyuan-extract" --json
```

The output directory may be cleared before extraction, so choose a task-specific directory and confirm if it contains user files.

## Export Resources as ZIP

Export to SiYuan-managed output:

```bash
siyuan-sisyphus file export-resources --paths-json '["assets/file1.png","assets/file2.pdf"]' --json
```

Export to a local filesystem path. Confirm before running:

```bash
siyuan-sisyphus file export-resources --paths-json '["assets/file.png"]' --output-path "/absolute/path/export.zip" --json
```

Asset paths such as `assets/foo.txt` are normalized by the tool.

## Inspect Assets

```bash
siyuan-sisyphus file get-doc-assets --id "<doc-id>" --json
siyuan-sisyphus file get-doc-assets --id "<doc-id>" --asset-type image --json
siyuan-sisyphus file get-image-ocr-text --path "assets/image.png" --json
siyuan-sisyphus search search-assets --query "diagram" --json
siyuan-sisyphus search fulltext-asset-content --query "invoice" --json
```

## Templates

Workspace template rendering:

```bash
siyuan-sisyphus file render --engine template --id "<doc-id>" --path "templates/my-template" --json
```

Inline Sprig rendering:

```bash
siyuan-sisyphus file render --engine sprig --template '{{ now | date "2006-01-02" }}' --json
```

Template engine notes:

- `template` uses SiYuan workspace template syntax such as `.title` fields inside template files.
- `sprig` uses inline Go/Sprig syntax but has no document context.

## Asset Maintenance

These actions can change or delete assets. Confirm exact targets before running:

```bash
siyuan-sisyphus file list-unused-assets --json
siyuan-sisyphus file rename-asset --old-path "assets/old.png" --new-name "new.png"
siyuan-sisyphus file delete-asset --path "assets/old.png"
siyuan-sisyphus file remove-unused-assets
```

## Safety Checklist

1. Confirm local source or output paths with the user.
2. Prefer `extract-doc` for agent inspection of attachments.
3. Use `--json` and record returned paths.
4. Do not delete or rename assets unless the target is explicit and approved.

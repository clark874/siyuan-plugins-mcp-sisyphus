---
name: siyuan-sisyphus-file-export
description: Upload assets and export SiYuan content. Covers asset upload, markdown export, resource export, and document extraction. Use when the agent needs to move files in or out of SiYuan.
---

# SiYuan Sisyphus — Files and Export

## Upload Assets

```python
file(action="upload_asset", assetsDirPath="/assets/", localFilePath="/local/path/to/image.png")
```

**Requires explicit user confirmation** because it reads the local filesystem.

If the file is larger than the configured large-upload threshold (10 MB by default), you MUST stop, tell the user, and only retry after explicit confirmation using `confirmLargeFile=True`.

## Export Documents

### Export as Markdown

```python
file(action="export_md", id="doc-id")
```

### Extract Document with Assets (for AI Reading)

```python
# Exports document markdown + all referenced assets to an uncompressed folder
file(action="extract_doc", id="doc-id", outputDir="/tmp/exported")
```

`extract_doc` clears the entire output directory first to prevent accumulation from previous exports. The returned `extractedDir` is an absolute path ready for direct file access.

**Prefer `extract_doc` over `export_resources`** when the goal is to inspect attachment content such as images, spreadsheets, or other binary files.

### Export Resources as ZIP

```python
# Export to SiYuan managed temp area
file(action="export_resources", paths=["assets/file1.png", "assets/file2.pdf"])

# Export to local filesystem (high-risk, requires explicit user confirmation)
file(action="export_resources", paths=["assets/file.png"], outputPath="/local/path.zip")
```

Asset paths like `assets/foo.txt` are normalized to `/data/assets/foo.txt` before export.

## List and Manage Assets

```python
# List unused assets
file(action="list_unused_assets")

# Get assets referenced by a document
file(action="get_doc_assets", id="doc-id")

# Get only image assets
file(action="get_doc_assets", id="doc-id", assetType="image")

# OCR text from image asset
file(action="get_image_ocr_text", path="assets/image.png")
```

## Templates

```python
# Render with SiYuan workspace template (uses .action{...} delimiters)
file(action="render", engine="template", id="doc-id", path="template/path")

# Render with inline Go/Sprig template (uses {{...}} syntax, no document context)
file(action="render", engine="sprig", template='{{ now | date "2006-01-02" }}')
```

## Pitfalls

1. **`upload_asset` reads local filesystem** — always get user confirmation first.

2. **`export_resources` with `outputPath` writes to local filesystem** — requires explicit user confirmation.

3. **`render` with `engine="template"` requires a template path inside the SiYuan workspace**; arbitrary local paths like `/tmp/...` are rejected by the kernel.

4. **Template engines use different syntax**:
   - `template` engine: `.action{.title}`, `.action{.id}`, `.action{.name}`, `.action{.alias}`
   - `sprig` engine: `{{ now | date "2006-01-02" }}`

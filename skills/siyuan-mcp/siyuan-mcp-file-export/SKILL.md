---
name: siyuan-mcp-file-export
description: MCP playbook for SiYuan assets and exports. Use for uploads, Markdown export, document extraction, resource ZIP export, OCR text, templates, and safe asset maintenance.
compatibility: "Requires a reachable SiYuan Sisyphus MCP server already registered in the client; installing this Skill alone does not configure the MCP endpoint or bearer token."
---

# Handle SiYuan Files and Exports with MCP

File actions are the explicit exception to the normal remote-only data path: uploads and local exports may touch the machine running the server. Confirm local paths and scope first.

```text
file(action="upload_asset", assetsDirPath="/assets/", localFilePath="/absolute/path/to/image.png")
```
```text
file(action="export_md", id="<doc-id>")
```
```text
file(action="extract_doc", id="<doc-id>", outputDir="/tmp/siyuan-extract")
```
```text
file(action="export_resources", paths=["assets/file.png","assets/file.pdf"])
```
```text
file(action="get_doc_assets", id="<doc-id>", assetType="image")
```
```text
file(action="get_image_ocr_text", path="assets/image.png")
```

Large uploads must stop and require explicit confirmation before retrying with the large-file confirmation field. A document extraction output directory may be cleared; use a task-specific empty directory. Before renaming, deleting, or removing unused assets, list the exact targets and obtain approval. Verify returned paths after the operation. Read `siyuan://help/action/file/upload_asset` for current size and path constraints.

# file

This tool covers file, asset, export, template, and OCR-related operations.

When to read this page: you need to upload assets, export content, or query document-linked resources.

Related pages:

- [Permissions](../permissions.md)
- [Troubleshooting](../../getting-started/troubleshooting.md)

## Common Actions

| Group | Actions |
|------|---------|
| Upload / export | `upload_asset`, `export_md`, `export_resources` |
| Rendering | `render_template`, `render_sprig` |
| Asset inspection | `get_doc_assets`, `get_image_ocr_text`, `list_unused_assets` |
| Asset mutations | `remove_unused_assets`, `rename_asset`, `delete_asset`, `set_image_alpha` |

## Safety Rules

- `upload_asset` requires confirmation
- Large uploads need explicit large-file confirmation
- `delete_asset` and `remove_unused_assets` require confirmation
- `export_resources` with a local output path should be treated carefully

## Examples

MCP:

```json
{
  "action": "upload_asset",
  "assetsDirPath": "/assets/",
  "localFilePath": "/Users/me/image.png"
}
```

```json
{
  "action": "get_doc_assets",
  "id": "<doc-id>",
  "assetType": "image"
}
```

CLI:

```bash
siyuan file get-doc-assets --id <doc-id> --asset-type image
```

## Action List

- `upload_asset`
- `render_template`
- `render_sprig`
- `export_md`
- `export_resources`
- `list_unused_assets`
- `get_doc_assets`
- `get_image_ocr_text`
- `remove_unused_assets`
- `rename_asset`
- `delete_asset`
- `set_image_alpha`

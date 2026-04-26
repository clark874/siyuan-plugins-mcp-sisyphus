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

Template rendering syntax:

```json
{
  "action": "render",
  "engine": "template",
  "id": "<doc-id>",
  "path": "/path/to/siyuan/data/templates/report.md"
}
```

`engine="template"` renders a workspace template file. Inside the template, use SiYuan delimiters such as `.action{.title}`, `.action{.id}`, `.action{.name}`, and `.action{.alias}`; placeholders like `{{.title}}` are not replaced by this engine.

```json
{
  "action": "render",
  "engine": "sprig",
  "template": "Today: {{ now | date \"2006-01-02\" }}"
}
```

`engine="sprig"` renders an inline string with `{{...}}` syntax and Sprig functions, but it has no document context.

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

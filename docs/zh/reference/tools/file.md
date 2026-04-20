# file

这个工具覆盖文件、资源、导出、模板和 OCR 相关操作。

适用场景：你需要上传资源、导出内容，或者查询文档关联的资源文件。

相关页面：

- [权限模型](../permissions.md)
- [Troubleshooting](../../getting-started/troubleshooting.md)

## 常见 Action

| 分组 | Actions |
|------|---------|
| 上传 / 导出 | `upload_asset`, `export_md`, `export_resources` |
| 渲染 | `render_template`, `render_sprig` |
| 资源查询 | `get_doc_assets`, `get_image_ocr_text`, `list_unused_assets` |
| 资源修改 | `remove_unused_assets`, `rename_asset`, `delete_asset`, `set_image_alpha` |

## 安全规则

- `upload_asset` 需要确认
- 大文件上传需要额外确认
- `delete_asset` 和 `remove_unused_assets` 需要确认
- `export_resources` 如果带本地输出路径，应谨慎处理

## 示例

MCP：

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

CLI：

```bash
siyuan file get-doc-assets --id <doc-id> --asset-type image
```

## Action 列表

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

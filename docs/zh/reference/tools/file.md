# file

这个工具覆盖资源上传、导出、模板渲染、OCR 与资源维护。

适用场景：你需要上传资源、导出内容、渲染模板，或查询文档关联资源。

相关页面：

- [权限模型](../permissions.md)
- [故障排查](../../getting-started/troubleshooting.md)

## 常见 Actions

| 分组 | Actions |
|------|---------|
| 上传 / 导出 | `upload_asset`, `export_md`, `export_md_zip`, `export_resources` |
| 渲染 | `render` |
| 资源查看 | `get_doc_assets`, `get_image_ocr_text`, `list_unused_assets` |
| 资源变更 | `remove_unused_assets`, `rename_asset`, `delete_asset` |

`get_doc_assets` 是直接引用资源查看动作，只返回当前文档树直接引用的资源，不会展开查询嵌入块。需要查看 Markdown 导出会包含的完整资源时，应使用 `export_md_zip` 并检查生成的压缩包。

## 安全规则

- `upload_asset` 需要确认，并会读取本地文件路径，属于二进制传输的显式例外。
- 大文件上传需要额外确认。
- `delete_asset` 与 `remove_unused_assets` 需要确认。
- `export_md_zip` 与 `export_resources` 如果指定本地输出路径，也应谨慎处理。

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

这个结果只表示文档树直接资源，不等同于官方 Markdown ZIP 导出最终包含的资源。

使用思源官方导出流程导出 Markdown ZIP：

```json
{
  "action": "export_md_zip",
  "id": "<doc-id>",
  "outputPath": "/Users/me/export/doc.zip"
}
```

`export_md_zip` 跟随思源右键 Markdown ZIP 导出行为，会包含查询嵌入块展开后引用的资源。当用户需要查看或核对完整导出资源时，优先引导使用它。

模板渲染：

```json
{
  "action": "render",
  "engine": "template",
  "id": "<doc-id>",
  "path": "/path/to/siyuan/data/templates/report.md"
}
```

`engine="template"` 渲染工作区模板文件。模板内使用思源分隔符，例如 `.action{.title}`、`.action{.id}`、`.action{.name}`、`.action{.alias}`；`&#123;&#123;.title&#125;&#125;` 这类双花括号占位符不会被该引擎替换。

```json
{
  "action": "render",
  "engine": "sprig",
  "template": "Today: <sprig date expression>"
}
```

`engine="sprig"` 渲染双花括号语法的内联字符串并支持 Sprig 函数，但没有文档上下文。

CLI：

```bash
siyuan file get-doc-assets --id <doc-id> --asset-type image
siyuan file export-md-zip --id <doc-id> --output-path ./doc.zip
```

## Action 列表

- `upload_asset`
- `render`
- `export_md`
- `export_md_zip`
- `export_resources`
- `list_unused_assets`
- `get_doc_assets`
- `get_image_ocr_text`
- `remove_unused_assets`
- `rename_asset`
- `delete_asset`

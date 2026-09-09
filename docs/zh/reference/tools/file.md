# file

当前 `file` 工具只承担项目源网关职责，不提供上传、导出、提取、OCR、资产或模板管理。

| action | 用途 |
| --- | --- |
| `register_project_source` | 将稳定项目身份绑定到一个明确的本机根目录。 |
| `identify_project` | 用调用方给出的工作目录匹配已登记项目，不返回本机路径。 |
| `scan_project_manifest` | 生成受限 A/B/C 清单，不返回源文件内容。 |
| `resolve_project_source` | 解析一个已入清单的相对路径；绝对路径披露需要确认。 |
| `read_project_source` | 从当前清单受控读取已脱敏的安全 UTF-8 文本。 |
| `list_project_sources` | 列出可移植身份和绑定状态，默认不暴露根目录。 |

读取前先登记并扫描。二进制、敏感、超限、未入清单、绑定陈旧或逃逸根目录的路径均封闭失败。清单收录或读取成功不等于来源主张已经核验。

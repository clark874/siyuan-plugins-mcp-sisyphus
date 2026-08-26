---
name: siyuan-mcp-file-export
description: 思源文件与导出 MCP 工作流。用于附件上传、Markdown 导出、文档提取、资源 ZIP、模板、安全资产维护，以及项目知识与本机源文件目录的受控映射。
compatibility: "Requires a reachable SiYuan Sisyphus MCP server already registered in the client; installing this Skill alone does not configure the MCP endpoint or bearer token."
---

# Handle SiYuan Files and Exports with MCP

File actions are the explicit exception to the normal remote-only data path: uploads and local exports may touch the machine running the server. Confirm local paths and scope first.

```text
file(action="upload_asset", assetsDirPath="/assets/", localFilePath="/absolute/path/to/source.pdf")
```
```text
file(action="export_md", id="<doc-id>")
```
```text
file(action="extract_doc", id="<doc-id>", outputDir="/tmp/siyuan-extract")
```
```text
file(action="export_resources", paths=["assets/file.txt","assets/file.pdf"])
```
```text
file(action="get_doc_assets", id="<doc-id>", assetType="all")
```

Large uploads must stop and require explicit confirmation before retrying with the large-file confirmation field. A document extraction output directory may be cleared; use a task-specific empty directory. Before renaming, deleting, or removing unused assets, list the exact targets and obtain approval. Verify returned paths after the operation. Read `siyuan://help/action/file/upload_asset` for current size and path constraints.

## 项目知识与源文件映射

项目笔记需要引用工作目录中的真实文件时，先登记稳定项目身份和当前主机绑定，再生成受限清单：

```text
file(action="register_project_source", projectId="water-paper", workspaceRoot="/absolute/path/to/project", sourceKind="git", coverage="tracked", hubBlockId="<project-hub-block-id>", coreFiles=[{"relativePath":"README.md","role":"source"},{"relativePath":"manuscript/main.docx","role":"manuscript"}])
```
```text
file(action="scan_project_manifest", projectId="water-paper", maxEntries=20000)
```
```text
file(action="list_project_sources", page=1, pageSize=20)
```
```text
file(action="read_project_source", projectId="water-paper", relativePath="README.md", offset=0, limit=8000)
```
```text
file(action="resolve_project_source", projectId="water-paper", relativePath="manuscript/main.docx")
```

`projectId`、思源项目中枢块 ID 与清单块 ID 属于可移植身份；`workspaceRoot` 只属于当前主机绑定。不得把本机绝对路径写成跨主机的项目身份。A 层核心文件必须由用户或项目契约显式指定；B 层只记录普通文件元数据；C 层记录排除项。扫描不返回文件内容，也不把目录加入 Agent 工作区。

`register_project_source` 与 `scan_project_manifest` 会更新插件私有登记表，必须先确认；扫描同时受条目数、单文件哈希字节数和总哈希读取量限制。`read_project_source` 是只读动作，只允许读取当前清单中已列出、绑定可用且未逃逸根目录的安全 UTF-8 文本；单文件上限 1 MiB，每次最多返回 20,000 字符，分页在脱敏后进行，响应分别报告 `listed`、`readable`、`contentRead` 与 `revisionVerified`。二进制、敏感、超限、未列入清单或绑定陈旧的文件不返回内容。`resolve_project_source` 会披露一个本机绝对路径，必须先确认；除非确需把路径交给已有本机工作区权限的客户端，否则优先使用受控读取。不得把解析成功、清单收录或文件可读报告为内容已经核验。

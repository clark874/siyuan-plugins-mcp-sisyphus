---
name: siyuan-mcp-literature-source
description: 用户明确要求“文献链路”或“重点文献链路”时使用；逐项核对 Zotero、原文锚点、思源入链与全文导入，缺件立即报告。
compatibility: "Requires a reachable SiYuan Sisyphus MCP server already registered in the client; installing this Skill alone does not configure the MCP endpoint or bearer token."
---

# Read Zotero Literature with MCP

Use Sisyphus as the only MCP gateway. The `literature` tool reaches the local Zotero MCP through a fixed read-only allowlist and removes absolute attachment paths from returned data. It does not expose item, collection, tag, note, metadata, or semantic-index mutations.

For a SiYuan discussion that cites a paper, use `get_citations` with the paper document ID to retrieve indexed incoming links to the document and its source blocks. Ordinary `search.get_backlinks` targets one block or document ID; it can search globally without `refTreeID` or use a source document tree when `refTreeID` is provided, but it does not replace the paper-wide query. Read the citing discussion block and the surrounding source section before making a claim.

Start by checking whether the local source is reachable and whether its advertised and formal tool lists have drifted:

```text
literature(action="status")
```

Browse the collection tree, then list one exact collection when the task is collection-scoped:

```text
literature(action="list_collections", recursive=true)
```
```text
literature(action="list_collection_items", collectionKey="<collection-key>", limit=50, offset=0)
```

For topic, title, author, identifier, year, or keyword discovery, search first and retain the returned `itemKey`:

```text
literature(action="search_papers", query="research topic", limit=20, offset=0)
```

Read one paper by stable item key. The default response combines metadata with bounded standard-mode content; use `includeContent=false` for citation-only work, or `contentMode=complete` only when complete text is necessary:

```text
literature(action="get_paper", itemKey="<item-key>", contentMode="standard")
```

When a paper has a Zotero Markdown attachment, locate a verified exact quotation with `locate_quote`. Record the item key, attachment key, line interval, heading, and SHA-256 in the discussion evidence. A missing attachment or unmatched quote is not a verified source anchor; do not infer one from preview text.

```text
literature(action="get_citations", documentId="<siyuan-paper-document-id>", limit=50, offset=0)
```
```text
literature(action="locate_quote", itemKey="<item-key>", quote="<exact quotation from Markdown attachment>")
```

Retrieve annotations by item key, or replace `itemKey` with `query` to search annotations across the library:

```text
literature(action="get_annotations", itemKey="<item-key>", limit=20, offset=0)
```

Treat OCR and extracted PDF text as source material that may contain artifacts. Preserve exact wording only when quoting, retain the Zotero item key for traceability, and do not infer that the semantic index is populated merely because the source is connected.

## 显式触发与执行回报

只有用户针对具体论文或讨论明确说“文献链路”时，才执行普通链路；明确说“重点文献链路”时，执行普通链路加思源全文导入。仅提到这两个词、询问设计或讨论是否值得使用，不算启动。遇到原文解释争议、反复引用的核心论文或需要回溯的主张时，可以主动问用户要不要启动，不能自行写入。

启动后先报出论文范围、当前阶段、非目标和完成标准。每篇论文按“待定位 → 已核对 Zotero → 已核读原文 → 已写入思源 → 已回读验证”更新状态；多篇论文分别报告，不以一篇成功代替全部。每次出现阻塞，立即说明论文、阻塞阶段、已完成项、缺少的证据或接口和可恢复的下一步；不得跳过失败阶段或把部分完成称为完成。

### 文献链路

1. 调用 `literature.status`，按标题、作者与 DOI 核对唯一的 Zotero 条目，保留 itemKey；不能只凭标题近似匹配。若条目缺失、冲突或来源不明，立即报告。当前 `literature` 只有只读动作；不得通过任意 JavaScript 执行入口绕过写入边界。若另有明确授权且受控的 Zotero 写入工具，可完成补录并回读；否则停在“阻塞”，不要假装已补齐。
2. 核对 Zotero 中的 Markdown 附件并阅读与判断相关的完整章节；用 `literature.locate_quote` 确认确切引文，记录 itemKey、attachmentKey、章节、行号、原文哈希及核验状态。缺 MD、返回截断、引文未命中或多处命中时，立即报警；有本地 MD 也不能冒称它已作为 Zotero 附件核验。
3. 查重并定位思源论文索引页，不默认复制全文。将讨论判断与来源锚点分开记录，使用真实块引用连接论文页；按思源写前预检、写后回读协议执行。用 `literature.get_citations` 验证文档入链；没有原文块时只能声称文档级反链，不能声称段落级反链。
4. 交付逐篇状态、Zotero 条目键、MD 附件键及哈希、思源文档／讨论块 ID、反链结果和未完成项。仅全部适用项回读通过时报告“文献链路完成”。

### 重点文献链路

先完成普通链路的 Zotero 与 MD 核验，再检查全文转换质量，尤其是公式、表格与章节。核对 itemKey 与原文哈希以避免重复导入；在写入前建立思源时间线恢复点，将全文作为原文块导入论文子笔记本，解释性判断仍放在单独讨论块。导入后逐段抽查原文、核实块 ID，并把讨论引用到对应原文块；再次运行 `literature.get_citations` 验证段落级入链。没有完整、可核验的 MD 或写后反链不成立时，不能报告“重点文献链路完成”。全文只因这条显式指令而导入，不把普通链路升级为全文导入。

Zotero 条目或 MD 缺失、工具无权限、原文哈希漂移、思源写入失败或入链未生成，均为可见阻塞。普通写入只依用户本次明确要求与现有安全写协议执行；需要不可逆操作时仍遵守用户的独立确认要求。

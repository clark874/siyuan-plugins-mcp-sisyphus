---
name: siyuan-mcp-literature-source
description: Read-only Zotero literature workflow through the Sisyphus literature tool. Use to inspect source health, browse collections, search papers, read bounded full text, and retrieve annotations without exposing Zotero mutations.
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

---
name: siyuan-sisyphus-literature-source
description: Read-only Zotero literature workflow through the Sisyphus literature tool. Use to inspect source health, browse collections, search papers, read bounded full text, and retrieve annotations without exposing Zotero mutations.
compatibility: "Requires the maintained siyuan-sisyphus CLI to be installed and configured for the target SiYuan workspace."
---

# Read Zotero Literature with the CLI

## Resolve the CLI entry first

Before the first SiYuan CLI call in every new session, verify that the local command is available:

```bash
command -v siyuan-sisyphus
siyuan-sisyphus --version
```

If the command is missing, resolve a locally installed or user-provided maintained CLI entry before continuing. Do not use `npx` as an implicit fallback. A public npm package may lag the locally maintained plugin and silently omit custom actions or safety contracts.

After resolving the entry, start with the read-only live bootstrap:

```bash
siyuan-sisyphus system bootstrap --json
```

Use Sisyphus as the only MCP gateway. The `literature` tool reaches the local Zotero MCP through a fixed read-only allowlist and removes absolute attachment paths from returned data. It does not expose item, collection, tag, note, metadata, or semantic-index mutations.

For a SiYuan discussion that cites a paper, use `get_citations` with the paper document ID to retrieve indexed incoming links to the document and its source blocks. Ordinary `search.get_backlinks` targets one block or document ID; it can search globally without `refTreeID` or use a source document tree when `refTreeID` is provided, but it does not replace the paper-wide query. Read the citing discussion block and the surrounding source section before making a claim.

Start by checking whether the local source is reachable and whether its advertised and formal tool lists have drifted:

```bash
siyuan-sisyphus literature status --json
```

Browse the collection tree, then list one exact collection when the task is collection-scoped:

```bash
siyuan-sisyphus literature list-collections --recursive --json
```
```bash
siyuan-sisyphus literature list-collection-items --collection-key '<collection-key>' --limit '50' --offset '0' --json
```

For topic, title, author, identifier, year, or keyword discovery, search first and retain the returned `itemKey`:

```bash
siyuan-sisyphus literature search-papers --query 'research topic' --limit '20' --offset '0' --json
```

Read one paper by stable item key. The default response combines metadata with bounded standard-mode content; use `includeContent=false` for citation-only work, or `contentMode=complete` only when complete text is necessary:

```bash
siyuan-sisyphus literature get-paper --item-key '<item-key>' --content-mode 'standard' --json
```

When a paper has a Zotero Markdown attachment, locate a verified exact quotation with `locate_quote`. Record the item key, attachment key, line interval, heading, and SHA-256 in the discussion evidence. A missing attachment or unmatched quote is not a verified source anchor; do not infer one from preview text.

```bash
siyuan-sisyphus literature get-citations --document-id '<siyuan-paper-document-id>' --limit '50' --offset '0' --json
```
```bash
siyuan-sisyphus literature locate-quote --item-key '<item-key>' --quote '<exact quotation from Markdown attachment>' --json
```

Retrieve annotations by item key, or replace `itemKey` with `query` to search annotations across the library:

```bash
siyuan-sisyphus literature get-annotations --item-key '<item-key>' --limit '20' --offset '0' --json
```

Treat OCR and extracted PDF text as source material that may contain artifacts. Preserve exact wording only when quoting, retain the Zotero item key for traceability, and do not infer that the semantic index is populated merely because the source is connected.

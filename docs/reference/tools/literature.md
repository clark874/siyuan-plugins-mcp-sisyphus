# Literature Library and Zotero

See the [SiYuan literature workflow](/zh/reference/tools/literature) for catalog registration, evidence retrieval, and resumable ingestion.

### Content roles

- `literature.find_evidence` excludes blocks with valid `abstract`, `references`, `metadata`, or `caption` roles from evidence candidates. Abstracts can still help identify papers. `retrieval.filteredByContentRole` counts excluded candidates from this request, and `retrieval.roleScheme` explains the contract.
- Unmarked blocks and blocks whose role digest no longer matches both return `contentRole: "unknown"` in v0.17.1. Both remain eligible as evidence. Explicit `body` is also eligible.
- The attributes are `custom-literature-role` and `custom-literature-role-sha256`. The latter hashes the indexed `blocks.content` field. Join via `attributes.block_id = blocks.id`.
- Translation preserves references and bibliographic metadata in the original language. Abstracts and captions remain eligible for translation. Translations inherit applicable content roles with hashes recomputed from the translated blocks.
- Preview a document with `agent-kit/scripts/tag-literature-roles.mjs --document-id` and review section boundaries before enabling `--execute`. See the linked workflow for the full command and required arguments.

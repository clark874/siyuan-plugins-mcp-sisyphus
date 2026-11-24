# Document Tool

`document` provides 14 document-level actions.

| Purpose | Actions |
| --- | --- |
| Create or organize | `create`, `rename`, `move`, `reorder`, `duplicate` |
| Resolve and browse | `lookup`, `get_child_blocks`, `get_child_docs`, `list_tree`, `search_docs` |
| Read or annotate | `get_doc`, `get_outline`, `set_attr`, `export_markdown` |

Use `lookup` to distinguish a stable ID, a notebook-local human path, and a `.sy` storage path. Prefer stable IDs for readback. `move` requires explicit confirmation, and guarded writes follow the strict preflight protocol when enabled.

`duplicate` copies an ordinary document in the same notebook and verifies the copied identity. `export_markdown` uses native export rules. Use `get_doc` when any notebook in the workspace is inaccessible.

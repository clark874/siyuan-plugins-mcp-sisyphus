# Document Tool

`document` provides 12 document-level actions.

| Purpose | Actions |
| --- | --- |
| Create or organize | `create`, `rename`, `move`, `reorder` |
| Resolve and browse | `lookup`, `get_child_blocks`, `get_child_docs`, `list_tree`, `search_docs` |
| Read or annotate | `get_doc`, `get_outline`, `set_attr` |

Use `lookup` to distinguish a stable ID, a notebook-local human path, and a `.sy` storage path. Prefer stable IDs for readback. `move` requires explicit confirmation, and guarded writes follow the strict preflight protocol when enabled.

Document deletion, duplication, daily-note creation, heading conversion, and child-sort helper actions are not exposed.

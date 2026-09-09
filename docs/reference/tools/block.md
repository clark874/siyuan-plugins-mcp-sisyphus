# Block Tool

`block` provides 16 block-granular actions.

| Purpose | Actions |
| --- | --- |
| Create or edit | `insert`, `prepend`, `append`, `update`, `replace`, `move` |
| Read content | `get_kramdown`, `batch_kramdown`, `get_children`, `dom` |
| References and attributes | `transfer_references`, `set_attrs`, `get_attrs` |
| Metadata | `info`, `breadcrumb`, `docs_info` |

Read the target before a mutation and reread it afterward. Under strict safe writes, use `validateOnly` and the issued request ID or hash credential described by the action schema. `move` requires explicit confirmation.

Block deletion, folding, recent-update feeds, word-count helpers, and daily-note shortcuts are not exposed.

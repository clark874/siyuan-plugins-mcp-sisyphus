# file

The maintained `file` tool is a project-source gateway. It does not upload, export, extract, OCR, or manage assets and templates.

| Action | Purpose |
| --- | --- |
| `register_project_source` | Bind a stable project identity to one exact local root. |
| `identify_project` | Match a supplied working directory to a registered project without returning the path. |
| `scan_project_manifest` | Build a bounded A/B/C manifest without returning source content. |
| `resolve_project_source` | Resolve one manifest-listed relative path; absolute-path disclosure is confirmation-gated. |
| `read_project_source` | Read bounded, redacted safe UTF-8 text from the current manifest. |
| `list_project_sources` | List portable identities and binding status without exposing roots. |

Register and scan before reading. Binary, sensitive, oversized, unlisted, stale-binding, and root-escaping paths fail closed. A successful listing or read does not by itself validate the source's claims.

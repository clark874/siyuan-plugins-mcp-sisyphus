# Tools Index

The maintained LLM Wiki surface contains 14 aggregated tools and 103 actions. Each tool also accepts `action="help"`; dynamic official-plugin actions discovered through `extension` are not counted.

| Tool | Actions |
| --- | --- |
| `fs` | ls, tree, read, write, replace, rm, mv, reorder, search |
| `notebook` | list, get_conf, get_permissions, get_child_docs |
| `document` | create, lookup, rename, move, reorder, get_child_blocks, get_child_docs, set_attr, list_tree, search_docs, get_doc, get_outline |
| `block` | insert, prepend, append, update, replace, move, get_kramdown, batch_kramdown, get_children, transfer_references, set_attrs, get_attrs, info, breadcrumb, dom, docs_info |
| `av` | get, render, get_attribute_view_keys, get_attribute_view_filter_sort, search, rename, add_rows, remove_rows, add_column, remove_column, set_cells, duplicate, get_primary_key_values |
| `file` | register_project_source, identify_project, scan_project_manifest, resolve_project_source, read_project_source, list_project_sources |
| `project` | snapshot, sync_mindmap |
| `search` | fulltext, semantic, knowledge, check_anchor, query_sql, get_backlinks, search_refs, find_replace, list_invalid_refs, criteria_list, criteria_save, criteria_remove |
| `literature` | status, list_collections, list_collection_items, search_papers, get_paper, get_citations, locate_quote, get_annotations |
| `provenance` | register_session, record_event, discover_session, list_project_sessions, list_atom_events, resolve_session_link, validate_session |
| `tag` | list, rename, remove |
| `timeline` | list_nodes, create_node, compare_node, compare_recent |
| `system` | changelog, get_version, get_current_time, bootstrap, audit_environment, validate_source_audit |
| `extension` | list, plus explicitly allowlisted official-plugin actions |

The removed mascot, feedback, flashcard, asset/OCR, template/import/export, history/repository/inbox forwarding, and timeline deletion/rollback actions are not compatibility aliases; clients must stop calling them.

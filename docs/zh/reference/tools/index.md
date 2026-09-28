# 工具索引

当前 LLM Wiki 工具面包含 14 个聚合工具、102 个 action。每个工具还接受 `action="help"`；`extension` 动态发现的官方插件 action 不计入 102 个固定 action。

| 工具 | 现行 action |
| --- | --- |
| `fs` | ls, tree, read, write, replace, rm, mv, reorder, search |
| `notebook` | list, get_conf, get_permissions, get_child_docs |
| `document` | create, lookup, rename, move, reorder, get_child_blocks, get_child_docs, set_attr, list_tree, search_docs, get_doc, get_outline |
| `block` | insert, prepend, append, update, replace, move, get_kramdown, batch_kramdown, get_children, transfer_references, set_attrs, get_attrs, info, breadcrumb, dom, docs_info |
| `av` | get, render, get_attribute_view_keys, get_attribute_view_filter_sort, search, rename, add_rows, remove_rows, add_column, remove_column, set_cells, duplicate, get_primary_key_values |
| `file` | register_project_source, identify_project, scan_project_manifest, resolve_project_source, read_project_source, list_project_sources |
| `project` | snapshot |
| `search` | fulltext, semantic, knowledge, check_anchor, query_sql, get_backlinks, search_refs, find_replace, list_invalid_refs, criteria_list, criteria_save, criteria_remove |
| `literature` | status, list_collections, list_collection_items, search_papers, get_paper, get_citations, locate_quote, get_annotations |
| `provenance` | register_session, record_event, discover_session, list_project_sessions, list_atom_events, resolve_session_link, validate_session |
| `tag` | list, rename, remove |
| `timeline` | list_nodes, create_node, compare_node, compare_recent |
| `system` | changelog, get_version, get_current_time, bootstrap, audit_environment, validate_source_audit |
| `extension` | list，以及明确列入白名单的官方插件 action |

已删除的猫猫、feedback、闪卡、资产/OCR、模板/导入导出、history/repo/inbox 转发和时间线删除/回退动作不提供兼容别名；客户端应停止调用。

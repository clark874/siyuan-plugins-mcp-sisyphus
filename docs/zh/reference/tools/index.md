# 工具索引

这个页面汇总项目暴露的 10 个聚合工具。

适用场景：你已经知道大致领域，但还需要定位到具体工具页面。

相关页面：

- [参考首页](../index.md)
- [常见任务](../common-tasks.md)

| 工具 | Action 数量 | 页面 |
|------|-------------|------|
| `notebook` | 11 | [notebook](./notebook.md) |
| `document` | 20 | [document](./document.md) |
| `block` | 24 | [block](./block.md) |
| `av` | 13 | [av](./av.md) |
| `file` | 12 | [file](./file.md) |
| `search` | 11 | [search](./search.md) |
| `tag` | 3 | [tag](./tag.md) |
| `system` | 10 | [system](./system.md) |
| `flashcard` | 8 | [flashcard](./flashcard.md) |
| `mascot` | 3 | [mascot](./mascot.md) |

## Action 汇总

- `notebook`: list, create, set_open_state, remove, rename, get_conf, set_conf, set_icon, get_permissions, set_permission, get_child_docs
- `document`: create, resolve, rename, remove, move, get_child_blocks, get_child_docs, set_icon, set_cover, list_tree, search_docs, get_doc, create_daily_note, duplicate, remove_batch, heading_to_doc, doc_to_heading
- `block`: insert, prepend, append, update, delete, move, set_fold_state, get_kramdown, get_children, transfer_ref, set_attrs, get_attrs, exists, info, breadcrumb, dom, recent_updated, word_count, batch_insert, batch_update, append_daily_note, prepend_daily_note, doc_info, docs_info
- `av`: get, render_attribute_view, get_attribute_view_keys, get_attribute_view_filter_sort, search, add_rows, remove_rows, add_column, remove_column, set_cells, duplicate_block, get_primary_key_values
- `file`: upload_asset, render_template, render_sprig, export_md, export_resources, list_unused_assets, get_doc_assets, get_image_ocr_text, remove_unused_assets, rename_asset, delete_asset, set_image_alpha
- `search`: fulltext, query_sql, search_tag, get_backlinks, get_backmentions, search_refs, find_replace, search_assets, get_asset_content, fulltext_asset_content, list_invalid_refs
- `tag`: list, rename, remove
- `system`: push_msg, push_err_msg, get_version, get_current_time, workspace_info, network, changelog, conf, sys_fonts, boot_progress
- `flashcard`: list_cards, get_decks, get_cards, review_card, skip_review_card, create_card, add_card, remove_card
- `mascot`: get_balance, shop, buy

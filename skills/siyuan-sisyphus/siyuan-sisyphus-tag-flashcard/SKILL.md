---
name: siyuan-sisyphus-tag-flashcard
description: CLI-only playbook for tags and flashcards with `siyuan-sisyphus`. Use for inline tag creation, listing and renaming tags, deck discovery, card creation, due/new card review, and safe card or tag removal.
---

# SiYuan Sisyphus CLI - Tags and Flashcards

Tags are created by writing `#tag#` into Markdown content. Flashcards should be created with the `flashcard` tool so SiYuan registers review cards correctly.

## Tags

Create tags inline:

```bash
siyuan-sisyphus block append --parent-id "<doc-id>" --data-type markdown --data "#project# #urgent#"
siyuan-sisyphus block append --parent-id "<doc-id>" --data-type markdown --data "#project/phase1#"
```

List or filter tags:

```bash
siyuan-sisyphus tag list
siyuan-sisyphus tag list --keyword "project" --json
```

Rename a tag label everywhere:

```bash
siyuan-sisyphus tag rename --old-label "old-tag" --new-label "new-tag"
```

Remove is destructive. Confirm first:

```bash
siyuan-sisyphus tag remove --label "tag-to-remove"
```

Recently written tags may take a short time to appear in tag search.

## Flashcard Structure

SiYuan flashcards commonly use a heading as the prompt and following blocks as the answer:

```markdown
## Question heading
Answer paragraph.
Another answer paragraph.
```

Cloze text can be written as `==answer==` in content.

## Deck Discovery

```bash
siyuan-sisyphus flashcard get-decks --json
siyuan-sisyphus flashcard get-cards --deck-id "<deck-id>" --page 1 --page-size 32 --json
```

Use an empty deck ID only when the command help says cross-deck queries are supported for that action.

## Create Cards

First create or identify a heading block:

```bash
siyuan-sisyphus block append --parent-id "<doc-id>" --data-type markdown --data "## What is spaced repetition?

Review just before forgetting."
siyuan-sisyphus document get-child-blocks --id "<doc-id>" --json
```

Then register the heading block as a card:

```bash
siyuan-sisyphus flashcard create-card --deck-id "<deck-id>" --block-ids "<heading-block-id>" --json
```

Avoid using `block set-attrs` alone for flashcard creation. It can write metadata, but it does not complete the full card registration workflow.

## Review Cards

```bash
siyuan-sisyphus flashcard list-cards --scope deck --deck-id "<deck-id>" --filter due --json
siyuan-sisyphus flashcard list-cards --scope all --filter new --json
siyuan-sisyphus flashcard review-card --deck-id "<deck-id>" --card-id "<card-id>" --rating 3
siyuan-sisyphus flashcard review-card --deck-id "<deck-id>" --card-id "<card-id>" --skip
```

Ratings are usually 1 to 4, with higher meaning easier or better recall.

## Scopes for Listing Cards

| Scope | Required flag |
| --- | --- |
| `all` | omit `--deck-id` |
| `deck` | `--deck-id` |
| `notebook` | `--notebook` |
| `tree` | `--root-id` |

## Remove Cards

Removing cards changes deck membership. Confirm first:

```bash
siyuan-sisyphus flashcard remove-card --deck-id "<deck-id>" --block-ids-json '["<block-id>"]'
```

## Pitfalls

- `create-card` validates deck IDs; run `get-decks` first.
- `list-cards` can post-filter by due/new/old state.
- Newly created headings or tags may need a short indexing delay before discovery commands show them.

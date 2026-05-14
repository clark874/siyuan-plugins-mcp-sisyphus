---
name: siyuan-sisyphus-tag-flashcard
description: Manage tags and flashcards in SiYuan. Covers inline tag creation, flashcard creation/review, and deck operations. Use when the agent needs to work with SiYuan tags or spaced repetition.
---

# SiYuan Sisyphus — Tags and Flashcards

## Tags

**There is no direct `tag.create`**. Tags are created by writing `#tag#` into block markdown content.

### Create Tags Inline

```python
# Create tags inline in block content
block(action="append", parentID="doc-id", dataType="markdown", data="#project# #urgent#")

# Hierarchical tags
block(action="append", parentID="doc-id", dataType="markdown", data="#project/phase1#")
```

### List and Manage Tags

```python
# List all tags
tag(action="list")

# Search/filter tags
tag(action="list", keyword="project")

# Rename a tag everywhere it appears
tag(action="rename", oldLabel="old-tag", newLabel="new-tag")

# Remove a tag label (requires explicit user confirmation)
tag(action="remove", label="tag-to-remove")
```

**Note**: Recently written tags may appear with a short indexing delay in tag list/search results. Retry briefly before treating that as a failure.

## Flashcards

SiYuan uses heading-based flashcards: h2 heading as the question, following blocks as the answer.

### Create Flashcards

```python
# Turn existing blocks into flashcards (preferred method)
flashcard(action="create_card", deckID="deck-id", blockIDs=["heading-block-id"])

# Alternative: low-level attribute writing (not the full workflow)
block(action="set_attrs", id="heading-block-id", attrs={"custom-riff-decks": "deck-id"})
```

**Preferred method**: `flashcard(action="create_card")` writes `custom-riff-decks` and registers the riff card together transactionally.

### Review Flashcards

```python
# List due cards
flashcard(action="list_cards", scope="deck", deckID="deck-id", filter="due")

# List new cards
flashcard(action="list_cards", scope="all", filter="new")

# Review a card with rating (1-4, higher = better)
flashcard(action="review_card", deckID="deck-id", cardID="card-id", rating=3)

# Skip current card
flashcard(action="review_card", deckID="deck-id", cardID="card-id", skip=True)
```

### Deck Operations

```python
# List all available decks
flashcard(action="get_decks")

# List all cards in a deck (paginated)
flashcard(action="get_cards", deckID="deck-id", page=1, pageSize=32)

# Remove blocks from a deck (requires explicit user confirmation)
flashcard(action="remove_card", deckID="deck-id", blockIDs=["block-id"])
```

### Flashcard Structure

```
## Question heading  ← Card Front (h2 with custom-riff-decks attribute)
Answer paragraph    ← Card Back
Another paragraph   ← Card Back (continued)
```

- **Question**: An `h2` heading with `custom-riff-decks` attribute pointing to a deck ID
- **Answer**: One or more blocks immediately following the question heading
- **Cloze**: `==answer==` inside content is treated as a cloze answer

### Scope Options for list_cards

| scope | Required parameter | Meaning |
|-------|-------------------|---------|
| `all` | omit deckID | All decks |
| `deck` | deckID | Specific deck |
| `notebook` | notebook | Specific notebook |
| `tree` | rootID | Document subtree |

### Pitfalls

1. **`block(action="set_attrs")` with `custom-riff-decks` is not the full workflow**: It only writes metadata binding. Prefer `flashcard(action="create_card")` for proper flashcard creation.

2. **`create_card` validates deck IDs**: Non-built-in deck IDs must already exist (use `get_decks` to discover them).

3. **`remove_card` requires confirmation** before execution.

4. **`list_cards` post-filters by state**: Pass `reviewedCards` to match SiYuan's in-review filtering.

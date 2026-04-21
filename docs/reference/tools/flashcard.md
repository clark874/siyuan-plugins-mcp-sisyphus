# flashcard

This tool covers review-first flashcard operations and deck management.

When to read this page: you need to list due cards, inspect decks, or turn blocks into flashcards.

Related pages:

- [Common Tasks](../common-tasks.md)

## Actions

| Group | Actions |
|------|---------|
| Read | `list_cards`, `get_decks`, `get_cards` |
| Review flow | `review_card`, `skip_review_card` |
| Deck mutations | `create_card`, `add_card`, `remove_card` |

## Safety Rules

- `remove_card` requires explicit confirmation

## Notes

- `create_card` is the preferred full workflow for turning blocks into flashcards
- `add_card` is a lower-level riff registration step

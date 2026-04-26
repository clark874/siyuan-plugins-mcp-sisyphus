# flashcard

This tool covers review-first flashcard operations and deck management.

When to read this page: you need to list due cards, inspect decks, review cards, or turn blocks into flashcards.

Related pages:

- [Common Tasks](../common-tasks.md)

## Actions

| Group | Actions |
|------|---------|
| Read | `list_cards`, `get_decks`, `get_cards` |
| Review flow | `review_card` |
| Deck mutations | `create_card`, `remove_card` |

## Safety Rules

- `remove_card` requires explicit confirmation.

## Notes

- `review_card` accepts either a `rating` or `skip=true`.
- `create_card` turns existing blocks into flashcards; `mode="full"` writes deck attributes and registers cards, while `mode="attach"` only registers existing blocks.

## Action List

- `list_cards`
- `get_decks`
- `get_cards`
- `review_card`
- `create_card`
- `remove_card`

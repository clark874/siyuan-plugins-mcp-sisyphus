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
- `list_cards` accepts optional `reviewedCards`, matching SiYuan's review flow for filtering cards already handled in the current round.
- `list_cards(scope="all")` should omit `deckID`; an empty string is treated as omitted for compatibility. Non-empty `deckID` belongs with `scope="deck"`.
- `create_card` turns existing blocks into flashcards through SiYuan's `addRiffCards` flow, which writes deck attributes and registers card records transactionally. Non-built-in `deckID` values must already exist. `mode` is kept for compatibility.

## Action List

- `list_cards`
- `get_decks`
- `get_cards`
- `review_card`
- `create_card`
- `remove_card`

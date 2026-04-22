# mascot

This tool covers the plugin mascot balance and shop interactions.

When to read this page: you want to inspect earned balance or shop inventory.

Related pages:

- [Tools Index](./index.md)

## Actions

| Action | Required Fields | Notes |
|--------|-----------------|------|
| `get_balance` | none | Current balance and earned stats |
| `shop` | none | Shop inventory |
| `buy` | `item_id` | Spend balance on an item |

## Notes

- Successful non-mascot tool calls earn one coin
- Shop inventory and balance are part of the mascot interaction layer

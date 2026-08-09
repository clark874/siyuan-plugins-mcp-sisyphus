# mascot

This tool covers the plugin mascot balance and shop interactions.

When to read this page: you want to inspect earned balance or shop inventory.

Related pages:

- [Tools Index](./index.md)

## Actions

| Action | Required Fields | Notes |
|--------|-----------------|------|
| `get_balance` | none | Current balance and earned stats |
| `shop` | none | Shop inventory, current balance, and earned stats |
| `buy` | `item_id` | Spend balance on an item |

## Notes

- Successful non-mascot tool calls earn one coin
- Shop inventory and balance are part of the mascot interaction layer

## MCP App

MCP Apps clients open one pixel-art vending machine through `mascot_shop_app`; ordinary `mascot` calls never render an App. Refresh, balance, and purchase operations use the model-hidden `mascot_shop_app_action` and are controlled independently on the MCP Apps settings page. A queued item is purchased only when the user clicks it in the pickup slot. The successful event is normalized to `mascot.buy`, so the desktop mascot shows both hearts and the collected item alongside its action animation.

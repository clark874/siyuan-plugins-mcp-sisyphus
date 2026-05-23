# flashcard 工具

这个工具覆盖以复习为中心的闪卡操作与卡组管理。

适用场景：你需要列出待复习卡片、查看卡组、复习卡片，或把块转为闪卡。

相关页面：

- [常见任务](../common-tasks.md)

## 动作

| 分组 | 动作 |
|------|---------|
| 读取 | `list_cards`, `get_decks`, `get_cards` |
| 复习流程 | `review_card` |
| 卡组修改 | `create_card`, `remove_card` |

## 安全规则

- `remove_card` 需要显式确认。

## 说明

- `review_card` 可传 `rating`，也可用 `skip=true` 跳过当前卡片。
- `list_cards` 可传可选的 `reviewedCards`，与思源复习流程一致，用于过滤本轮已经处理过的卡片。
- `list_cards(scope="all")` 应省略 `deckID`；为兼容调用端自动补值，空字符串会按未传处理。非空 `deckID` 应配合 `scope="deck"` 使用。
- `create_card` 通过思源的 `addRiffCards` 流程把已有块转为闪卡；该流程会在 transaction 中同时写入卡组属性并注册卡片记录。非内置卡组的 `deckID` 必须已存在，`mode` 保留为兼容参数。

## 动作列表

- `list_cards`
- `get_decks`
- `get_cards`
- `review_card`
- `create_card`
- `remove_card`

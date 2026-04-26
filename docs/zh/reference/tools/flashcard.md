# flashcard

这个工具覆盖以复习为中心的闪卡操作与卡组管理。

适用场景：你需要列出待复习卡片、查看卡组、复习卡片，或把块转为闪卡。

相关页面：

- [常见任务](../common-tasks.md)

## Actions

| 分组 | Actions |
|------|---------|
| 读取 | `list_cards`, `get_decks`, `get_cards` |
| 复习流程 | `review_card` |
| 卡组修改 | `create_card`, `remove_card` |

## 安全规则

- `remove_card` 需要显式确认。

## 说明

- `review_card` 可传 `rating`，也可用 `skip=true` 跳过当前卡片。
- `create_card` 将已有块转为闪卡；`mode="full"` 会写入卡组属性并注册卡片，`mode="attach"` 只注册已有块。

## Action 列表

- `list_cards`
- `get_decks`
- `get_cards`
- `review_card`
- `create_card`
- `remove_card`

# flashcard

这个工具覆盖复习优先的闪卡操作和卡组管理。

适用场景：你需要列出待复习卡片、查看卡组，或把现有块转成闪卡。

相关页面：

- [常见任务](../common-tasks.md)

## Actions

| 分组 | Actions |
|------|---------|
| 读取 | `list_cards`, `get_decks`, `get_cards` |
| 复习流程 | `review_card`, `skip_review_card` |
| 卡组修改 | `create_card`, `add_card`, `remove_card` |

## 安全规则

- `remove_card` 需要显式确认

## 说明

- `create_card` 是把块转成闪卡的推荐完整流程
- `add_card` 属于更底层的 riff 注册步骤

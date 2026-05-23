# 添加动作

这个页面描述给现有聚合工具新增 action 时的工作流。

适用场景：你只是在扩展某个已有工具，而不是新增全新工具类别。

## 工作流

1. 在 `src/core/config.ts` 中加入 action
2. 定义或扩展 action schema
3. 在工具描述层加入对应 action variant
4. 实现 handler
5. 如有必要，默认启用
6. 添加或更新测试

## 注意点

- CLI flag 映射和文档都要与新的 action 结构保持一致
- 重新检查确认规则和权限要求

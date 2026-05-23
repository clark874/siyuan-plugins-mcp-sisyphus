# 测试

这个页面汇总仓库中的测试面。

适用场景：你在改动前后需要验证行为。

## 命令

```bash
pnpm test
pnpm test:watch
pnpm test:coverage
pnpm test:smoke
```

## 测试区域

- 单元测试：`tests/unit/`
- 集成测试：`tests/integration/`
- 冒烟检查：`tests/smoke/`

## 说明

- 冒烟测试需要运行中的思源实例
- 修改工具或 action 时应同步补测试

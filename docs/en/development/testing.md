# Testing

This page summarizes the repo test surface.

When to read this page: you need to validate behavior before or after a change.

## Commands

```bash
pnpm test
pnpm test:watch
pnpm test:coverage
pnpm test:smoke
```

## Test Areas

- Unit tests under `tests/unit/`
- Integration tests under `tests/integration/`
- Smoke checks under `tests/smoke/`

## Notes

- Smoke tests require a running SiYuan instance
- Prefer updating tests alongside tool/action changes

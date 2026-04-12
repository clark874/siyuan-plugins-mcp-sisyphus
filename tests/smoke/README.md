# Live Smoke Tests

This directory contains tests that require a **running SiYuan instance**.

They are **not** part of the Vitest unit/integration suite (`pnpm test`).

## Prerequisites

1. Start SiYuan: `/Applications/SiYuan.app/Contents/MacOS/SiYuan`
2. Build the plugin: `pnpm build`

## Running

```bash
pnpm test:smoke
```

## Files

- `live_mcp_smoke.cjs` — End-to-end smoke tests against a live SiYuan instance (27+ test cases covering permissions, navigation, search, block operations, etc.)
- `AI_INTERFACE_TEST.md` — Manual test guide for AI-driven regression testing of MCP interfaces

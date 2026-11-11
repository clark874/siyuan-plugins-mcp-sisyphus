## Resolve the CLI entry first

Before the first SiYuan CLI call in every new session, verify that the local command is available:

```bash
command -v siyuan-sisyphus
siyuan-sisyphus --version
```

If the command is missing, resolve a locally installed or user-provided maintained CLI entry before continuing. Do not use `npx` as an implicit fallback. A public npm package may lag the locally maintained plugin and silently omit custom actions or safety contracts.

本机命令名还可为 `sisyphus`。首选命令不存在时，运行 `command -v sisyphus` 并核对版本，再使用该入口；两个命令属于同一 CLI。Agent 调用固定使用 `--json` 保留窗口、正文和续读字段；人类视图显示本次受控正文窗口。

After resolving the entry, start with the read-only live bootstrap:

```bash
siyuan-sisyphus system bootstrap --json
```

本机 CLI 后备入口：[操作规程](cli-sisyphus.md)。优先使用已连接 MCP，不重复注册连接或隐式下载旧版。

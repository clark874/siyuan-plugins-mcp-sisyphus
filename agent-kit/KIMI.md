# 在 Kimi Code 中接入思源

Kimi 模型本身不保存 MCP 连接；连接由运行 Kimi 的宿主客户端管理。以下步骤适用于 Kimi Code CLI。若只是在已经配置好 `siyuan` MCP 的 ZCode 中切换到 Kimi 模型，不需要重复配置连接，直接加载本包的 Skill 即可。

本机存在两层 MCP，但 Kimi Code 只注册 Sisyphus：`http://127.0.0.1:36806/mcp`。不要再把思源内置的 `http://127.0.0.1:6806/mcp` 并列添加；官方 MCP 由 Sisyphus 的 `extension` 在需要时内部桥接。

## 一、安装启动 Skill

推荐在解压后的交付包目录中执行本地安装器：

```bash
SIYUAN_MCP_TOKEN='<本地 token>' node scripts/install-agent-kit.mjs --client kimi
```

若 Kimi 或 ZCode 已经保存有效 token，可以省略环境变量。安装器会备份既有配置、安装 Skill，并只注册 `36806/mcp`。也可以手动安装 Skill：

```bash
mkdir -p ~/.agents/skills
cp -R ./skills/siyuan-mcp-sisyphus ~/.agents/skills/
```

也可以把整个 `agent-kit` 作为 Kimi 插件安装，使启动 Skill 在会话开始时自动加载：

```text
/plugins install /绝对路径/siyuan-agent-kit.zip
/reload
```

Kimi Work 桌面端和 Kimi Code 使用不同的运行时配置目录。安装 Skill 或插件不等于已经写入带认证的 MCP 连接；只有工具列表中出现 Sisyphus 的 14 个聚合工具并成功调用 `bootstrap`，才能报告连接完成。

## 二、配置 MCP 连接

确认思源和 Sisyphus 插件正在运行。在普通终端中安全输入 Sisyphus MCP token，不要把 token 粘贴进聊天：

```bash
printf "SIYUAN MCP token: "
IFS= read -r -s SIYUAN_MCP_TOKEN
printf "\n"
kimi mcp add --transport http siyuan http://127.0.0.1:36806/mcp \
  --header "Authorization: Bearer ${SIYUAN_MCP_TOKEN}"
unset SIYUAN_MCP_TOKEN
kimi mcp test siyuan
```

如果 `siyuan` 已经存在，先运行 `kimi mcp remove siyuan`，再重新添加。

上述命令是安装器不可用时的手动退化方案。不要把 token 写入聊天或公开配置模板。

## 三、开始使用

新建 Kimi 会话后执行：

```text
/skill:siyuan-mcp-sisyphus
```

随后可以直接说：

```text
连接思源笔记。先调用 system(action="bootstrap")，依据返回的实时权限、能力和 nextCalls 开始工作；不要探测端口或读取 token。
```

若 `kimi mcp test siyuan` 失败，应先检查思源与 Sisyphus 是否运行以及 token 是否有效，不要让模型自行搜索本地凭据。

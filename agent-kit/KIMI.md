# 在 Kimi Code 中接入思源

Kimi 模型本身不保存 MCP 连接；连接由运行 Kimi 的宿主客户端管理。以下步骤适用于 Kimi Code CLI。若只是在已经配置好 `siyuan` MCP 的 ZCode 中切换到 Kimi 模型，不需要重复配置连接，直接加载本包的 Skill 即可。

## 一、安装启动 Skill

在普通终端执行：

```bash
mkdir -p ~/.agents/skills
cp -R ./skills/siyuan-mcp-sisyphus ~/.agents/skills/
```

也可以把整个 `agent-kit` 作为 Kimi 插件安装，使启动 Skill 在会话开始时自动加载：

```text
/plugins install /绝对路径/siyuan-kimi-agent-kit.zip
/reload
```

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

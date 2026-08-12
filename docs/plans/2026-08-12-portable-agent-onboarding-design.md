# 思源 Agent 便携接入包设计

## 目标

把“模型接入思源”拆成三个稳定边界：MCP 客户端负责连接和凭据，服务端 `system.bootstrap` 负责返回实时状态，Agent 指令只保留长期不变的操作规则。任何动态版本、笔记本数量、目录数量和知识资产统计都不再写入静态 Skill。

## 交付结构

本设计的连接边界已由[单一 Sisyphus 网关交付设计](./2026-08-12-single-gateway-agent-delivery-design.md)进一步收敛：外部客户端只注册 Sisyphus `36806/mcp`，思源内置 `6806/mcp` 仅作为内部扩展总线。`START-HERE.md`、`delivery.json` 与本地安装器共同构成当前正式入口。

1. `system.bootstrap` 返回版本、实时权限、当前启用能力、路径规则和可执行的后续调用。响应明确区分“本次动作只读”和“连接可能具有写权限”。
2. `agent-kit/AGENT.md` 是可以直接粘贴给任意模型的客户端无关启动指令。
3. `agent-kit/skills/siyuan-mcp-sisyphus/SKILL.md` 是支持 Agent Skills 的宿主可以安装的标准 Skill。
4. `agent-kit/mcp-config.example.json` 仅提供无密钥配置模板；Bearer token 必须由用户写入 MCP 客户端的安全配置，绝不进入模型上下文或交接文档。
5. `agent-kit/KIMI.md` 说明 Kimi 是模型而不是连接宿主：在已配置的 ZCode 中只需加载启动指令；在其他支持 MCP 的宿主中还需安装连接配置；不支持 MCP 的聊天界面不能直接安装本地思源工具。

## 数据流

```text
用户配置 MCP 凭据 -> 客户端建立 Streamable HTTP 连接
                     -> Agent 调用 system.bootstrap
                     -> 服务端刷新权限并读取实时工具配置
                     -> Agent 根据 nextCalls 开始任务
```

`bootstrap` 不主动探测每个业务接口，但能力状态必须来自当前工具配置，并明确报告配置读取是否为实时值。不可读取的笔记本不返回名称或 ID，只返回受限数量。

## 失败处理

- MCP 工具不可见：报告宿主尚未配置连接，不自行探测端口、读取 token 或手写协议。
- 工具配置读取失败：使用默认配置形成退化摘要，同时标记 `current=false`，不得宣称已实时验证。
- 权限刷新失败：整个 `bootstrap` 失败关闭，避免返回陈旧权限。
- 客户端不支持 Skills：直接粘贴 `AGENT.md`，功能不受影响。

## 验收

- 受限笔记本不出现在响应中。
- `operation.readOnly=true` 不再被表述为会话只读。
- 能力随实时工具配置变化。
- Skill 中的 action 名称与源码契约测试一致。
- 便携包不含 token 或易漂移的知识库统计；发布清单保留固定版本号，以便 Agent 使用不可变地址并实现可追踪安装。
- 全量测试、生产构建、真实 MCP 调用和部署版本一致。

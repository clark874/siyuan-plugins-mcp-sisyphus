# LLM Wiki 检索评测

本评测用于比较同一思源工作区内的全文检索、原生语义检索、旧版知识编排与受控命名空间优先编排。它不建立第二套索引，不引入 QMD、Fuse.js、ranx 或本地模型，也不加入默认 CI。

## 评测集

私有评测集应存为：

```text
scripts/retrieval-eval/fixtures/local-*.json
```

该路径已被 Git 忽略，因为稳定块 ID、专题名称和真实查询可能暴露个人知识库结构。公开仓库仅保留 `example.json` 与 `fixture.schema.json`。

每道题包含：

- `query`：真实用户表述；
- `type`：`exact_name`、`exact_alias`、`contained_alias`、`semantic`、`ambiguity`、`no_match` 或 `cross_language`；
- `expected`：按稳定块 ID 标注的分级相关目标；
- `expectedResolution`：可选的 `unique`、`ambiguity`、`fallback` 或 `no_match`；
- `activeScopes`：需要按 `custom-anchor-scope` 消歧时使用。

正式基准至少包含 30 题，并同时覆盖容易题、语义改写、跨语言、历史多义词和无答案负例。不得只用精确名称证明新路径优于语义路径。

## 运行

先启动思源与 Sisyphus HTTP MCP，再运行：

```bash
npm run eval:retrieval -- \
  --fixture scripts/retrieval-eval/fixtures/local-workspace.json \
  --output scripts/retrieval-eval/results/local-workspace.json
```

运行器复用项目已有 MCP 客户端依赖，通过 `127.0.0.1:36806/mcp` 调用真实服务，并在开始前用只读 SQL 验证全部目标块仍存在且可读。

## 指标

每个后端报告：

- Hit@1、Hit@3、Hit@5；
- MRR；
- nDCG@5；
- 命名空间解析正确率；
- 无答案题误命中率；
- 响应时延 P50/P95；
- 响应字节数 P50/P95；
- 外部调用和数据外发次数。

`knowledge_baseline` 仅通过 `namespaceMode="off"` 复现原有语义编排，供同版本诊断比较；普通 Agent 不应关闭命名空间探测。

## 发布纪律

- 评测结果必须注明思源版本、插件版本、题目数、评测时间与私有评测集哈希；
- 只发布聚合指标，不发布私有查询、路径或稳定块 ID；
- 语义提供商、索引状态或知识库内容变化均可能影响结果，跨版本比较时必须重新运行全部后端；
- 精确命中表示确定性定位，不表示内容已获得证据批准；证据边界仍由块属性和原文决定。

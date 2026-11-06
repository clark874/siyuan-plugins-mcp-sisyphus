# 文献库与 Zotero

文献库是一个独立的思源笔记本。AV 保存可查询的书目与来源，每条记录绑定真实的全文文档。Sisyphus 通过只读入口将目录、论文和原文块提供给学术写作流程。

## 在思源设置文献工作流

在插件设置中打开「文献工作流」。填写文献笔记本、可选的正文父文档和 AV 数据库 ID。Zotero 使用官方个人或群组文库地址。NotebookLM 选填本机登录配置、Python 和目标笔记本；目标 ID 留空时按已有项目收据续跑或首次建库。

桌面端可直接选择已准备的批次清单和项目收据绝对路径，先只读预检，再执行。思源连接使用插件自身的 HTTP 配置。Zotero 与翻译模型密钥可由本机环境提供，也可在面板输入并仅用于当前思源会话。设置文件只记录变量名，NotebookLM 登录仍由本机客户端管理。

## 中英文对照阅读

- 默认手动。点击右侧「文献翻译」图标，在侧栏中选择「翻译全文」；原文页「更多」菜单也可打开此侧栏。启用「入库后自动翻译」后，批量入口在原文与 AV 绑定回读后启动翻译。
- 配置本机 `mdtx` 可执行文件和 YAML 绝对路径。YAML 需开启 `output.write_report: true`，沿用默认输出命名。选择外部模型时，启用该流程会发送论文正文并按模型服务计费。
- 译文经过结构校验后归档为同一篇论文原文下的子文档，继承原文所属笔记本，保留原文版本指纹。AV、Zotero 和 NotebookLM 的书目身份仍指向规范原文。原文变更后可生成新版本译文，已归档版本保留。
- 在翻译侧栏中保存 mdtx 配置和本次会话密钥，选择「开启双屏对照」，中间保留原文，右侧直接呈现译文。普通文档也支持手动翻译。批量入库仍需配置文献库与 AV。
- 对照阅读先核对原文版本指纹和正文块结构。点击原文块会定位并高亮译文块，点击译文块也可回到原文。修改正文后需要重新核验；旧译文结构不一致时应更新译文。开启同步滚动时按章节位置对齐，关闭后仍可双向点击。
- 翻译稿按机器译文管理。块配对核验检查结构与来源版本；论文的证据判断仍需阅读上下文。
- 已经通过校验的本机译文会在归档重试时复用。进程异常退出后如提示锁残留，先确认锁文件记录的进程已结束，并检查原文子文档及待对账记录，再处理该任务的本机缓存。结构校验通过后按机器译文归档，人工逐句核对由用户决定。

## 发现与查读

用 `system.bootstrap` 读取 `literature.libraries`。已关联项目的文献库也出现在 `project.snapshot`。同一个库可以由写作流程直接调用。多库并存时使用返回的 `catalogBlockId` 指定范围。返回的 `query.operation` 是要传入工具的 `action`。

```json
{"action":"find_evidence","doi":"10.1111/rssb.12348"}
```

```json
{"action":"find_evidence","query":"遗漏混杂需要多强才能解释估计结果？","keywords":["omitted variable bias","sensitivity analysis"],"limit":5}
```

- `doi`、`title`、`zoteroKey` 或 `documentId` 用于精确定位；有多个文档匹配时返回候选。标题来自 AV 的题名字段，缺失时使用文档标题。
- 提供问题时在目录绑定的全文范围内融合关键词与向量召回。跨语言查读可提供最多4组原文检索词。
- `semantic: true` 允许按已登记的文档范围补充向量候选。内核外部重排已开启或范围过大时，保留本地检索，并报告原因。内核支持时同时返回已有向量数量及缺少空间标记的旧向量数量。
- `rerank: true` 允许将有权限的正文候选交给已配置的 Jev 分批评分，再统一排序。某批失败时保留原召回顺序并报告未完成状态。
- 候选论文和证据不再预先截为四篇、十块。Jev 分批评估召回的正文候选，再统一排序。`limit` 只控制本页展示数量，默认 20，最大 200；`offset` 用于继续读取当前查询的后续结果。
- 检索仍受每个通道的分页与索引覆盖影响，每个检索式请求100条，实际返回块数受内核分组方式影响。`offset` 仅切分已召回候选；每次调用重新检索和评分，索引或模型结果变化时排序可能变化。请检查 `recallMayHaveMore` 和未完成状态；已检索的候选集合不等于逐篇读完全部正文。涉及多个机制或反例时，应拆分研究问题并回读相关章节。
- 返回的 `evidenceStatus: "source_read_back"` 表明内容来自原文回读。输出含可打开的块地址、所属正文和章节。学术判断仍需核读相关上下文。

## 跨文献写作取证

开放问题使用接入包的 `templates/notebooklm-literature-v1.md`。通过 `scripts/query-notebooklm-literature.py --scope /绝对路径/来源范围.json --question '研究问题' --output /绝对路径/问答记录.json` 发起独立问答。运行器使用已配置 NotebookLM 客户端所在的 Python 环境。来源清单包含 `notebookId` 和 `sources`，每条来源至少保存 `sourceId` 和唯一的 `documentId`，建议同时记录原文版本哈希。每次问答保存模板与实际提示词的哈希、选定来源和原生引用。`--render-only` 可先查看实际发出的提示词。

将拟用于写作的主张逐条对照引用。通过 AV 的 DOI、Zotero 键或正文标识定位同一版本，直接回读支持段落、图表和必要的上下文。记录原文是否支持，以及是否需要补上模型、样本、统计量或识别条件。引用定位失败、论断没有充分支持、文献冲突或需要找反例时，才对缺口调用 `literature.find_evidence`。候选多到需要精排时再启用 `rerank`。

`find_evidence` 在评分前读取 `custom-literature-role`，将 `abstract`、`references`、`metadata` 和 `caption` 移出正文证据候选，并按同一规则处理邻块。摘要仍可用于识别论文。图表标题和表注可随表格回读核对。未标记的块仍可参与取证。`filteredByContentRole` 记录本次召回后排除的候选数。

## 登记一个库

1. 在思源建立独立的文献笔记本，创建目录文档。在目录文档中建立原生 AV。新工作区建议先用思源界面建立首张原生 AV。已有 AV 存储目录的工作区也可调用 `av.render(createIfNotExist=true, blockID=<目录文档ID>)`。
2. 在**真实 AV 块**上设置自定义属性 `custom-literature-catalog`，值为该 AV 的 ID。可通过 `block.set_attrs` 完成。若需要项目入口发现，再设置 `custom-literature-projects`，值为以逗号分隔的项目 ID。
3. 用 `system.bootstrap` 回读目录标识。再调用 `literature.find_evidence` 验证目录真实归属和可读性。
4. AV 使用绑定正文的主键。建议列名为「题名」「作者」「年份」「DOI」「Zotero 键」「摘要」「所属项目」「全文状态」「原文哈希」或「正文版本」。项目查询按行的「所属项目」限制范围。若需要主题参与论文筛选，使用「已核定专题」。书目缺项留空，另存版本与来源依据。

## 入库与续作

先按 DOI、Zotero 键或确切题名查询现有记录，再核对正文版本及来源哈希。有多个候选时先分辨版本。同一来源版本已经绑定时复用正文和行。

一批已获取的论文可直接交给接入包 `scripts/ingest-literature-batch.mjs`。探索性发现由独立文献检索技能完成，已选论文交给 `citation-check` 核对书目后再下载和转换。入库清单只接收已选定、已核验并准备好的 Markdown 和 Zotero 书目。

```bash
node scripts/ingest-literature-batch.mjs \
  --project /绝对路径/项目目标.json \
  --manifest /绝对路径/本批论文.json \
  --mcp-settings /绝对路径/MCP设置.json \
  --zotero-config /绝对路径/Zotero私有配置.json \
  --receipt /绝对路径/项目入库收据.json \
  --python /绝对路径/NotebookLM客户端环境/bin/python
```

- 项目目标包含 `siyuan: {notebook, parentID, avID}`。`parentID` 可为 `null`，表示笔记本根位置。AV 使用绑定正文的主键，以及「题名」「原文哈希」「Zotero 键」文本列。其他现有兼容文本列按需补空。批量创建与结构化定位需要思源 3.8.9。
- 启用云端入库时，项目目标另加 `notebooklm: {notebookTitle, notebookId?, profile?}`。已有云端笔记本提供 `notebookId`，首次建库可省略。执行会使用本机已登录的 NotebookLM 客户端，将本批通过本地登记的原文发送到该笔记本。项目收据须在后续批次继续复用。
- 个人 NotebookLM 接入已用 `notebooklm-mcp-cli` 0.11.6 验证。可将该版本安装到专用 Python 环境，使用 `nlm login --profile 学术文献` 登录，再用 `nlm login --check --profile 学术文献` 检查。将同一环境的 Python 绝对路径传给 `--python`，并在项目目标填写相同的 `profile`。会话凭据由客户端本机保管。
- 批次清单为 `{papers:[{sourcePath,sourceSha256,zoteroItem,zoteroKey?,documentId?,sourceId?,siyuanTitle?}]}`。`sourcePath` 使用已核实的 Markdown 绝对路径，`sourceSha256` 是该文件的 SHA-256，`zoteroItem` 使用核准的 Zotero 书目字段。提供已有文档或来源标识时仍须对账。
- 默认只读预览。加 `--execute` 后对 Zotero 精确查重，登记并回读书目，再创建或复用思源正文、登记角色并核对 AV。配置云端目标后，已回读的论文随即上传。云端实际全文回读通过后进入 `<收据>.notebooklm.json` 的 `sources`，该文件可直接用作问答入口的 `--scope`。
- 任何一端结果不明时保留已获标识和待核状态。使用同一项目收据与清单续跑，先确认既有对象，必要时再补写。思源与 Zotero 登记完成但云端待核时，继续使用本地证据。执行摘要里的云端统计限本批，问答范围来自整份项目收据的已验收来源。
- 接管历史云端来源时同时指定 `notebookId` 和原有 `sourceId`。历史格式与当前上传投影不同时，可追加 `adoptUploadPath` 和 `adoptUploadSha256`，用原上传副本核对云端全文。仅接受明确的静态来源，回读未通过的来源单列待核。已有项目可继续使用此前验收的来源范围。

新增时使用 `document.create` 写入已转换的 Markdown，保存返回的文档 ID。接入包的 `scripts/finalize-literature-ingest.mjs` 将内容角色登记、AV 绑定、填写空书目字段和读回串联为一次入库收尾。登记清单为 `{"documentId":"正文标识","avID":"目录标识","fields":{"题名":"论文题名","原文哈希":"64位SHA-256"}}`。`fields` 可包含已有的文本列，例如 DOI、Zotero 键、摘要、全文状态和核实过的绝对路径。

使用 `node scripts/finalize-literature-ingest.mjs /绝对路径/MCP设置.json /绝对路径/单篇登记.json` 预览。加 `--execute` 执行。角色判断用文档结构与本地规则，正文和未能确定的块保留；脚本读回角色与原文校验值，再读回目录行。收到部分结果后用同一文档标识续作。若目录字段与计划冲突，通过书目联动流程处理。

已有全文使用 `node scripts/tag-literature-roles.mjs --mcp-settings /绝对路径/MCP设置.json --manifest /绝对路径/文献清单.json --report /绝对路径/角色收据.json` 预览。指定 `--document-id` 可单篇补标。通过抽查后加 `--execute`，角色写入经过严格预检并回读。角色工具依赖 `search.query_sql`，遵守网关的笔记本权限。自动标签保存 `custom-literature-role` 和正文指纹，正文变化后回到待判断状态，保留参与检索。别名继续用于论文和术语定位。

Zotero 书目、批注和附件查询仍用 `search_papers`、`get_paper`、`get_annotations` 等原动作。思源文献查询可直接访问已经入库的正文。

## Zotero 与目录联动

书目字段通过接入包的 `scripts/sync-literature-catalog.mjs` 统一更新。Zotero 保存书目权威记录，AV 保存用于发现与查读的镜像。两边入口收集的题名、作者、摘要或版本修改均交给这一个流程。仅在 Zotero 已确认、AV 对应行逐字段回读一致后，流程返回“两端已回读”。

```bash
node scripts/sync-literature-catalog.mjs \
  --mcp-settings /绝对路径/mcp-settings.json \
  --zotero-config /绝对路径/zotero-config.json \
  --manifest /绝对路径/literature-manifest.json \
  --report /绝对路径/sync-receipt.json
```

默认生成只读预览，增加 `--execute` 后执行。`--edits /绝对路径/edits.json` 可提供按 Zotero 键索引的字段修改，例如 `{"ABCD2345":{"abstractNote":"经核对的摘要"}}`。脚本先带条目版本条件写入 Zotero 并回读，再以严格预检协议同步 AV。只需对账现有 Zotero 条目时省略 `--edits`。

- `mcp-settings.json` 使用已配置网关的私有设置 `{host, port, authEnabled, token}`。`zotero-config.json` 使用 `{baseUrl, apiKey}`，其中 `baseUrl` 为官方文库地址，如 `https://api.zotero.org/users/1234567`。凭据文件仅保存在本机受限目录。
- 清单结构为 `{"avID":"目录AV标识","records":[{"documentId":"全文文档标识","zoteroKey":"ABCD2345"}]}`。每个正文与 Zotero 键各出现一次，正文必须已经唯一绑定 AV 行。已有不同 Zotero 键时停止，先核对作品与版本。
- 同步字段为题名、作者、年份、期刊、卷期页、DOI、Zotero 键、摘要、正文版本、报告号、来源库和网址。「期刊」列依次取期刊、会议论文集或工作论文机构；报告号与预印本版本分别保存。缺列时经严格预检创建文本列，已存在列须为文本或网址类型。所属项目、专题、原文哈希、来源路径和正文由各自原流程维护。
- AV 失败后保留收据，用相同清单续跑。收据绑定清单与编辑内容，保存首次读取的编辑字段和版本。续跑先读 Zotero，已等于目标的字段直接复用；仍等于原值的字段按当前版本续写；出现第三个值时停止，保留人工修改。结果未知的请求也先回读。清单或编辑内容变化时使用新收据。每批 AV 写入前检测并发变化，最后再次核对 Zotero 版本。跨应用写入可能部分完成，收据如实标记，不能把一端完成写成两端完成。
- 当前联动由该统一入口触发。在 Zotero 界面或 AV 界面直接修改字段后，需要运行这一路径对账；界面编辑不自动触发后台监听。后续书目修改应进入统一流程，避免漏掉目录同步。

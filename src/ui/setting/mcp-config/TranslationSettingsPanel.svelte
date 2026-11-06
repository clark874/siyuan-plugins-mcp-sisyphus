<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { confirm } from "siyuan";
    import {
        LITERATURE_PROFILE_FILE, defaultLiteratureProfile, normalizeLiteratureProfile, validateLiteratureProfile, type LiteratureProfile,
    } from "../../literature/settings";

    export let plugin: {
        loadData: (name: string) => Promise<unknown>;
        saveData: (name: string, value: unknown) => Promise<unknown>;
        updateLiteratureProfile: (profile: LiteratureProfile) => void;
        mdtxBridgeAvailable?: () => boolean;
        mdtxHomeDir?: () => string;
        mdtxConfig?: <T = Record<string, unknown>>(command: string, payload?: Record<string, unknown>) => Promise<T>;
    };

    interface MdtxConfig {
        target_languages?: string[];
        provider?: Record<string, any>;
        pipeline?: Record<string, any>;
        segmentation?: Record<string, any>;
        input?: Record<string, any>;
        style?: Record<string, any>;
        output?: Record<string, any>;
        execution?: Record<string, any>;
        memory?: Record<string, any>;
        [key: string]: any;
    }
    interface GlossaryEntry { term: string; rendering: string; origin: string; status: string; doc_count: number; updated_at?: string }
    interface MemoryStats { hits?: number; misses?: number; entries?: number }

    const MODES = [
        { value: "fast", title: "快速", desc: "仅术语与语气 + 最小上下文，省 token 提速", icon: "⚡" },
        { value: "balanced", title: "平衡", desc: "文档摘要 + 只审可疑段落", icon: "⚖️" },
        { value: "quality", title: "质量", desc: "完整上下文 + 全量审校 + 文档级终审", icon: "🎯" },
    ];
    const GLOSSARY_STATUSES = [
        { value: "pending", label: "待生效" },
        { value: "active", label: "生效" },
        { value: "excluded", label: "排除" },
    ];
    const QUALITY_TOGGLES: Array<{ key: string; label: string; hint: string }> = [
        { key: "pipeline.enable_glossary", label: "统一术语译法", hint: "全文保持一致（快速模式不生效）" },
        { key: "pipeline.enable_sentinels", label: "漏译检查", hint: "检测遗漏的数字与内容" },
        { key: "pipeline.enable_anchor_scheduling", label: "上下文衔接", hint: "参考已译内容保持连贯（快速模式不生效）" },
        { key: "pipeline.enable_context_pull", label: "自动补充上下文", hint: "检索相似的历史译文（快速模式不生效）" },
        { key: "pipeline.enable_final_edit", label: "全文最终校对", hint: "仅质量模式生效" },
        { key: "memory.fuzzy_examples", label: "复用相似翻译", hint: "相似段落复用历史译文" },
        { key: "memory.enabled", label: "启用翻译记忆", hint: "关闭后每次重新翻译" },
        { key: "pipeline.enable_review", label: "强制审校", hint: "对所有文本包执行审校（平衡/质量模式）" },
        { key: "pipeline.enable_format_guard", label: "强制格式修复", hint: "" },
        { key: "pipeline.fail_on_validation_error", label: "格式校验失败时中止", hint: "" },
    ];

    let profile = defaultLiteratureProfile();
    let ready = false;
    let isDesktop = false;
    let homeDir = "";
    let config: MdtxConfig | null = null;
    let configPathDraft = "";
    let apiKeyInput = "";
    let hasStoredKey = false;
    let showKey = false;
    let preserveTermsText = "";
    let instructionsText = "";
    let memoryStats: MemoryStats | null = null;
    let glossaryLang = "zh";
    let glossaryEntries: GlossaryEntry[] = [];
    let glossaryQuery = "";
    let newTerm = "";
    let newRendering = "";
    let glossaryBusy = false;
    let saving = false;
    let testing = false;
    let testResult: { ok: boolean; text: string } | null = null;
    let loading = false;
    let gatewayModels: string[] = [];
    let gatewayModelsRequested = false;
    let message = "";
    let messageKind: "success" | "error" = "success";
    let savedConfigSnapshot = "";
    let savedProfileSnapshot = "";

    // 异步加载函数内不得读取响应式变量取路径：Svelte 只在赋值后重算，
    // 首次 onMount 时 effectiveConfigPath 仍是旧值，会把空路径发给桥接。
    function resolvedConfigPath() {
        return configPathDraft.trim() || (homeDir ? `${homeDir}/.mdtx/config.yaml` : "");
    }
    $: effectiveConfigPath = (configPathDraft, homeDir, resolvedConfigPath());
    $: dirty = (config ? JSON.stringify(config) !== savedConfigSnapshot : false)
        || JSON.stringify(profileFields()) !== savedProfileSnapshot
        || apiKeyInput !== "";
    $: filteredGlossary = (() => {
        const q = glossaryQuery.trim().toLowerCase();
        if (!q) return glossaryEntries;
        return glossaryEntries.filter(entry => entry.term.toLowerCase().includes(q) || entry.rendering.toLowerCase().includes(q));
    })();

    function profileFields() {
        const t = profile.translation;
        return { mode: t.mode, openAlongside: t.openAlongside, syncScroll: t.syncScroll, executable: t.executable, configPath: configPathDraft };
    }
    function snapshotProfile() { savedProfileSnapshot = JSON.stringify(profileFields()); }

    function show(text: string, kind: "success" | "error" = "success") {
        message = text;
        messageKind = kind;
        setTimeout(() => { if (message === text) message = ""; }, 4000);
    }

    function lines(text: string): string[] {
        return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    }
    function textOf(value: unknown): string {
        return Array.isArray(value) ? value.join("\n") : "";
    }

    function applyConfig(data: MdtxConfig) {
        if (data.pipeline && data.pipeline.mode === "strict") data.pipeline.mode = "quality";
        config = data;
        preserveTermsText = textOf(data.style?.preserve_terms);
        instructionsText = textOf(data.style?.instructions);
        hasStoredKey = Boolean(data.provider?.api_key);
        savedConfigSnapshot = JSON.stringify(config);
    }

    function bridgePayload(extra: Record<string, unknown> = {}) {
        return {
            executable: profile.translation.executable,
            configPath: resolvedConfigPath(),
            ...extra,
        };
    }

    async function loadGatewayModels() {
        if (gatewayModelsRequested || !isDesktop || !plugin.mdtxConfig || !config?.provider) return;
        gatewayModelsRequested = true;
        try {
            const result = await plugin.mdtxConfig<{ test?: { models?: string[] } }>(
                "test", bridgePayload({
                    base_url: config.provider?.base_url,
                    model: config.provider?.model,
                }));
            const models = result?.test?.models;
            if (models?.length) gatewayModels = models;
        } catch { /* 静默获取网关模型列表，失败不影响面板。 */ }
    }

    async function loadConfig() {
        if (!isDesktop || !plugin.mdtxConfig) return;
        if (!profile.translation.executable) {
            config = null;
            show("请先填写 mdtx 程序后读取配置。", "error");
            return;
        }
        loading = true;
        try {
            const result = await plugin.mdtxConfig<{ config?: MdtxConfig; config_path?: string; exists?: boolean }>(
                "get", bridgePayload());
            if (result?.config) {
                applyConfig(result.config);
                void loadGatewayModels();
            } else { config = null; show("未收到 mdtx 配置。", "error"); }
        } catch (error) {
            config = null;
            show(error instanceof Error ? error.message : "读取 mdtx 配置失败。", "error");
        } finally {
            loading = false;
        }
    }

    async function loadMemory() {
        if (!isDesktop || !plugin.mdtxConfig) return;
        try {
            const result = await plugin.mdtxConfig<{ stats?: MemoryStats }>("memory_stats", bridgePayload());
            memoryStats = result?.stats ?? null;
        } catch { memoryStats = null; }
    }

    async function loadGlossary() {
        if (!isDesktop || !plugin.mdtxConfig) return;
        glossaryBusy = true;
        try {
            const result = await plugin.mdtxConfig<{ entries?: Record<string, GlossaryEntry[]> }>(
                "glossary_list", bridgePayload({ lang: glossaryLang }));
            glossaryEntries = result?.entries?.[glossaryLang] ?? [];
        } catch (error) {
            glossaryEntries = [];
            show(error instanceof Error ? error.message : "读取术语表失败。", "error");
        } finally {
            glossaryBusy = false;
        }
    }

    onMount(async () => {
        isDesktop = typeof plugin.mdtxBridgeAvailable === "function" ? plugin.mdtxBridgeAvailable() : false;
        homeDir = typeof plugin.mdtxHomeDir === "function" ? plugin.mdtxHomeDir() : "";
        try {
            profile = normalizeLiteratureProfile(await plugin.loadData(LITERATURE_PROFILE_FILE));
            ready = true;
        } catch {
            show("无法读取文献翻译设置。", "error");
            return;
        }
        profile.translation.executable = profile.translation.executable || "mdtx";
        configPathDraft = profile.translation.configPath || (homeDir ? `${homeDir}/.mdtx/config.yaml` : "");
        snapshotProfile();
        if (isDesktop) {
            await Promise.all([loadConfig(), loadMemory(), loadGlossary()]);
        }
    });

    async function save() {
        if (saving) return;
        saving = true;
        try {
            const draft = normalizeLiteratureProfile({
                ...profile,
                translation: {
                    ...profile.translation,
                    mode: profile.translation.mode,
                    openAlongside: profile.translation.openAlongside,
                    syncScroll: profile.translation.syncScroll,
                    executable: profile.translation.executable,
                    configPath: configPathDraft.trim(),
                },
            });
            validateLiteratureProfile(draft);
            if (isDesktop && plugin.mdtxConfig && config) {
                const { api_key: _masked, ...providerRest } = config.provider ?? {};
                const patch = {
                    target_languages: config.target_languages,
                    provider: { ...providerRest, ...(apiKeyInput ? { api_key: apiKeyInput } : {}) },
                    pipeline: config.pipeline,
                    segmentation: config.segmentation,
                    input: config.input,
                    style: {
                        tone: config.style?.tone,
                        audience: config.style?.audience,
                        preserve_terms: lines(preserveTermsText),
                        instructions: lines(instructionsText),
                    },
                    output: config.output,
                    execution: config.execution,
                    memory: config.memory,
                };
                const result = await plugin.mdtxConfig<{ config?: MdtxConfig }>(
                    "patch", bridgePayload({ patch }));
                if (result?.config) applyConfig(result.config);
            }
            apiKeyInput = "";
            await plugin.saveData(LITERATURE_PROFILE_FILE, draft);
            profile = draft;
            configPathDraft = draft.translation.configPath;
            plugin.updateLiteratureProfile(draft);
            snapshotProfile();
            show("文献翻译设置已保存。");
        } catch (error) {
            show(error instanceof Error ? error.message : "保存失败。", "error");
        } finally {
            saving = false;
        }
    }

    async function testConnection() {
        if (!config || testing) return;
        testing = true;
        testResult = null;
        try {
            const result = await plugin.mdtxConfig<{ test?: { ok: boolean; latency_ms?: number | null; models?: string[]; model_warning?: string | null; error?: string | null } }>(
                "test", bridgePayload({
                    base_url: config.provider?.base_url,
                    api_key: apiKeyInput || undefined,
                    model: config.provider?.model,
                }));
            const test = result?.test;
            if (!test) {
                testResult = { ok: false, text: "未收到连接测试结果。" };
            } else if (test.ok) {
                if (test.models?.length) gatewayModels = test.models;
                const models = test.models?.length ? `，网关模型 ${test.models.length} 个` : "";
                testResult = test.model_warning
                    ? { ok: false, text: `连接成功（${test.latency_ms}ms${models}）；${test.model_warning}` }
                    : { ok: true, text: `连接成功（${test.latency_ms}ms${models}），模型 ${config.provider?.model} 可用` };
            } else {
                testResult = { ok: false, text: test.error ?? "连接失败" };
            }
        } catch (error) {
            testResult = { ok: false, text: error instanceof Error ? error.message : "连接失败" };
        } finally {
            testing = false;
        }
    }

    function clampBundleTokens() {
        if (!config?.segmentation) return;
        const seg = config.segmentation;
        if (Number(seg.min_bundle_tokens) > Number(seg.max_bundle_tokens)) {
            seg.min_bundle_tokens = seg.max_bundle_tokens;
            show("最小包 token 不能超过上限，已自动调整", "error");
        }
    }

    async function clearMemory() {
        if (!plugin.mdtxConfig) return;
        confirm("清空翻译记忆", "确定要清空全部翻译记忆吗？此操作不可恢复。", () => {
            void (async () => {
                try {
                    const result = await plugin.mdtxConfig<{ removed?: number }>("memory_clear", bridgePayload());
                    show(`已清除 ${result?.removed ?? 0} 条翻译记忆`);
                    await loadMemory();
                } catch (error) {
                    show(error instanceof Error ? error.message : "清空失败。", "error");
                }
            })();
        });
    }

    async function upsertGlossaryEntry() {
        const term = newTerm.trim();
        const rendering = newRendering.trim();
        if (!term || !rendering || !plugin.mdtxConfig) return;
        glossaryBusy = true;
        try {
            await plugin.mdtxConfig("glossary_upsert", bridgePayload({ lang: glossaryLang, term, rendering }));
            newTerm = "";
            newRendering = "";
            await loadGlossary();
        } catch (error) {
            show(error instanceof Error ? error.message : "添加术语失败。", "error");
        } finally {
            glossaryBusy = false;
        }
    }

    async function deleteGlossaryEntry(term: string) {
        if (!plugin.mdtxConfig) return;
        glossaryBusy = true;
        try {
            await plugin.mdtxConfig("glossary_delete", bridgePayload({ lang: glossaryLang, term }));
            await loadGlossary();
        } catch (error) {
            show(error instanceof Error ? error.message : "删除术语失败。", "error");
        } finally {
            glossaryBusy = false;
        }
    }

    async function setGlossaryStatus(entry: GlossaryEntry, status: string) {
        if (entry.status === status || !plugin.mdtxConfig) return;
        glossaryBusy = true;
        try {
            await plugin.mdtxConfig("glossary_status", bridgePayload({ lang: glossaryLang, term: entry.term, status }));
            await loadGlossary();
        } catch (error) {
            show(error instanceof Error ? error.message : "更新术语状态失败。", "error");
        } finally {
            glossaryBusy = false;
        }
    }

    function onKeydown(event: KeyboardEvent) {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            void save();
        }
    }
    onMount(() => window.addEventListener("keydown", onKeydown));
    onDestroy(() => window.removeEventListener("keydown", onKeydown));
</script>

<div class="translation-settings">
    <header>
        <strong>文献翻译</strong>
        {#if effectiveConfigPath}<span class="config-path">{effectiveConfigPath}</span>{/if}
        <button class="b3-button" disabled={saving || !ready} on:click={save}>{dirty ? "保存 *" : "保存"}</button>
    </header>
    {#if message}<p class="message {messageKind}">{message}</p>{/if}

    <fieldset disabled={!ready || saving}>
        <legend>运行环境</legend>
        <p class="hint">以下参数保存在文献工作流设置中；mdtx 配置文件须为 Python 安装版本的 mdtx。</p>
        <label>mdtx 程序<input type="text" bind:value={profile.translation.executable} placeholder="可执行文件绝对路径或命令名" /></label>
        <label>mdtx 配置文件<input type="text" bind:value={configPathDraft} placeholder="YAML 绝对路径" /></label>
        <label>翻译方式
            <select bind:value={profile.translation.mode}>
                <option value="manual">手动</option>
                <option value="automatic">批量入库后自动翻译</option>
            </select>
        </label>
        <label class="toggle"><input type="checkbox" bind:checked={profile.translation.openAlongside} />打开原文时自动开启双屏对照</label>
        <label class="toggle"><input type="checkbox" bind:checked={profile.translation.syncScroll} />同步滚动</label>
        {#if isDesktop}
            <div class="actions">
                <button class="b3-button b3-button--outline" type="button" disabled={loading || !profile.translation.executable} on:click={loadConfig}>{loading ? "正在读取" : "读取配置"}</button>
            </div>
        {/if}
    </fieldset>

    {#if !isDesktop}
        <p class="hint">mdtx 配置、术语表与翻译记忆的编辑需要思源桌面客户端；此处仅保存插件侧运行参数。</p>
    {/if}

    {#if isDesktop}
        <datalist id="mdtx-gateway-models">
            {#each gatewayModels as model}<option value={model}></option>{/each}
        </datalist>
        <div class="columns">
            <div class="column">
                <fieldset disabled={!ready || saving || !config}>
                    <legend>模型服务</legend>
                    {#if config}
                        <label>接口地址<input type="text" class="mono" bind:value={config.provider.base_url} /></label>
                        <label>模型名称<input type="text" class="mono" list="mdtx-gateway-models" bind:value={config.provider.model} /></label>
                        <label>API Key
                            <span class="key-row">
                                {#if showKey}
                                    <input type="text" autocomplete="off" bind:value={apiKeyInput}
                                        placeholder={hasStoredKey ? "已保存，留空保持不变" : "sk-..."} />
                                {:else}
                                    <input type="password" autocomplete="off" bind:value={apiKeyInput}
                                        placeholder={hasStoredKey ? "已保存，留空保持不变" : "sk-..."} />
                                {/if}
                                <button class="b3-button b3-button--outline" type="button" on:click={() => showKey = !showKey}>{showKey ? "隐藏" : "显示"}</button>
                            </span>
                        </label>
                        <div class="actions">
                            <button class="b3-button b3-button--outline" type="button" disabled={testing} on:click={testConnection}>{testing ? "正在测试" : "测试连接"}</button>
                        </div>
                        {#if testResult}<p class={testResult.ok ? "ok-text" : "error-text"}>{testResult.text}</p>{/if}
                        <label>密钥环境变量名<input class="mono" bind:value={config.provider.api_key_env} /></label>
                        <label>结构化输出
                            <select bind:value={config.provider.structured_outputs}>
                                <option value="auto">auto（推荐，自动适配）</option>
                                <option value="on">on（强制 json_schema）</option>
                                <option value="off">off（始终 json_object）</option>
                            </select>
                        </label>
                        <div class="grid-3">
                            <label>温度<input type="number" step="0.1" min="0" max="2" bind:value={config.provider.temperature} /></label>
                            <label>max_tokens<input type="number" bind:value={config.provider.max_tokens} /></label>
                            <label>重试次数<input type="number" min="0" max="10" bind:value={config.provider.max_retries} /></label>
                        </div>
                    {:else}
                        <p class="hint">{loading ? "正在读取 mdtx 配置…" : "尚未读取到 mdtx 配置。"}</p>
                    {/if}
                </fieldset>

                <fieldset disabled={!ready || saving || !config}>
                    <legend>模型路由</legend>
                    {#if config}
                        <p class="hint">留空则使用翻译模型（当前：{config.provider.model}）</p>
                        <label>审校模型<input class="mono" list="mdtx-gateway-models" bind:value={config.pipeline.reviewer_model} placeholder={config.provider.model} /></label>
                        <label>评分模型<input class="mono" list="mdtx-gateway-models" bind:value={config.pipeline.judge_model} placeholder={config.provider.model} /></label>
                        <label>快速模式模型<input class="mono" list="mdtx-gateway-models" bind:value={config.pipeline.fast_model} placeholder={config.provider.model} /></label>
                        <label>质量模式模型<input class="mono" list="mdtx-gateway-models" bind:value={config.pipeline.quality_model} placeholder={config.provider.model} /></label>
                        <label>文档摘要模型<input class="mono" list="mdtx-gateway-models" bind:value={config.pipeline.brief_model} placeholder={config.provider.model} /></label>
                    {:else}
                        <p class="hint">读取配置后可设置模型路由。</p>
                    {/if}
                </fieldset>

                <fieldset disabled={!ready || saving || !config}>
                    <legend>文风与读者</legend>
                    {#if config}
                        <label>文风<input bind:value={config.style.tone} /></label>
                        <label>读者对象<input bind:value={config.style.audience} /></label>
                        <label>保留术语（每行一个）<textarea rows="3" bind:value={preserveTermsText}></textarea></label>
                        <label>翻译指令（每行一条）<textarea rows="3" bind:value={instructionsText}></textarea></label>
                    {:else}
                        <p class="hint">读取配置后可设置文风与术语。</p>
                    {/if}
                </fieldset>
            </div>
            <div class="column">
                <fieldset disabled={!ready || saving || !config}>
                    <legend>翻译模式</legend>
                    {#if config?.pipeline}
                        <div class="mode-cards">
                            {#each MODES as mode}
                                <button type="button" class="mode-card" class:active={config.pipeline.mode === mode.value}
                                    aria-pressed={config.pipeline.mode === mode.value} on:click={() => config.pipeline.mode = mode.value}>
                                    <span class="mode-title"><span class="mode-icon">{mode.icon}</span>{mode.title}</span>
                                    <span class="mode-desc">{mode.desc}</span>
                                </button>
                            {/each}
                        </div>
                    {:else}
                        <p class="hint">读取配置后可选择翻译模式。</p>
                    {/if}
                </fieldset>

                <fieldset disabled={!ready || saving || !config}>
                    <legend>翻译质量保障</legend>
                    {#if config}
                        {#each QUALITY_TOGGLES as toggle}
                            {@const [section, key] = toggle.key.split(".")}
                            <label class="toggle"><input type="checkbox" checked={Boolean(config[section]?.[key])}
                                on:change={(event) => { config[section] = { ...(config[section] ?? {}), [key]: event.currentTarget.checked }; }} />
                                {toggle.label}{#if toggle.hint}<span class="hint-inline">{toggle.hint}</span>{/if}
                            </label>
                        {/each}
                    {:else}
                        <p class="hint">读取配置后可调整翻译质量保障。</p>
                    {/if}
                </fieldset>

                <fieldset disabled={!ready || saving || !config}>
                    <legend>性能与分包</legend>
                    {#if config}
                        <div class="grid-3">
                            <label>并行数<input type="number" min="1" max="32" bind:value={config.execution.max_parallel_translations} /></label>
                            <label>包 token 上限<input type="number" min="200" bind:value={config.segmentation.max_bundle_tokens} on:change={clampBundleTokens} /></label>
                            <label>最小包 token<input type="number" min="0" bind:value={config.segmentation.min_bundle_tokens} on:change={clampBundleTokens} /></label>
                            <label>审校轮数<input type="number" min="1" max="5" bind:value={config.pipeline.review_max_rounds} /></label>
                            <label>记忆复用范围
                                <select bind:value={config.memory.scope}>
                                    <option value="document">同一文档（推荐）</option>
                                    <option value="global">跨文档</option>
                                </select>
                            </label>
                        </div>
                    {:else}
                        <p class="hint">读取配置后可调整性能与分包。</p>
                    {/if}
                </fieldset>

                <fieldset disabled={!ready || saving}>
                    <legend>翻译记忆</legend>
                    <p class="hint">相同的段落直接复用历史译文，节省时间与费用。</p>
                    <div class="stats">
                        <div class="stat"><span class="stat-label">记忆条目</span><strong>{memoryStats?.entries ?? "—"}</strong></div>
                        <div class="stat"><span class="stat-label">命中次数</span><strong>{memoryStats?.hits ?? 0}</strong></div>
                        <button class="b3-button b3-button--outline" type="button" disabled={!memoryStats?.entries} on:click={clearMemory}>清空记忆</button>
                    </div>
                </fieldset>

                <fieldset disabled={!ready || saving}>
                    <legend>术语表</legend>
                    <p class="hint">为术语指定统一译法，全文保持一致；手动条目优先于自动生成。</p>
                    <div class="glossary-add">
                        <label>目标语言<input class="mono" bind:value={glossaryLang} /></label>
                        <label>术语<input class="mono" bind:value={newTerm} placeholder="workspace" /></label>
                        <label>译法<input bind:value={newRendering} placeholder="工作区" on:keydown={(event) => { if (event.key === "Enter") void upsertGlossaryEntry(); }} /></label>
                        <button class="b3-button" type="button" disabled={glossaryBusy || !newTerm.trim() || !newRendering.trim()} on:click={upsertGlossaryEntry}>添加</button>
                    </div>
                    <label>搜索术语或译法<input type="text" bind:value={glossaryQuery} placeholder="搜索术语或译法…" /></label>
                    {#if glossaryEntries.length}
                        <table class="glossary-table">
                            <thead><tr><th>词</th><th>译法</th><th>来源</th><th>出现篇数</th><th>状态</th><th></th></tr></thead>
                            <tbody>
                                {#each filteredGlossary as entry (entry.term)}
                                    <tr>
                                        <td class="mono">{entry.term}</td>
                                        <td>{entry.rendering}</td>
                                        <td><span class="badge">{entry.origin === "user" ? "手动" : "自动"}</span></td>
                                        <td class="center">{entry.doc_count}</td>
                                        <td>
                                            <select disabled={glossaryBusy} value={entry.status}
                                                on:change={(event) => void setGlossaryStatus(entry, event.currentTarget.value)}>
                                                {#each GLOSSARY_STATUSES as status}<option value={status.value}>{status.label}</option>{/each}
                                            </select>
                                        </td>
                                        <td class="right"><button class="b3-button b3-button--outline danger" type="button" disabled={glossaryBusy} on:click={() => deleteGlossaryEntry(entry.term)}>删除</button></td>
                                    </tr>
                                {/each}
                                {#if !filteredGlossary.length}<tr><td colspan="6" class="center muted">没有匹配的术语</td></tr>{/if}
                            </tbody>
                        </table>
                        <p class="hint">自动术语：在 3 篇不同文档中出现后为「待生效」，第 4 篇起自动「生效」并注入翻译提示词；「排除」则永不注入。</p>
                    {:else}
                        <p class="hint">还没有固定译名，直接在上方添加即可。</p>
                    {/if}
                </fieldset>
            </div>
        </div>
    {/if}
</div>

<style>
    .translation-settings{box-sizing:border-box;height:100%;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:12px;min-width:0;color:var(--b3-theme-on-background)}
    header{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    header strong{font-size:15px}
    .config-path{font-family:monospace;font-size:11px;color:var(--b3-theme-on-surface);overflow-wrap:anywhere}
    header .b3-button{margin-left:auto}
    p{margin:0}
    fieldset{display:grid;gap:9px;border:1px solid var(--b3-border-color);border-radius:6px;padding:12px}
    legend{font-weight:600;padding:0 5px}
    label{display:grid;gap:4px;font-size:13px}
    input:not([type=checkbox]):not([type=radio]),select,textarea{box-sizing:border-box;width:100%;padding:6px;background:var(--b3-theme-surface);color:var(--b3-theme-on-surface);border:1px solid var(--b3-border-color);border-radius:4px}
    textarea{resize:vertical;font-family:inherit}
    .mono{font-family:monospace;font-size:12px}
    .toggle{display:flex;align-items:center;gap:6px}
    .hint{font-size:12px;color:var(--b3-theme-on-surface)}
    .hint-inline{font-size:11px;color:var(--b3-theme-on-surface);margin-left:6px}
    .message{padding:8px 10px;border-radius:6px;font-size:13px}
    .message.success{background:rgba(60,160,90,.12);color:var(--b3-theme-success)}
    .message.error,.error-text{color:var(--b3-theme-error)}
    .ok-text{color:var(--b3-theme-success)}
    .actions{display:flex;gap:8px;flex-wrap:wrap}
    .columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start}
    .column{display:flex;flex-direction:column;gap:12px;min-width:0}
    .grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
    .mode-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    .mode-card{display:grid;gap:4px;text-align:left;padding:10px;border:1px solid var(--b3-border-color);border-radius:6px;background:var(--b3-theme-surface);color:var(--b3-theme-on-background);cursor:pointer}
    .mode-card.active{border-color:var(--b3-theme-primary);background:rgba(0,122,255,.06)}
    .mode-title{font-weight:600;display:flex;gap:6px;align-items:center}
    .mode-desc{font-size:11px;color:var(--b3-theme-on-surface)}
    .key-row{display:flex;gap:6px}
    .key-row input{flex:1}
    .stats{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
    .stat{display:grid;gap:2px;min-width:64px}
    .stat-label{font-size:11px;color:var(--b3-theme-on-surface)}
    .glossary-add{display:grid;grid-template-columns:90px 1fr 1fr auto;gap:8px;align-items:end}
    .glossary-table{width:100%;border-collapse:collapse;font-size:12px}
    .glossary-table th,.glossary-table td{border-bottom:1px solid var(--b3-border-color);padding:5px 6px;text-align:left;vertical-align:middle}
    .glossary-table th{color:var(--b3-theme-on-surface);font-weight:600}
    .glossary-table select{padding:3px;font-size:12px}
    .center{text-align:center}
    .right{text-align:right}
    .muted{color:var(--b3-theme-on-surface)}
    .badge{display:inline-block;padding:1px 7px;border-radius:8px;font-size:11px;background:var(--b3-list-hover);color:var(--b3-theme-on-background)}
    .danger{color:var(--b3-theme-error)}
    @media(max-width:720px){.columns{grid-template-columns:1fr}.grid-3,.mode-cards,.glossary-add{grid-template-columns:1fr 1fr}.glossary-add{grid-template-columns:1fr}}
</style>

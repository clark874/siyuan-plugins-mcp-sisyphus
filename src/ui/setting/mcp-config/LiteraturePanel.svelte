<script lang="ts">
    import { onMount } from "svelte";
    import { confirm } from "siyuan";
    import {
        LITERATURE_PROFILE_FILE, defaultLiteratureProfile, normalizeLiteratureProfile, validateLiteratureProfile, type LiteratureProfile,
    } from "../../literature/settings";

    export let plugin: {
        loadData: (name: string) => Promise<unknown>;
        saveData: (name: string, value: unknown) => Promise<unknown>;
        setLiteratureCredentials: (profile: LiteratureProfile, zoteroKey: string) => void;
        clearLiteratureCredentials: () => void;
        checkLiteratureRuntime: (profile: LiteratureProfile) => Promise<Record<string, string>>;
        updateLiteratureProfile: (profile: LiteratureProfile) => void;
        runLiteratureBatch: (profile: LiteratureProfile, manifest: string, receipt: string, execute: boolean) => Promise<unknown>;
    };
    export let notebooks: { id: string; name: string; closed?: boolean }[] = [];
    let profile = defaultLiteratureProfile();
    let ready = false;
    let saving = false;
    let message = "";
    let failed = false;
    let manifest = "";
    let receipt = "";
    let result = "";
    let batchRunning = false;
    let runtimeChecking = false;
    let zoteroKey = "";

    onMount(async () => {
        try {
            profile = normalizeLiteratureProfile(await plugin.loadData(LITERATURE_PROFILE_FILE));
            ready = true;
        } catch {
            failed = true;
            message = "无法读取文献工作流设置。";
        }
    });

    async function save() {
        saving = true;
        failed = false;
        try {
            const normalized = normalizeLiteratureProfile(profile);
            validateLiteratureProfile(normalized);
            await plugin.saveData(LITERATURE_PROFILE_FILE, normalized);
            profile = normalized;
            plugin.updateLiteratureProfile(normalized);
            message = "文献工作流设置已保存。";
        } catch (error) {
            failed = true;
            message = error instanceof Error ? error.message : "保存失败。";
        } finally {
            saving = false;
        }
    }

    function unlock() {
        plugin.setLiteratureCredentials(normalizeLiteratureProfile(profile), zoteroKey.trim());
        zoteroKey = "";
    }

    function unlockSession() {
        try {
            unlock();
            result = "已为当前思源会话设置密钥。关闭应用后需重新输入，或由本机环境提供。";
        } catch (error) { result = error instanceof Error ? error.message : "密钥设置失败。"; }
    }

    async function checkRuntime() {
        runtimeChecking = true;
        try {
            unlock();
            const report = await plugin.checkLiteratureRuntime(normalizeLiteratureProfile(profile));
            result = ["Zotero｜" + report.zotero, "NotebookLM｜" + report.notebooklm, "翻译｜" + report.translation].join("\n");
        } catch (error) {
            result = error instanceof Error ? error.message : "本机环境检查未完成。";
        } finally {
            runtimeChecking = false;
        }
    }

    async function runBatch(execute: boolean) {
        if (batchRunning) return;
        batchRunning = true;
        result = "";
        try {
            unlock();
            const current = normalizeLiteratureProfile(profile);
            validateLiteratureProfile(current);
            result = JSON.stringify(await plugin.runLiteratureBatch(current, manifest.trim(), receipt.trim(), execute), null, 2);
        } catch (error) {
            result = error instanceof Error ? error.message : "批量任务未完成。";
        } finally {
            batchRunning = false;
        }
    }

    function confirmBatch() {
        confirm("执行文献入库", "将按当前设置写入思源和 Zotero。已启用的 NotebookLM 上传和自动翻译也会执行。请先运行预检并核对目标。", () => void runBatch(true));
    }
</script>

<form on:submit|preventDefault={save}>
    <h2>文献工作流</h2>
    <fieldset disabled={!ready || saving}>
        <legend>思源文献库</legend>
        <label>所属项目（用于 AV 目录筛选）<input type="text" bind:value={profile.projectName} maxlength="128" /></label>
        <label>全文笔记本
            <select bind:value={profile.siyuan.notebook}>
                <option value="">请选择</option>
                {#if profile.siyuan.notebook && !notebooks.some(item => item.id === profile.siyuan.notebook && !item.closed)}
                    <option value={profile.siyuan.notebook}>{profile.siyuan.notebook}（当前不可选）</option>
                {/if}
                {#each notebooks.filter(item => !item.closed) as notebook (notebook.id)}
                    <option value={notebook.id}>{notebook.name}</option>
                {/each}
            </select>
        </label>
        <label>全文父文档 ID（留空使用笔记本根目录）<input type="text" bind:value={profile.siyuan.parentID} /></label>
        <label>AV 数据库 ID<input type="text" bind:value={profile.siyuan.avID} /></label>
    </fieldset>
    <fieldset disabled={!ready || saving}>
        <legend>Zotero</legend>
        <label>官方文库地址<input type="url" placeholder="https://api.zotero.org/users/123456" bind:value={profile.zotero.baseUrl} /></label>
        <label>密钥环境变量名<input type="text" bind:value={profile.zotero.apiKeyEnv} /></label>
        <p>运行批量登记的进程从本机环境读取密钥。设置文件只保存变量名。</p>
    </fieldset>
    <fieldset disabled={!ready || saving}>
        <legend>NotebookLM</legend>
        <label class="toggle"><input type="checkbox" bind:checked={profile.notebooklm.enabled} /> 随入库增量上传</label>
        <label>本机登录配置名<input type="text" bind:value={profile.notebooklm.profile} /></label>
        <label>笔记本名称<input type="text" bind:value={profile.notebooklm.notebookTitle} /></label>
        <label>已有笔记本 ID（留空允许首次创建）<input type="text" bind:value={profile.notebooklm.notebookId} /></label>
        <label>已安装 NotebookLM 客户端的 Python<input type="text" bind:value={profile.notebooklm.python} /></label>
    </fieldset>
    <button class="b3-button" type="submit" disabled={!ready || saving}>{saving ? "正在保存" : "保存文献设置"}</button>
    {#if message}<p class:error={failed} role="status">{message}</p>{/if}
    <fieldset disabled={!ready || runtimeChecking || batchRunning}>
        <legend>本机运行凭据</legend>
        <label>Zotero 密钥<input type="password" autocomplete="off" bind:value={zoteroKey} /></label>
        <p>可由本机环境提供。此处输入的密钥仅留在当前思源进程内。</p>
        <div class="actions">
            <button class="b3-button b3-button--outline" type="button" disabled={!zoteroKey} on:click={unlockSession}>用于本次会话</button>
            <button class="b3-button b3-button--outline" type="button" on:click={checkRuntime}>{runtimeChecking ? "正在检查" : "检查本机环境"}</button>
            <button class="b3-button b3-button--outline" type="button" on:click={() => { plugin.clearLiteratureCredentials(); zoteroKey = ""; result = "已清除本次会话临时密钥。"; }}>清除临时密钥</button>
        </div>
    </fieldset>
    <fieldset disabled={!ready || batchRunning || runtimeChecking}>
        <legend>运行批量入库</legend>
        <label>已准备的批次清单绝对路径<input type="text" bind:value={manifest} /></label>
        <label>项目收据绝对路径<input type="text" bind:value={receipt} /></label>
        <div class="actions">
            <button class="b3-button b3-button--outline" type="button" disabled={!manifest.trim() || !receipt.trim()} on:click={() => runBatch(false)}>只读预检</button>
            <button class="b3-button" type="button" disabled={!manifest.trim() || !receipt.trim()} on:click={confirmBatch}>执行入库</button>
        </div>
    </fieldset>
    {#if batchRunning}<p role="status">批量任务正在运行。自动翻译时耗取决于论文长度。</p>{/if}
    {#if result}<pre>{result}</pre>{/if}
</form>

<style>
    form{display:grid;gap:14px;width:100%;min-width:0;box-sizing:border-box}
    h2,p{margin:0}
    fieldset{display:grid;gap:9px;border:1px solid var(--b3-border-color);border-radius:6px;padding:12px}
    legend{font-weight:600;padding:0 5px}
    label{display:grid;gap:4px}
    input:not([type=checkbox]),select{box-sizing:border-box;width:100%;padding:6px;background:var(--b3-theme-surface);color:var(--b3-theme-on-surface);border:1px solid var(--b3-border-color);border-radius:4px}
    .toggle{display:flex;align-items:center}
    fieldset p{color:var(--b3-theme-on-surface)}
    button{justify-self:start}
    .actions{display:flex;gap:8px}
    pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:280px;overflow:auto}
    .error{color:var(--b3-theme-error)}
</style>

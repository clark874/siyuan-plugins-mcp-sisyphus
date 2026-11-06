<script lang="ts">
    import { normalizeLiteratureProfile, validateLiteratureProfile, LITERATURE_PROFILE_FILE, type LiteratureProfile } from "./settings";
    import type { TranslationProgress } from "./desktop-runner";
    export let plugin: any;
    export let profile: LiteratureProfile;
    export let documentId = "";
    export let documentTitle = "";
    export let status = "请选择论文原文。";
    export let running = false;
    export let translationId = "";
    export let progress: TranslationProgress | null = null;
    let settingsOpen = false;
    let draft = { ...profile.translation };
    let key = "";
    let notice = "";
    let saving = false;
    $: if (!settingsOpen) draft = { ...profile.translation };

    async function save() {
        saving = true;
        try {
            const next = normalizeLiteratureProfile({ ...profile, translation: draft });
            validateLiteratureProfile(next);
            await plugin.saveData(LITERATURE_PROFILE_FILE, next);
            plugin.setLiteratureCredentials(next, "", key.trim());
            key = "";
            plugin.updateLiteratureProfile(next);
            settingsOpen = false;
            notice = "翻译设置已保存。";
        } catch (error) { notice = error.message; }
        finally { saving = false; }
    }
</script>

<div class="translation-panel">
    <header><strong>文献翻译</strong><button class="b3-button b3-button--outline" on:click={() => settingsOpen = !settingsOpen}>{settingsOpen ? "收起设置" : "翻译设置"}</button></header>
    <div class="document"><strong>{documentTitle || "尚未打开文档"}</strong></div>
    <p role="status">{status}</p>
    <div class="actions">
        <button class="b3-button" disabled={!documentId || running} on:click={() => plugin.translateCurrentLiterature(documentId)}>{running ? "正在翻译…" : translationId ? "更新中文译文" : "翻译全文"}</button>
        <button class="b3-button b3-button--outline" disabled={!documentId || !translationId} on:click={() => plugin.openLiteratureComparison(documentId)}>开启双屏对照</button>
    </div>
    {#if progress}
        <div class="translation-progress" aria-live="polite">
            <span>{progress.stage}{progress.total ? `：${progress.completed}/${progress.total} 包` : ""}</span>
            {#if progress.done}<progress max="1" value="1" aria-label="翻译已完成"></progress>
            {:else if progress.total}<progress max={progress.total} value={progress.completed} aria-label="翻译分包进度"></progress>
            {:else if running}<progress aria-label="翻译准备或核验进度"></progress>{/if}
        </div>
    {/if}
    <p class="hint">参考文献和书目元信息按入库标记保留原文。译文继承内容角色。点击任一侧正文块，对应块会定位并高亮。</p>
    {#if settingsOpen || !profile.translation.configPath && !translationId}
        <form on:submit|preventDefault={save}>
            <h3>翻译与阅读</h3>
            <label>mdtx 程序<input bind:value={draft.executable} placeholder="可执行文件绝对路径" /></label>
            <label>mdtx 配置文件<input bind:value={draft.configPath} placeholder="YAML 绝对路径" /></label>
            <label>模型密钥环境变量<input bind:value={draft.apiKeyEnv} /></label>
            <label>本次会话模型密钥<input type="password" autocomplete="off" bind:value={key} /></label>
            <label>翻译方式<select bind:value={draft.mode}><option value="manual">按篇手动翻译</option><option value="automatic">批量入库后自动翻译</option></select></label>
            <label class="toggle"><input type="checkbox" bind:checked={draft.openAlongside} />打开原文时显示已有译文</label>
            <label class="toggle"><input type="checkbox" bind:checked={draft.syncScroll} />同步滚动</label>
            <button class="b3-button" disabled={saving}>保存翻译设置</button>
        </form>
    {/if}
    {#if notice}<p role="status">{notice}</p>{/if}
    <button class="b3-button b3-button--outline" on:click={() => plugin.openSetting()}>文献库与服务设置</button>
    <section class="translation-reading-editor" aria-label="中文译文"></section>
</div>

<style>
    .translation-panel{box-sizing:border-box;height:100%;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:12px;min-width:0;color:var(--b3-theme-on-background)}
    header,.actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    header strong{flex:1}
    p,h3{margin:0}
    .document{overflow-wrap:anywhere}
    .hint{font-size:12px;color:var(--b3-theme-on-surface)}
    .translation-progress{display:flex;flex-direction:column;gap:6px;font-size:13px}
    progress{width:100%;height:12px;accent-color:var(--b3-theme-primary)}
    .translation-reading-editor{flex:1;min-height:280px;border-top:1px solid var(--b3-border-color)}
    form,label{display:flex;flex-direction:column;gap:6px}
    form{gap:10px;border-top:1px solid var(--b3-border-color);padding-top:12px}
    input:not([type=checkbox]),select{box-sizing:border-box;width:100%;background:var(--b3-theme-surface);color:var(--b3-theme-on-surface);border:1px solid var(--b3-border-color);border-radius:4px;padding:7px}
    .toggle{flex-direction:row;align-items:center}
    button{flex-shrink:0}
</style>

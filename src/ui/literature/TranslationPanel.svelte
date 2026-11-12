<script lang="ts">
    import type { LiteratureProfile } from "./settings";
    import type { TranslationProgress } from "./desktop-runner";
    export let plugin: any;
    export let profile: LiteratureProfile;
    export let documentId = "";
    export let documentTitle = "";
    export let status = "请选择论文原文。";
    export let running = false;
    export let inspecting = false;
    export let cancelling = false;
    export let cancellable = false;
    export let translationId = "";
    export let progress: TranslationProgress | null = null;
    export let pairing = false;
    export let comparisonOpen = false;
    $: configured = Boolean(profile.translation.executable && profile.translation.configPath);
</script>

<div class="translation-panel">
    <header><strong>文献翻译</strong><button class="b3-button b3-button--outline" on:click={() => plugin.openSetting("literatureTranslation")}>翻译设置</button></header>
    <div class="document"><strong>{documentTitle || "尚未打开文档"}</strong></div>
    <p role="status">{status}</p>
    <div class="actions">
        <button class="b3-button" disabled={!documentId || running || inspecting} on:click={() => plugin.translateCurrentLiterature(documentId)}>{inspecting ? "正在检查已有译文…" : running ? "正在翻译…" : translationId ? "检查／更新译文" : "检查并翻译全文"}</button>
        {#if running}
            <button class="b3-button b3-button--outline" disabled={!cancellable || cancelling} on:click={() => plugin.cancelLiteratureTranslation(documentId)}>{cancelling ? "正在取消…" : cancellable ? "取消翻译" : "正在归档，请稍候"}</button>
        {/if}
        {#if comparisonOpen}
            <button class="b3-button b3-button--outline" on:click={() => plugin.closeLiteratureComparison(documentId)}>关闭双屏对照</button>
        {:else}
            <button class="b3-button b3-button--outline" disabled={!documentId || !translationId} on:click={() => plugin.openLiteratureComparison(documentId)}>开启双屏对照</button>
        {/if}
    </div>
    {#if progress}
        <div class="translation-progress" aria-live="polite">
            <span>{progress.stage}{progress.total ? `：${progress.completed}/${progress.total} ${progress.unit ?? "包"}` : ""}</span>
            {#if progress.done}<progress max="1" value="1" aria-label="翻译已完成"></progress>
            {:else if progress.total}<progress max={progress.total} value={progress.completed} aria-label={progress.unit === "块" ? "逐块配对进度" : "翻译分包进度"}></progress>
            {:else if running || pairing}<progress aria-label={pairing ? "逐块配对进度" : "翻译准备或核验进度"}></progress>{/if}
        </div>
    {/if}
    <p class="hint">原文在左、译文在右并排；点击任一侧正文块，另一侧对应块定位并高亮。</p>
    {#if !configured}
        <p class="hint">尚未配置 mdtx 翻译程序与配置文件。</p>
        <button class="b3-button b3-button--outline" on:click={() => plugin.openSetting("literatureTranslation")}>前往翻译设置</button>
    {/if}
    <button class="b3-button b3-button--outline" on:click={() => plugin.openSetting()}>文献库与服务设置</button>
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
    button{flex-shrink:0;justify-self:start}
</style>

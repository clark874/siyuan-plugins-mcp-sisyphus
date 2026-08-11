<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import { fetchPost } from "siyuan";
    import {
        buildRecentDocumentMetadataSql,
        formatRecentDocumentTime,
        mergeRecentDocumentMetadata,
        recentDocumentMatches,
        type RecentDocumentMetadataRow,
        type RecentDocumentRecord,
        type RecentDocumentView,
    } from "./recent-documents";

    export let i18n: Record<string, string> = {};
    export let refreshVersion = 0;
    export let onOpenDocument: (id: string) => void = () => {};

    let documents: RecentDocumentView[] = [];
    let query = "";
    let loading = false;
    let error = "";
    let mounted = false;
    let panelVisible = false;
    let loadedRefreshVersion = -1;
    let loadVersion = 0;
    let shellElement: HTMLElement;
    let visibilityObserver: MutationObserver | undefined;

    $: filteredDocuments = documents.filter((document) => recentDocumentMatches(document, query));
    $: if (mounted && panelVisible && refreshVersion !== loadedRefreshVersion && !loading) {
        void loadDocuments();
    }

    onMount(async () => {
        mounted = true;
        observeVisibility();
        await tick();
        updateVisibility();
        if (panelVisible) await loadDocuments();
    });

    onDestroy(() => {
        loadVersion += 1;
        visibilityObserver?.disconnect();
    });

    function t(key: string, fallback: string): string {
        return i18n?.[key] ?? fallback;
    }

    function post<T>(endpoint: string, data: Record<string, unknown> = {}): Promise<T> {
        return new Promise((resolve, reject) => {
            fetchPost(endpoint, data, (response: { code: number; msg?: string; data: T }) => {
                if (response?.code === 0) resolve(response.data);
                else reject(new Error(response?.msg || `SiYuan API error from ${endpoint}`));
            });
        });
    }

    function observeVisibility() {
        if (typeof MutationObserver === "undefined") return;
        visibilityObserver = new MutationObserver(() => updateVisibility());
        let element: HTMLElement | null = shellElement;
        while (element) {
            visibilityObserver.observe(element, {
                attributes: true,
                attributeFilter: ["class", "style", "hidden", "aria-hidden"],
            });
            element = element.parentElement;
        }
    }

    function updateVisibility() {
        panelVisible = isVisible(shellElement);
        if (panelVisible && refreshVersion !== loadedRefreshVersion && !loading) {
            void loadDocuments();
        }
    }

    function isVisible(element: HTMLElement | undefined): boolean {
        if (!element?.getClientRects().length) return false;
        let current: HTMLElement | null = element;
        while (current) {
            if (current.hidden || current.getAttribute("aria-hidden") === "true") return false;
            if (typeof getComputedStyle === "function") {
                const style = getComputedStyle(current);
                if (style.display === "none" || style.visibility === "hidden") return false;
            }
            current = current.parentElement;
        }
        return true;
    }

    async function loadDocuments(force = false) {
        if (loading && !force) return;
        const requestVersion = ++loadVersion;
        loading = true;
        error = "";
        try {
            const records = await post<RecentDocumentRecord[]>("/api/storage/getRecentDocs", { sortBy: "updated" });
            let rows: RecentDocumentMetadataRow[] = [];
            try {
                rows = await post<RecentDocumentMetadataRow[]>("/api/query/sql", {
                    stmt: buildRecentDocumentMetadataSql(records.map((item) => item.rootID)),
                });
            } catch {
                rows = [];
            }
            if (requestVersion !== loadVersion) return;
            documents = mergeRecentDocumentMetadata(Array.isArray(records) ? records : [], Array.isArray(rows) ? rows : []);
            loadedRefreshVersion = refreshVersion;
        } catch (err) {
            if (requestVersion !== loadVersion) return;
            error = err instanceof Error ? err.message : String(err);
        } finally {
            if (requestVersion === loadVersion) loading = false;
        }
    }

    function openDocument(document: RecentDocumentView) {
        onOpenDocument(document.id);
    }

    function iconText(icon: string): string {
        if (!icon) return "📄";
        if (!/^[0-9a-f-]+$/i.test(icon)) return "📄";
        try {
            return String.fromCodePoint(...icon.split("-").map((part) => Number.parseInt(part, 16)));
        } catch {
            return "📄";
        }
    }

    function formattedTime(updated: string): string {
        return formatRecentDocumentTime(updated, document.documentElement.lang || undefined);
    }
</script>

<section class="recent-documents" bind:this={shellElement}>
    <header class="recent-documents__header">
        <div>
            <strong>{t("recent_documents_panel_title", "最近修改")}</strong>
            <small>{t("recent_documents_panel_desc", "按文档实际更新时间降序")}</small>
        </div>
        <button
            class="b3-button b3-button--outline recent-documents__refresh"
            type="button"
            aria-label={t("recent_documents_action_refresh", "刷新")}
            title={t("recent_documents_action_refresh", "刷新")}
            disabled={loading}
            on:click={() => loadDocuments(true)}
        >↻</button>
    </header>

    <div class="recent-documents__search">
        <input
            class="b3-text-field"
            type="search"
            bind:value={query}
            placeholder={t("recent_documents_search_placeholder", "搜索最近修改的文档")}
        />
    </div>

    {#if error}
        <div class="recent-documents__state recent-documents__state--error">
            <strong>{t("recent_documents_error", "无法读取最近修改文档")}</strong>
            <small>{error}</small>
        </div>
    {:else if loading && documents.length === 0}
        <div class="recent-documents__state">{t("recent_documents_loading", "正在加载最近修改文档...")}</div>
    {:else if filteredDocuments.length === 0}
        <div class="recent-documents__state">
            {query
                ? t("recent_documents_empty_search", "没有匹配的最近修改文档")
                : t("recent_documents_empty", "暂无最近修改文档")}
        </div>
    {:else}
        <ul class="recent-documents__list">
            {#each filteredDocuments as document (document.id)}
                <li>
                    <button class="recent-document" type="button" on:click={() => openDocument(document)}>
                        <span class="recent-document__icon" aria-hidden="true">{iconText(document.icon)}</span>
                        <span class="recent-document__body">
                            <strong>{document.title}</strong>
                            {#if document.parentPath}<small class="recent-document__path">{document.parentPath}</small>{/if}
                        </span>
                        {#if formattedTime(document.updated)}
                            <time class="recent-document__time">{formattedTime(document.updated)}</time>
                        {/if}
                    </button>
                </li>
            {/each}
        </ul>
    {/if}
</section>

<style>
    .recent-documents {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        color: var(--b3-theme-on-background);
        background: var(--b3-theme-background);
    }

    .recent-documents__header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 12px 8px;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .recent-documents__header > div {
        display: flex;
        flex: 1;
        min-width: 0;
        flex-direction: column;
        gap: 2px;
    }

    .recent-documents__header small,
    .recent-document__path,
    .recent-document__time {
        color: var(--b3-theme-on-surface);
    }

    .recent-documents__refresh {
        min-width: 30px;
        padding: 4px 8px;
        font-size: 17px;
    }

    .recent-documents__search {
        padding: 8px 12px;
    }

    .recent-documents__search input {
        width: 100%;
    }

    .recent-documents__list {
        flex: 1;
        min-height: 0;
        margin: 0;
        padding: 0 6px 10px;
        overflow: auto;
        list-style: none;
    }

    .recent-document {
        display: grid;
        width: 100%;
        grid-template-columns: 28px minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        padding: 8px 7px;
        border: 0;
        border-radius: var(--b3-border-radius);
        color: inherit;
        background: transparent;
        text-align: left;
        cursor: pointer;
    }

    .recent-document:hover,
    .recent-document:focus-visible {
        background: var(--b3-list-hover);
        outline: none;
    }

    .recent-document__icon {
        overflow: hidden;
        font-size: 17px;
        text-align: center;
    }

    .recent-document__body {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 2px;
    }

    .recent-document__body strong,
    .recent-document__path {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .recent-document__body strong {
        font-weight: 500;
    }

    .recent-document__path,
    .recent-document__time {
        font-size: 11px;
    }

    .recent-document__time {
        white-space: nowrap;
    }

    .recent-documents__state {
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 6px;
        padding: 24px 16px;
        color: var(--b3-theme-on-surface);
        text-align: center;
    }

    .recent-documents__state--error strong {
        color: var(--b3-theme-error);
    }

    .recent-documents__state small {
        overflow-wrap: anywhere;
    }
</style>

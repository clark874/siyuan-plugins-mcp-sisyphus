<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import { fetchPost } from "siyuan";
    import { resolveRecentDocumentHistoryDiff } from "@/shared/recent-history-service";
    import RecentDocumentCard from "./RecentDocumentCard.svelte";
    import {
        buildRecentDocumentsPageSql,
        collectRecentDocumentGroupKeys,
        filterRecentDocuments,
        groupRecentDocuments,
        mapRecentDocumentRows,
        mergeCollapsedGroupState,
        recentDocumentMatches,
        type RecentDocumentDiffStatus,
        type RecentDocumentDiffSummary,
        type RecentDocumentFilter,
        type RecentDocumentGranularity,
        type RecentDocumentGroup,
        type RecentDocumentMetadataRow,
        type RecentDocumentView,
    } from "./recent-documents";

    const PAGE_SIZE = 100;
    const AUTO_PAGE_LIMIT = 2;
    const SUMMARY_CONCURRENCY = 2;

    export let i18n: Record<string, string> = {};
    export let refreshVersion = 0;
    export let comparisonSummaries: Record<string, RecentDocumentDiffSummary> = {};
    export let activeDocumentId = "";
    export let onOpenDocument: (document: RecentDocumentView) => void = () => {};
    export let onComparisonSummary: (documentId: string, summary: RecentDocumentDiffSummary) => void = () => {};

    let documents: RecentDocumentView[] = [];
    let query = "";
    let filter: RecentDocumentFilter = "all";
    let granularity: RecentDocumentGranularity = "day";
    let loading = false;
    let error = "";
    let mounted = false;
    let panelVisible = false;
    let loadedRefreshVersion = -1;
    let loadVersion = 0;
    let currentPage = 0;
    let hasMore = true;
    let shellElement: HTMLElement;
    let listElement: HTMLElement;
    let loadMoreElement: HTMLElement;
    let visibilityObserver: MutationObserver | undefined;
    let paginationObserver: IntersectionObserver | undefined;
    let collapsedGroups = new Set<string>();
    let knownGroupKeys = new Set<string>();
    let knownGroupSignature = "";
    let summaryQueue: RecentDocumentView[] = [];
    let queuedSummaryKeys = new Set<string>();
    let activeSummaryCount = 0;

    $: matchingDocuments = documents.filter((item) => recentDocumentMatches(item, query));
    $: filteredDocuments = filterRecentDocuments(matchingDocuments, comparisonSummaries, filter);
    $: groupedDocuments = groupRecentDocuments(filteredDocuments, {
        locale: typeof document !== "undefined" ? document.documentElement.lang || undefined : undefined,
        todayLabel: t("recent_documents_group_today", "今天"),
        yesterdayLabel: t("recent_documents_group_yesterday", "昨天"),
        granularity,
    });
    $: syncCollapsedGroups(groupedDocuments);
    $: pendingFilterAnalysis = filter !== "all" && matchingDocuments.some((item) => !validSummary(item));
    $: if (mounted && filter !== "all") requestSummaries(matchingDocuments);
    $: if (mounted && panelVisible && refreshVersion !== loadedRefreshVersion && !loading) {
        void refreshDocuments();
    }

    onMount(async () => {
        mounted = true;
        observeVisibility();
        observePagination();
        await tick();
        updateVisibility();
    });

    onDestroy(() => {
        loadVersion += 1;
        visibilityObserver?.disconnect();
        paginationObserver?.disconnect();
        summaryQueue = [];
        queuedSummaryKeys.clear();
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

    function observePagination() {
        if (paginationObserver || typeof IntersectionObserver === "undefined" || !loadMoreElement) return;
        paginationObserver = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting) && panelVisible && hasMore && !loading && currentPage < AUTO_PAGE_LIMIT) {
                void loadNextPage();
            }
        }, { root: listElement, rootMargin: "240px 0px" });
        paginationObserver.observe(loadMoreElement);
    }

    function updateVisibility() {
        panelVisible = isVisible(shellElement);
        if (panelVisible && refreshVersion !== loadedRefreshVersion && !loading) {
            void refreshDocuments();
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

    async function refreshDocuments() {
        if (loading) return;
        paginationObserver?.disconnect();
        paginationObserver = undefined;
        loadVersion += 1;
        currentPage = 0;
        hasMore = true;
        documents = [];
        error = "";
        await loadNextPage();
    }

    async function loadNextPage() {
        if (loading || !hasMore) return;
        const requestVersion = loadVersion;
        const targetRefreshVersion = refreshVersion;
        const nextPage = currentPage + 1;
        loading = true;
        error = "";
        try {
            const rows = await post<RecentDocumentMetadataRow[]>("/api/query/sql", {
                stmt: buildRecentDocumentsPageSql(nextPage, PAGE_SIZE),
            });
            if (requestVersion !== loadVersion) return;
            const pageDocuments = mapRecentDocumentRows(Array.isArray(rows) ? rows : []);
            const byId = new Map(documents.map((item) => [item.id, item]));
            for (const item of pageDocuments) byId.set(item.id, item);
            documents = [...byId.values()];
            currentPage = nextPage;
            hasMore = pageDocuments.length === PAGE_SIZE;
            loadedRefreshVersion = targetRefreshVersion;
            await tick();
            observePagination();
        } catch (err) {
            if (requestVersion === loadVersion) error = err instanceof Error ? err.message : String(err);
        } finally {
            if (requestVersion === loadVersion) loading = false;
        }
    }

    function validSummary(item: RecentDocumentView): RecentDocumentDiffSummary | undefined {
        const summary = comparisonSummaries[item.id];
        return summary?.documentUpdated === item.updated ? summary : undefined;
    }

    function requestSummaries(items: RecentDocumentView[]) {
        for (const item of items) requestComparisonSummary(item);
    }

    function requestComparisonSummary(item: RecentDocumentView) {
        const key = `${item.id}:${item.updated}`;
        if (validSummary(item) || queuedSummaryKeys.has(key)) return;
        queuedSummaryKeys.add(key);
        summaryQueue.push(item);
        drainSummaryQueue();
    }

    function drainSummaryQueue() {
        while (activeSummaryCount < SUMMARY_CONCURRENCY && summaryQueue.length > 0) {
            const item = summaryQueue.shift();
            if (!item) return;
            const key = `${item.id}:${item.updated}`;
            activeSummaryCount += 1;
            void compareDocument(item)
                .finally(() => {
                    activeSummaryCount -= 1;
                    queuedSummaryKeys.delete(key);
                    drainSummaryQueue();
                });
        }
    }

    async function compareDocument(item: RecentDocumentView) {
        try {
            const result = await resolveRecentDocumentHistoryDiff({ request: post } as any, {
                documentId: item.id,
                currentUpdated: item.updated,
                maxCandidates: 5,
                page: 1,
                pageSize: 100,
            });
            if (!isCurrentDocumentVersion(item)) return;
            onComparisonSummary(item.id, {
                status: summaryStatus(result.changeKinds, result.reason),
                changedBlocks: result.stats.changedBlocks,
                addedLines: result.stats.addedLines,
                removedLines: result.stats.removedLines,
                baselineCreated: result.baseline?.createdAt || result.baseline?.created || "",
                documentUpdated: item.updated,
            });
        } catch {
            if (!isCurrentDocumentVersion(item)) return;
            onComparisonSummary(item.id, {
                status: "error",
                changedBlocks: 0,
                addedLines: 0,
                removedLines: 0,
                baselineCreated: "",
                documentUpdated: item.updated,
            });
        }
    }

    function isCurrentDocumentVersion(item: RecentDocumentView): boolean {
        return documents.some((document) => document.id === item.id && document.updated === item.updated);
    }

    function summaryStatus(changeKinds: string[], reason?: string): RecentDocumentDiffStatus {
        if (changeKinds.includes("content")) return "content_changed";
        if (changeKinds.includes("title")) return "title_changed";
        if (reason === "no_history") return "no_history";
        if (reason === "same_content_checkpoint") return "same_content_checkpoint";
        return "history_insufficient";
    }

    function syncCollapsedGroups(groups: RecentDocumentGroup[]) {
        const signature = collectRecentDocumentGroupKeys(groups).join("|");
        if (signature === knownGroupSignature) return;
        collapsedGroups = mergeCollapsedGroupState(collapsedGroups, groups, knownGroupKeys);
        knownGroupKeys = new Set(collectRecentDocumentGroupKeys(groups));
        knownGroupSignature = signature;
    }

    function resetGroupingState() {
        knownGroupKeys = new Set();
        knownGroupSignature = "";
        collapsedGroups = new Set();
    }

    function toggleGroup(key: string) {
        const next = new Set(collapsedGroups);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        collapsedGroups = next;
    }
</script>

<section class="recent-documents" bind:this={shellElement}>
    <header class="recent-documents__header">
        <div>
            <strong>{t("recent_documents_panel_title", "最近更新")}</strong>
            <small>{t("recent_documents_panel_desc", "按文档更新时间排列；正文差异与结构更新分别标记")}</small>
        </div>
        <button class="b3-button b3-button--outline recent-documents__refresh" type="button" title={t("recent_documents_action_refresh", "刷新")} disabled={loading} on:click={refreshDocuments}>↻</button>
    </header>

    <div class="recent-documents__controls">
        <input class="b3-text-field" type="search" bind:value={query} placeholder={t("recent_documents_search_placeholder", "搜索最近更新的文档")} />
        <select class="b3-select" bind:value={granularity} on:change={resetGroupingState} aria-label={t("recent_documents_granularity", "时间轴粒度")}>
            <option value="day">{t("recent_documents_granularity_day", "按日")}</option>
            <option value="month">{t("recent_documents_granularity_month", "按月")}</option>
            <option value="year">{t("recent_documents_granularity_year", "按年")}</option>
        </select>
        <select class="b3-select" bind:value={filter} aria-label={t("recent_documents_filter", "更新类型筛选")}>
            <option value="all">{t("recent_documents_filter_all", "全部更新")}</option>
            <option value="content">{t("recent_documents_filter_content", "正文变更")}</option>
            <option value="structure">{t("recent_documents_filter_structure", "标题变更")}</option>
            <option value="insufficient">{t("recent_documents_filter_insufficient", "历史不足")}</option>
        </select>
    </div>

    {#if error && documents.length === 0}
        <div class="recent-documents__state recent-documents__state--error"><strong>{t("recent_documents_error", "无法读取最近更新文档")}</strong><small>{error}</small></div>
    {:else if loading && documents.length === 0}
        <div class="recent-documents__state">{t("recent_documents_loading", "正在加载最近更新文档…")}</div>
    {:else if filteredDocuments.length === 0}
        <div class="recent-documents__state">
            {pendingFilterAnalysis
                ? t("recent_documents_filter_analyzing", "正在分析已加载文档的更新类型…")
                : query
                    ? t("recent_documents_empty_search", "没有匹配的最近更新文档")
                    : t("recent_documents_empty", "当前筛选下没有文档")}
        </div>
    {:else}
        <div class="recent-documents__list" bind:this={listElement}>
            {#each groupedDocuments as year (year.key)}
                <section class="recent-group level-year">
                    <button class="recent-group__header" type="button" on:click={() => toggleGroup(year.key)} aria-expanded={query.trim() !== "" || !collapsedGroups.has(year.key)}><span class:expanded={query.trim() !== "" || !collapsedGroups.has(year.key)}>{query.trim() === "" && collapsedGroups.has(year.key) ? "›" : "⌄"}</span><strong>{year.label}</strong><small>{year.documentCount}</small></button>
                    <div class="recent-group__content" class:collapsed={query.trim() === "" && collapsedGroups.has(year.key)} aria-hidden={query.trim() === "" && collapsedGroups.has(year.key)}>
                        <div class="recent-group__content-inner">
                            {#if year.documents.length > 0}
                                <ul>{#each year.documents as item (item.id)}<li><RecentDocumentCard {item} summary={validSummary(item)} active={activeDocumentId === item.id} {i18n} onOpen={onOpenDocument} onVisible={requestComparisonSummary} /></li>{/each}</ul>
                            {/if}
                            {#each year.children as month (month.key)}
                                <section class="recent-group level-month">
                                    <button class="recent-group__header" type="button" on:click={() => toggleGroup(month.key)} aria-expanded={query.trim() !== "" || !collapsedGroups.has(month.key)}><span class:expanded={query.trim() !== "" || !collapsedGroups.has(month.key)}>{query.trim() === "" && collapsedGroups.has(month.key) ? "›" : "⌄"}</span><strong>{month.label}</strong><small>{month.documentCount}</small></button>
                                    <div class="recent-group__content" class:collapsed={query.trim() === "" && collapsedGroups.has(month.key)} aria-hidden={query.trim() === "" && collapsedGroups.has(month.key)}>
                                        <div class="recent-group__content-inner">
                                            {#if month.documents.length > 0}
                                                <ul>{#each month.documents as item (item.id)}<li><RecentDocumentCard {item} summary={validSummary(item)} active={activeDocumentId === item.id} {i18n} onOpen={onOpenDocument} onVisible={requestComparisonSummary} /></li>{/each}</ul>
                                            {/if}
                                            {#each month.children as day (day.key)}
                                                <section class="recent-group level-day">
                                                    <button class="recent-group__header" type="button" on:click={() => toggleGroup(day.key)} aria-expanded={query.trim() !== "" || !collapsedGroups.has(day.key)}><span class:expanded={query.trim() !== "" || !collapsedGroups.has(day.key)}>{query.trim() === "" && collapsedGroups.has(day.key) ? "›" : "⌄"}</span><strong>{day.label}</strong><small>{day.documentCount}</small></button>
                                                    <div class="recent-group__content" class:collapsed={query.trim() === "" && collapsedGroups.has(day.key)} aria-hidden={query.trim() === "" && collapsedGroups.has(day.key)}>
                                                        <div class="recent-group__content-inner">
                                                            <ul>{#each day.documents as item (item.id)}<li><RecentDocumentCard {item} summary={validSummary(item)} active={activeDocumentId === item.id} {i18n} onOpen={onOpenDocument} onVisible={requestComparisonSummary} /></li>{/each}</ul>
                                                        </div>
                                                    </div>
                                                </section>
                                            {/each}
                                        </div>
                                    </div>
                                </section>
                            {/each}
                        </div>
                    </div>
                </section>
            {/each}

            <div class="recent-documents__load-more" bind:this={loadMoreElement}>
                {#if hasMore}
                    <button class="b3-button b3-button--outline" type="button" disabled={loading} on:click={loadNextPage}>{loading ? t("recent_documents_loading_more", "正在加载…") : t("recent_documents_load_more", "加载更早文档")}</button>
                {:else}
                    <small>{t("recent_documents_end", "已到达时间轴起点")}</small>
                {/if}
            </div>
        </div>
    {/if}
</section>

<style>
    .recent-documents { display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--b3-theme-on-background); background: var(--b3-theme-background); }
    .recent-documents__header { display: flex; align-items: center; gap: 10px; padding: 12px 12px 8px; border-bottom: 1px solid var(--b3-border-color); }
    .recent-documents__header > div { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 2px; }
    .recent-documents__header small { color: var(--b3-theme-on-surface); }
    .recent-documents__refresh { min-width: 30px; padding: 4px 8px; font-size: 17px; }
    .recent-documents__controls { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 6px; padding: 8px 10px; }
    .recent-documents__controls input { min-width: 0; }
    .recent-documents__controls select { max-width: 94px; }
    .recent-documents__list { flex: 1; min-height: 0; padding: 0 7px 12px; overflow: auto; }
    .recent-group { position: relative; }
    .recent-group + .recent-group { margin-top: 4px; }
    .recent-group.level-month { margin-left: 8px; border-left: 1px solid color-mix(in srgb, var(--b3-theme-primary) 24%, var(--b3-border-color)); padding-left: 7px; }
    .recent-group.level-day { margin-left: 8px; border-left: 1px solid var(--b3-border-color); padding-left: 7px; }
    .recent-group__header { display: grid; width: 100%; grid-template-columns: 16px minmax(0, 1fr) auto; align-items: center; gap: 4px; padding: 6px 7px; border: 0; border-radius: var(--b3-border-radius); color: var(--b3-theme-on-surface); background: color-mix(in srgb, var(--b3-theme-surface) 70%, transparent); text-align: left; cursor: pointer; }
    .recent-group__header:hover, .recent-group__header:focus-visible { background: var(--b3-list-hover); outline: none; }
    .recent-group__header strong { overflow: hidden; color: var(--b3-theme-on-background); font-size: 12px; font-weight: 620; text-overflow: ellipsis; white-space: nowrap; }
    .recent-group__header small { min-width: 20px; border-radius: 999px; padding: 0 5px; background: var(--b3-theme-surface-lighter); text-align: center; }
    .recent-group__header > span { display: inline-block; transform-origin: center; transition: transform 160ms ease; }
    .recent-group__header > span.expanded { transform: translateY(1px); }
    .recent-group__content { display: grid; min-height: 0; grid-template-rows: 1fr; opacity: 1; visibility: visible; transition: grid-template-rows 160ms cubic-bezier(.2, .8, .2, 1), opacity 120ms ease, visibility 0s linear 0s; }
    .recent-group__content.collapsed { grid-template-rows: 0fr; opacity: 0; visibility: hidden; pointer-events: none; transition: grid-template-rows 160ms cubic-bezier(.2, .8, .2, 1), opacity 120ms ease, visibility 0s linear 160ms; }
    .recent-group__content-inner { min-height: 0; overflow: hidden; }
    .recent-group ul { display: grid; gap: 5px; margin: 0; padding: 5px 0 2px; list-style: none; }
    .recent-documents__load-more { display: flex; justify-content: center; padding: 14px 8px 4px; color: var(--b3-theme-on-surface); }
    .recent-documents__state { display: flex; flex: 1; align-items: center; justify-content: center; flex-direction: column; gap: 6px; padding: 24px 16px; color: var(--b3-theme-on-surface); text-align: center; }
    .recent-documents__state--error strong { color: var(--b3-theme-error); }
    .recent-documents__state small { overflow-wrap: anywhere; }
    @media (max-width: 330px) {
        .recent-documents__controls { grid-template-columns: 1fr 1fr; }
        .recent-documents__controls input { grid-column: 1 / -1; }
        .recent-documents__controls select { max-width: none; width: 100%; }
    }
</style>

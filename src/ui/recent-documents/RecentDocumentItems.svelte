<script lang="ts">
    import RecentDocumentCard from "./RecentDocumentCard.svelte";
    import {
        buildRecentDocumentDisplayUnits,
        type RecentDocumentDiffSummary,
        type RecentDocumentFolderUnit,
        type RecentDocumentView,
    } from "./recent-documents";

    export let documents: RecentDocumentView[] = [];
    export let groupByParent = false;
    export let searchActive = false;
    export let comparisonSummaries: Record<string, RecentDocumentDiffSummary> = {};
    export let activeDocumentId = "";
    export let i18n: Record<string, string> = {};
    export let onOpenDocument: (document: RecentDocumentView) => void = () => {};
    export let onOpenParentDocument: (folder: RecentDocumentFolderUnit) => void = () => {};
    export let onVisible: (document: RecentDocumentView) => void = () => {};

    let collapsedFolders = new Set<string>();

    $: units = buildRecentDocumentDisplayUnits(documents, groupByParent);

    function t(key: string, fallback: string): string {
        return i18n?.[key] ?? fallback;
    }

    function validSummary(item: RecentDocumentView): RecentDocumentDiffSummary | undefined {
        const summary = comparisonSummaries[item.id];
        return summary?.documentUpdated === item.updated ? summary : undefined;
    }

    function toggleFolder(key: string) {
        const next = new Set(collapsedFolders);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        collapsedFolders = next;
    }
</script>

<ul class="recent-document-items">
    {#each units as unit (unit.key)}
        {#if unit.kind === "document"}
            <li>
                <RecentDocumentCard
                    item={unit.document}
                    summary={validSummary(unit.document)}
                    active={activeDocumentId === unit.document.id}
                    {i18n}
                    onOpen={onOpenDocument}
                    {onVisible}
                />
            </li>
        {:else}
            <li class="recent-folder">
                <div class="recent-folder__header">
                    <button
                        class="recent-folder__toggle"
                        type="button"
                        title={collapsedFolders.has(unit.key)
                            ? t("recent_documents_folder_expand", "展开目录")
                            : t("recent_documents_folder_collapse", "折叠目录")}
                        aria-expanded={searchActive || !collapsedFolders.has(unit.key)}
                        on:click={() => toggleFolder(unit.key)}
                    >{searchActive || !collapsedFolders.has(unit.key) ? "⌄" : "›"}</button>
                    <button
                        class="recent-folder__open"
                        type="button"
                        title={`${t("recent_documents_folder_open", "打开父文档")}：${unit.parentPath}`}
                        on:click={() => onOpenParentDocument(unit)}
                    >
                        <span class="recent-folder__icon">▤</span>
                        <span class="recent-folder__labels">
                            <strong>{unit.label}</strong>
                            <small>{unit.parentPath}</small>
                        </span>
                    </button>
                    <small class="recent-folder__count">{unit.documents.length}</small>
                </div>
                <div
                    class="recent-folder__content"
                    class:collapsed={!searchActive && collapsedFolders.has(unit.key)}
                    aria-hidden={!searchActive && collapsedFolders.has(unit.key)}
                >
                    <div class="recent-folder__content-inner">
                        <ul>
                            {#each unit.documents as item (item.id)}
                                <li>
                                    <RecentDocumentCard
                                        {item}
                                        summary={validSummary(item)}
                                        active={activeDocumentId === item.id}
                                        {i18n}
                                        onOpen={onOpenDocument}
                                        {onVisible}
                                    />
                                </li>
                            {/each}
                        </ul>
                    </div>
                </div>
            </li>
        {/if}
    {/each}
</ul>

<style>
    .recent-document-items,
    .recent-folder ul {
        display: grid;
        gap: 5px;
        margin: 0;
        padding: 5px 0 2px;
        list-style: none;
    }
    .recent-folder {
        overflow: hidden;
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 20%, var(--b3-border-color));
        border-radius: var(--b3-border-radius);
        background: color-mix(in srgb, var(--b3-theme-surface) 48%, transparent);
    }
    .recent-folder__header {
        display: grid;
        grid-template-columns: 24px minmax(0, 1fr) auto;
        align-items: center;
        gap: 3px;
        padding: 4px 5px;
    }
    .recent-folder__toggle,
    .recent-folder__open {
        border: 0;
        color: inherit;
        background: transparent;
        cursor: pointer;
    }
    .recent-folder__toggle {
        width: 24px;
        height: 28px;
        border-radius: var(--b3-border-radius);
        padding: 0;
        color: var(--b3-theme-on-surface);
        font-size: 16px;
    }
    .recent-folder__toggle:hover,
    .recent-folder__toggle:focus-visible,
    .recent-folder__open:hover,
    .recent-folder__open:focus-visible {
        background: var(--b3-list-hover);
        outline: none;
    }
    .recent-folder__open {
        display: grid;
        min-width: 0;
        grid-template-columns: 20px minmax(0, 1fr);
        align-items: center;
        gap: 5px;
        border-radius: var(--b3-border-radius);
        padding: 4px 5px;
        text-align: left;
    }
    .recent-folder__icon {
        color: var(--b3-theme-primary);
        font-size: 15px;
    }
    .recent-folder__labels {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 1px;
    }
    .recent-folder__labels strong,
    .recent-folder__labels small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .recent-folder__labels strong {
        color: var(--b3-theme-on-background);
        font-size: 12px;
        font-weight: 620;
    }
    .recent-folder__labels small {
        color: var(--b3-theme-on-surface);
        font-size: 10px;
    }
    .recent-folder__count {
        min-width: 22px;
        border-radius: 999px;
        padding: 1px 6px;
        color: var(--b3-theme-on-surface);
        background: var(--b3-theme-surface-lighter);
        text-align: center;
    }
    .recent-folder__content {
        display: grid;
        min-height: 0;
        grid-template-rows: 1fr;
        opacity: 1;
        visibility: visible;
        transition: grid-template-rows 160ms cubic-bezier(.2, .8, .2, 1), opacity 120ms ease, visibility 0s linear 0s;
    }
    .recent-folder__content.collapsed {
        grid-template-rows: 0fr;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: grid-template-rows 160ms cubic-bezier(.2, .8, .2, 1), opacity 120ms ease, visibility 0s linear 160ms;
    }
    .recent-folder__content-inner {
        min-height: 0;
        overflow: hidden;
    }
    .recent-folder ul {
        margin-left: 12px;
        border-left: 1px solid color-mix(in srgb, var(--b3-theme-primary) 25%, var(--b3-border-color));
        padding: 3px 5px 6px 8px;
    }
</style>

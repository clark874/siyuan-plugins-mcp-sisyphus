<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import {
        formatRecentDocumentTime,
        type RecentDocumentDiffSummary,
        type RecentDocumentView,
    } from "./recent-documents";

    export let item: RecentDocumentView;
    export let summary: RecentDocumentDiffSummary | undefined;
    export let active = false;
    export let i18n: Record<string, string> = {};
    export let onOpen: (document: RecentDocumentView) => void = () => {};
    export let onVisible: (document: RecentDocumentView) => void = () => {};

    let cardElement: HTMLButtonElement;
    let observer: IntersectionObserver | undefined;

    onMount(() => {
        if (typeof IntersectionObserver === "undefined") {
            onVisible(item);
            return;
        }
        observer = new IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            onVisible(item);
            observer?.disconnect();
        }, { rootMargin: "160px 0px" });
        observer.observe(cardElement);
    });

    onDestroy(() => observer?.disconnect());

    function t(key: string, fallback: string): string {
        return i18n?.[key] ?? fallback;
    }

    function summaryText(): string {
        if (!summary || summary.documentUpdated !== item.updated) {
            return t("recent_documents_summary_pending", "正在分析变更范围…");
        }
        switch (summary.status) {
            case "content_changed":
                return t("recent_documents_summary_changes", "${blocks} 个变更块 · +${added} / -${removed}")
                    .replace("${blocks}", String(summary.changedBlocks))
                    .replace("${added}", String(summary.addedLines))
                    .replace("${removed}", String(summary.removedLines));
            case "title_changed":
                return t("recent_documents_summary_title_changed", "标题发生变化，正文未变");
            case "same_content_checkpoint":
                return t("recent_documents_summary_same_checkpoint", "正文与现有检查点相同；可能为属性或结构更新");
            case "no_history":
                return t("recent_documents_summary_no_history", "暂无历史检查点");
            case "history_insufficient":
                return t("recent_documents_summary_history_insufficient", "缺少可比较的修改前检查点");
            default:
                return t("recent_documents_summary_error", "差异读取失败");
        }
    }

    function statusClass(): string {
        if (!summary || summary.documentUpdated !== item.updated) return "pending";
        if (summary.status === "content_changed") return "content";
        if (summary.status === "title_changed") return "structure";
        if (summary.status === "error") return "error";
        return "insufficient";
    }

    function iconText(icon: string): string {
        if (!icon || !/^[0-9a-f-]+$/i.test(icon)) return "📄";
        try {
            return String.fromCodePoint(...icon.split("-").map((part) => Number.parseInt(part, 16)));
        } catch {
            return "📄";
        }
    }
</script>

<button
    bind:this={cardElement}
    class:active
    class="recent-document"
    type="button"
    on:click={() => onOpen(item)}
>
    <span class="recent-document__icon" aria-hidden="true">{iconText(item.icon)}</span>
    <span class="recent-document__body">
        <strong>{item.title}</strong>
        {#if item.parentPath}<small class="recent-document__path" title={item.parentPath}>{item.parentPath}</small>{/if}
        <small class="recent-document__summary {statusClass()}">{summaryText()}</small>
    </span>
    {#if formatRecentDocumentTime(item.updated, document.documentElement.lang || undefined)}
        <time class="recent-document__time">{formatRecentDocumentTime(item.updated, document.documentElement.lang || undefined)}</time>
    {/if}
</button>

<style>
    .recent-document {
        display: grid;
        width: 100%;
        grid-template-columns: 28px minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        padding: 9px 8px;
        border: 1px solid transparent;
        border-radius: 8px;
        color: inherit;
        background: color-mix(in srgb, var(--b3-theme-surface) 58%, transparent);
        box-shadow: 0 1px 2px color-mix(in srgb, var(--b3-theme-on-background) 8%, transparent);
        text-align: left;
        cursor: pointer;
    }

    .recent-document:hover,
    .recent-document:focus-visible {
        border-color: color-mix(in srgb, var(--b3-theme-primary) 35%, var(--b3-border-color));
        background: var(--b3-list-hover);
        outline: none;
    }

    .recent-document.active {
        border-color: color-mix(in srgb, var(--b3-theme-primary) 55%, transparent);
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, var(--b3-theme-background));
        box-shadow: inset 3px 0 0 var(--b3-theme-primary);
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
    .recent-document__path,
    .recent-document__summary {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .recent-document__body strong {
        font-weight: 560;
    }

    .recent-document__path,
    .recent-document__time,
    .recent-document__summary {
        font-size: 11px;
    }

    .recent-document__path,
    .recent-document__time {
        color: var(--b3-theme-on-surface);
    }

    .recent-document__summary.content {
        color: color-mix(in srgb, var(--b3-theme-primary) 78%, var(--b3-theme-on-surface));
    }

    .recent-document__summary.structure {
        color: var(--b3-theme-secondary);
    }

    .recent-document__summary.insufficient,
    .recent-document__summary.pending {
        color: var(--b3-theme-on-surface);
    }

    .recent-document__summary.error {
        color: var(--b3-theme-error);
    }

    .recent-document__time {
        align-self: start;
        padding-top: 2px;
        white-space: nowrap;
    }
</style>

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('recent documents dock source contract', () => {
    const panelSource = readFileSync(resolve(process.cwd(), 'src/ui/recent-documents/RecentDocumentsPanel.svelte'), 'utf8');
    const pluginSource = readFileSync(resolve(process.cwd(), 'src/index.ts'), 'utf8');

    it('uses paginated SQL rather than the fixed native recent-documents list', () => {
        expect(panelSource).not.toContain('"/api/storage/getRecentDocs"');
        expect(panelSource).toContain('buildRecentDocumentsPageSql');
        expect(panelSource).toContain('"/api/query/sql"');
        expect(panelSource).toContain('PAGE_SIZE');
        expect(panelSource).toContain('loadNextPage');
    });

    it('provides search, manual refresh, and document opening', () => {
        expect(panelSource).toContain('recent_documents_search_placeholder');
        expect(panelSource).toContain('recent_documents_action_refresh');
        expect(panelSource).toContain('onOpen={onOpenDocument}');
        expect(panelSource).toContain('groupRecentDocuments');
        expect(panelSource).toContain('comparisonSummaries');
        expect(panelSource).toContain('requestComparisonSummary');
        expect(panelSource).toContain('recent_documents_granularity_day');
        expect(panelSource).toContain('recent_documents_filter_content');
        expect(pluginSource).toContain('selection: this.recentHistorySelection');
        expect(pluginSource).toContain('this.showDiffDock()');
        expect(pluginSource).toContain('open-menu-doctree');
        expect(pluginSource).toContain('onCompareRecent');
    });

    it('starts the initial refresh once and rejects overlapping refreshes', () => {
        const onMountBody = panelSource.match(/onMount\(async \(\) => \{([\s\S]*?)\n    \}\);/)?.[1] ?? '';

        expect(onMountBody).toContain('updateVisibility();');
        expect(onMountBody).not.toContain('refreshDocuments()');
        expect(panelSource).toMatch(/async function refreshDocuments\(\) \{\s*if \(loading\) return;/);
    });

    it('tracks collapse state directly and keeps group content mounted during animation', () => {
        expect(panelSource).not.toContain('function groupCollapsed(');
        expect(panelSource).toContain('collapsedGroups.has(year.key)');
        expect(panelSource).toContain('collapsedGroups.has(month.key)');
        expect(panelSource).toContain('collapsedGroups.has(day.key)');
        expect(panelSource).toContain('class:collapsed={query.trim() === "" && collapsedGroups.has(year.key)}');
        expect(panelSource).toContain('class="recent-group__content-inner"');
        expect(panelSource).toContain('.recent-group__content.collapsed');
        expect(panelSource).not.toContain('transition:slide');
    });

    it('does not recreate the pagination observer after every page', () => {
        expect(panelSource).toContain('if (paginationObserver || typeof IntersectionObserver === "undefined" || !loadMoreElement) return;');
        expect(panelSource).toContain('currentPage < AUTO_PAGE_LIMIT');
        expect(panelSource).toMatch(/async function refreshDocuments\(\)[\s\S]*?paginationObserver\?\.disconnect\(\);\s*paginationObserver = undefined;/);
    });

    it('registers a distinct left-bottom dock and icon', () => {
        expect(pluginSource).toContain('sisyphusRecentDocumentsDock');
        expect(pluginSource).toContain('iconSisyphusRecentDocumentsDock');
        expect(pluginSource).toContain('const RECENT_DOCUMENTS_DOCK_POSITION = "LeftBottom"');
        expect(pluginSource).toContain('title: this.i18n?.recent_documents_dock_title || "最近更新"');
    });
});

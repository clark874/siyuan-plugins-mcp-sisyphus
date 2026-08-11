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

    it('registers a distinct left-bottom dock and icon', () => {
        expect(pluginSource).toContain('sisyphusRecentDocumentsDock');
        expect(pluginSource).toContain('iconSisyphusRecentDocumentsDock');
        expect(pluginSource).toContain('const RECENT_DOCUMENTS_DOCK_POSITION = "LeftBottom"');
        expect(pluginSource).toContain('title: this.i18n?.recent_documents_dock_title || "最近更新"');
    });
});

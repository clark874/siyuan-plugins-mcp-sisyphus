import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('recent documents dock source contract', () => {
    const panelSource = readFileSync(resolve(process.cwd(), 'src/ui/recent-documents/RecentDocumentsPanel.svelte'), 'utf8');
    const pluginSource = readFileSync(resolve(process.cwd(), 'src/index.ts'), 'utf8');

    it('uses the native recent-documents endpoint in modified order', () => {
        expect(panelSource).toContain('"/api/storage/getRecentDocs"');
        expect(panelSource).toContain('sortBy: "updated"');
        expect(panelSource).toContain('buildRecentDocumentMetadataSql');
        expect(panelSource).toContain('"/api/query/sql"');
    });

    it('provides search, manual refresh, and document opening', () => {
        expect(panelSource).toContain('recent_documents_search_placeholder');
        expect(panelSource).toContain('recent_documents_action_refresh');
        expect(panelSource).toContain('onOpenDocument(document)');
        expect(panelSource).toContain('groupRecentDocuments');
        expect(panelSource).toContain('comparisonSummaries');
        expect(pluginSource).toContain('selection: this.recentHistorySelection');
        expect(pluginSource).toContain('this.showDiffDock()');
    });

    it('registers a distinct left-bottom dock and icon', () => {
        expect(pluginSource).toContain('sisyphusRecentDocumentsDock');
        expect(pluginSource).toContain('iconSisyphusRecentDocumentsDock');
        expect(pluginSource).toContain('const RECENT_DOCUMENTS_DOCK_POSITION = "LeftBottom"');
        expect(pluginSource).toContain('title: this.i18n?.recent_documents_dock_title || "最近修改"');
    });
});

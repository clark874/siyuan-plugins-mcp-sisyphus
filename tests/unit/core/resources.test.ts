import { describe, expect, it } from 'vitest';

import { listHelpResourceTemplates, listHelpResources, readHelpResource } from '@/core/resources';

describe('core/resources', () => {
    it('lists static help resources and the action template', () => {
        const resources = listHelpResources();
        const templates = listHelpResourceTemplates();

        expect(resources.map((resource) => resource.uri)).toEqual(expect.arrayContaining([
            'siyuan://help/tool-overview',
            'siyuan://help/examples',
            'siyuan://help/document-path-semantics',
            'siyuan://help/ai-layout-guide',
        ]));
        expect(resources.every((resource) => resource.mimeType === 'text/markdown')).toBe(true);
        expect(templates).toEqual(expect.arrayContaining([
            expect.objectContaining({
                uriTemplate: 'siyuan://help/action/{tool}/{action}',
                mimeType: 'text/markdown',
            }),
        ]));
    });

    it('renders static and action help resources with parameter summaries', () => {
        const overview = readHelpResource('siyuan://help/tool-overview');
        const action = readHelpResource('siyuan://help/action/notebook/create');

        expect(overview).toEqual(expect.objectContaining({
            uri: 'siyuan://help/tool-overview',
            mimeType: 'text/markdown',
        }));
        expect(overview?.text).toContain('# SiYuan MCP Tool Overview');
        expect(action?.text).toContain('# notebook(action="create")');
        expect(action?.text).toContain('## Valid shapes');
        expect(action?.text).toContain('```json');
    });

    it('returns null for unknown URIs and actions', () => {
        expect(readHelpResource('siyuan://help/action/unknown/list')).toBeNull();
        expect(readHelpResource('siyuan://help/action/notebook/unknown')).toBeNull();
        expect(readHelpResource('not a uri')).toBeNull();
    });
});

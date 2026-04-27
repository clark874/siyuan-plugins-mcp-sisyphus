import { describe, expect, it, vi } from 'vitest';

import { buildDefaultToolConfig } from '@/core/config';
import { DocumentMoveSchema } from '@/core/types';
import { callDocumentTool, DOCUMENT_VARIANTS, listDocumentTools } from '@/tools/document';
import { createMockClient } from '../../helpers/mock-client';
import { parseResult } from '../../helpers/parse-result';

describe('document tool extended actions', () => {
    it('exposes filetree enhancement actions in the grouped schema', () => {
        const config = buildDefaultToolConfig();
        const [tool] = listDocumentTools(config.document);
        const actionDescription = tool.inputSchema.properties.action.description;
        expect(actionDescription).toContain('lookup');
        expect(actionDescription).toContain('duplicate');
        expect(actionDescription).not.toContain('create_empty');
        expect(actionDescription).not.toContain('get_path');
        expect(actionDescription).not.toContain('get_hpath');
        expect(actionDescription).not.toContain('get_ids');
        expect(actionDescription).toContain('heading_to_doc');
        expect(actionDescription).toContain('doc_to_heading');
    });
});

describe('document.move schema', () => {
    it('declares the same move shapes accepted by runtime validation', () => {
        const move = DOCUMENT_VARIANTS.find((variant) => variant.action === 'move');

        expect(move?.schema.required).toEqual(['action']);
        expect(move?.schema.properties?.notebook).toBeUndefined();
        expect(move?.schema.properties?.path).toBeUndefined();
        expect(move?.schema.properties?.fromPaths?.type).toBe('array');
        expect(move?.schema.properties?.toNotebook?.type).toBe('string');
        expect(move?.schema.properties?.toPath?.type).toBe('string');
        expect(move?.schema.properties?.fromIDs?.type).toBe('array');
        expect(move?.schema.properties?.toID?.type).toBe('string');
    });

    it('accepts both runtime-suggested move shapes', () => {
        expect(DocumentMoveSchema.safeParse({
            action: 'move',
            fromIDs: ['20260424090835-7zk12km'],
            toID: '20260424090835-mgazf66',
        }).success).toBe(true);

        expect(DocumentMoveSchema.safeParse({
            action: 'move',
            fromPaths: ['/20260424090835-rx6ds6g/20260424090835-7zk12km.sy'],
            toNotebook: '20260424090835-rx6ds6g',
            toPath: '/20260424090835-rx6ds6g/20260424090835-mgazf66.sy',
        }).success).toBe(true);
    });

    it('ignores blank legacy path fields instead of switching validation modes', () => {
        const result = DocumentMoveSchema.safeParse({
            action: 'move',
            path: '',
            notebook: '',
            fromIDs: ['20260424090835-7zk12km'],
            toID: '20260424090835-mgazf66',
        });

        expect(result.success).toBe(true);
    });

    it('returns a concise tool validation error when fromIDs is not an array', async () => {
        const config = buildDefaultToolConfig().document;
        config.actions.move = true;
        const result = await callDocumentTool(
            {} as never,
            { action: 'move', fromIDs: '20260422174709-kti2yfj', toID: '20260407011653-t80igcv' },
            config,
            {} as never,
        );
        const payload = JSON.parse(result.content[0].text);

        expect(result.isError).toBe(true);
        expect(payload.error.type).toBe('validation_error');
        expect(payload.error.message).toBe('Invalid arguments for document(action="move").');
        expect(payload.error.fields[0].path).toBe('fromIDs');
        expect(payload.error.fields[0].message).toBe('fromIDs has an invalid type.');
    });

    it('returns a specific unknown_action error for unsupported actions', async () => {
        const result = await callDocumentTool(
            {} as never,
            { action: 'not_exist_action', id: '20210808180117-czbujy4' },
            buildDefaultToolConfig().document,
            {} as never,
        );
        const payload = JSON.parse(result.content[0].text);

        expect(result.isError).toBe(true);
        expect(payload.error.type).toBe('unknown_action');
        expect(payload.error.message).toBe('Unknown action "not_exist_action" for tool "document".');
        expect(payload.error.validActions).toContain('create');
        expect(payload.error.validActions).toContain('help');
        expect(payload.error.validActions).not.toContain('not_exist_action');
    });
});

describe('document.lookup path compatibility', () => {
    it('interprets non-storage path input as hpath and returns the storage path', async () => {
        const client = createMockClient({
            request: vi.fn(async (endpoint: string) => {
                if (endpoint === '/api/filetree/getIDsByHPath') return ['doc-1'];
                if (endpoint === '/api/filetree/getPathByID') return { notebook: 'nb-1', path: '/doc-1.sy' };
                throw new Error(`Unexpected endpoint: ${endpoint}`);
            }),
        });
        const permMgr = {
            reload: vi.fn(async () => undefined),
            canRead: vi.fn(() => true),
            get: vi.fn(() => 'rwd'),
        };

        const result = await callDocumentTool(
            client,
            { action: 'lookup', notebook: 'nb-1', path: '/AI Interface Root 20260427_144409', include: ['id', 'path', 'hpath'] },
            buildDefaultToolConfig().document,
            permMgr as never,
        );
        const payload = parseResult(result) as Record<string, unknown>;

        expect(result.isError).toBeUndefined();
        expect(payload.id).toBe('doc-1');
        expect(payload.path).toEqual({ notebook: 'nb-1', path: '/doc-1.sy' });
        expect(payload.hPath).toBe('/AI Interface Root 20260427_144409');
        expect(payload.interpretedPathAs).toBe('hpath');
        expect(client.request).not.toHaveBeenCalledWith('/api/filetree/getHPathByPath', expect.anything());
    });
});

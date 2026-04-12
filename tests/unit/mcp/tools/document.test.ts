import { describe, expect, it } from 'vitest';

import { buildDefaultToolConfig } from '@/mcp/config';
import { listDocumentTools } from '@/mcp/tools/document';

describe('document tool extended actions', () => {
    it('exposes filetree enhancement actions in the grouped schema', () => {
        const config = buildDefaultToolConfig();
        const [tool] = listDocumentTools(config.document);
        expect(tool.inputSchema.properties.action.enum).toContain('duplicate');
        expect(tool.inputSchema.properties.action.enum).toContain('remove_batch');
        expect(tool.inputSchema.properties.action.enum).toContain('create_empty');
        expect(tool.inputSchema.properties.action.enum).toContain('heading_to_doc');
        expect(tool.inputSchema.properties.action.enum).toContain('doc_to_heading');
    });
});

import { describe, expect, it, vi } from 'vitest';

import { buildDefaultToolConfig } from '@/core/config';
import { callTagTool, listTagTools, TAG_VARIANTS } from '@/tools/tag';
import { createMockPermissionManager } from '../../helpers/mock-permissions';

describe('tag tool schemas', () => {
    it('derives action variants from the Zod schemas', () => {
        const rename = TAG_VARIANTS.find((variant) => variant.action === 'rename');

        expect(rename?.schema.properties?.oldLabel?.description).toBe('Existing tag label');
        expect(rename?.schema.properties?.newLabel?.description).toBe('New tag label');
        expect(rename?.schema.required).toEqual(['action', 'oldLabel', 'newLabel']);
        expect(rename?.schema.additionalProperties).toBe(false);
    });

    it('publishes typed tag parameters plus strict internal branches', () => {
        const [tool] = listTagTools(buildDefaultToolConfig().tag);
        const schema = tool.inputSchema;
        const renameBranch = schema['x-sisyphus-actionSchemas']?.find((branch) => branch.properties?.action?.const === 'rename');

        expect(schema.properties?.oldLabel).toBeDefined();
        expect(schema.properties?.oldLabel?.type).toBe('string');
        expect(renameBranch?.properties?.oldLabel?.description).toBe('Existing tag label');
        expect(renameBranch?.required).toEqual(['action', 'oldLabel', 'newLabel']);
    });

    it('uses the saved order or a request-only order without changing workspace settings', async () => {
        const requestRead = vi.fn(async () => ({ conf: { tag: { sort: 6 }, fileTree: { maxListCount: 20 } } }));
        const readFile = vi.fn(async () => '{"version":1,"groups":{"":["z","a"]}}');
        const requestReadEnvelope = vi.fn(async (_endpoint: string, { stmt }: { stmt: string }) => {
            expect(stmt).toContain("s.box NOT IN ('hidden')");
            return { data: [
                { label: 'a/child', count: 2, dates: '{"a/child":20261124010000}' },
                { label: 'z', count: 1, dates: '{"z":20261123010000}' },
            ] };
        });
        const requestWrite = vi.fn();
        const client = { requestRead, requestReadEnvelope, readFile, requestWrite };
        const permissions = Object.assign(createMockPermissionManager(), { getAll: () => ({ hidden: 'none' }) });
        const invoke = async (args: Record<string, unknown>) => {
            const result = await callTagTool(client as never, { action: 'list', ...args }, buildDefaultToolConfig().tag, permissions);
            return JSON.parse((result.content[0] as { text: string }).text);
        };

        expect((await invoke({})).map((tag: { name: string }) => tag.name)).toEqual(['z', 'a']);
        expect((await invoke({ sort: 16 })).map((tag: { name: string }) => tag.name)).toEqual(['a', 'z']);
        expect(await invoke({ keyword: 'child' })).toHaveProperty('tags');
        expect(requestRead.mock.calls).toHaveLength(2);
        expect(readFile).toHaveBeenCalledOnce();
        expect(requestWrite).not.toHaveBeenCalled();
    });
});

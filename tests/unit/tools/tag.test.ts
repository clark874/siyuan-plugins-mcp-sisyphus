import { describe, expect, it } from 'vitest';

import { buildDefaultToolConfig } from '@/core/config';
import { listTagTools, TAG_VARIANTS } from '@/tools/tag';

describe('tag tool schemas', () => {
    it('derives action variants from the Zod schemas', () => {
        const rename = TAG_VARIANTS.find((variant) => variant.action === 'rename');

        expect(rename?.schema.properties?.oldLabel?.description).toBe('Existing tag label');
        expect(rename?.schema.properties?.newLabel?.description).toBe('New tag label');
        expect(rename?.schema.required).toEqual(['action', 'oldLabel', 'newLabel']);
        expect(rename?.schema.additionalProperties).toBe(false);
    });

    it('publishes loose tag parameters plus strict internal branches', () => {
        const [tool] = listTagTools(buildDefaultToolConfig().tag);
        const schema = tool.inputSchema;
        const renameBranch = schema['x-sisyphus-actionSchemas']?.find((branch) => branch.properties?.action?.const === 'rename');

        expect(schema.properties?.oldLabel).toBeDefined();
        expect(schema.properties?.oldLabel?.type).toBeUndefined();
        expect(renameBranch?.properties?.oldLabel?.description).toBe('Existing tag label');
        expect(renameBranch?.required).toEqual(['action', 'oldLabel', 'newLabel']);
    });
});

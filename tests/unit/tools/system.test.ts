import { describe, expect, it } from 'vitest';

import { buildDefaultToolConfig } from '@/core/config';
import { listSystemTools, SYSTEM_VARIANTS } from '@/tools/system';

describe('system tool schemas', () => {
    it('derives constrained config and notification schemas from Zod', () => {
        const conf = SYSTEM_VARIANTS.find((variant) => variant.action === 'conf');
        const notify = SYSTEM_VARIANTS.find((variant) => variant.action === 'notify');

        expect(conf?.schema.properties?.mode?.enum).toEqual(['summary', 'get']);
        expect(conf?.schema.properties?.maxDepth?.type).toBe('integer');
        expect(conf?.schema.properties?.maxDepth?.minimum).toBe(0);
        expect(conf?.schema.properties?.maxDepth?.maximum).toBe(5);
        expect(conf?.schema.properties?.maxItems?.minimum).toBe(1);
        expect(conf?.schema.properties?.maxItems?.maximum).toBe(100);
        expect(notify?.schema.required).toEqual(['action', 'msg', 'level']);
        expect(notify?.schema.properties?.level?.enum).toEqual(['info', 'error']);
    });

    it('publishes loose system parameters plus strict internal branches', () => {
        const [tool] = listSystemTools(buildDefaultToolConfig().system);
        const schema = tool.inputSchema;
        const notifyBranch = schema['x-sisyphus-actionSchemas']?.find((branch) => branch.properties?.action?.const === 'notify');

        expect(schema.properties?.msg).toBeDefined();
        expect(schema.properties?.msg?.type).toBeUndefined();
        expect(notifyBranch?.properties?.msg?.description).toBe('Message content');
        expect(notifyBranch?.properties?.level?.enum).toEqual(['info', 'error']);
        expect(notifyBranch?.additionalProperties).toBe(false);
    });
});

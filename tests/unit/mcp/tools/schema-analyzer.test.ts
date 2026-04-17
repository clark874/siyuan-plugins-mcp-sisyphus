import { describe, expect, it } from 'vitest';

import {
    mergePropertySchemas,
    normalizeJsonSchema,
} from '@/mcp/tools/schema-analyzer';
import { createActionSchema } from '@/mcp/tools/shared';

describe('schema-analyzer helpers', () => {
    it('merges property descriptions and annotations without changing nested schemas', () => {
        const merged = mergePropertySchemas([
            createActionSchema('append', {
                parentID: { type: 'string', description: 'Parent ID' },
                items: { type: 'array', items: { type: 'string' }, description: 'Values' },
            }, ['parentID']),
            createActionSchema('update', {
                parentID: { type: 'string', description: 'Parent ID' },
            }, []),
        ].map((schema, index) => ({ action: index === 0 ? 'append' : 'update', schema })));

        expect((merged.parentID as Record<string, unknown>).description).toBe('Parent ID [Required by: append; Optional in: update]');
        expect((merged.items as Record<string, unknown>).items).toEqual({ type: 'string' });
    });

    it('normalizes nested array item schemas', () => {
        const schema = normalizeJsonSchema({
            type: 'object',
            properties: {
                values: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            tags: { type: 'array' },
                        },
                    },
                },
            },
        }) as Record<string, any>;

        expect(schema.properties.values.items.properties.tags.items).toEqual({ type: 'string' });
    });
});

import { describe, expect, it } from 'vitest';

import { mapFlagsToArgs } from '@/cli/flag-mapper';

const schema = {
    type: 'object',
    properties: {
        action: { type: 'string' },
        item_id: { type: 'string' },
        blockIDs: { type: 'array', items: { type: 'string' } },
        srcIDs: { type: 'array', items: { type: 'string' } },
        checked: { type: 'boolean' },
        assets: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    type: { type: 'string' },
                    content: { type: 'string' },
                },
                required: ['type', 'content'],
            },
        },
    },
};

describe('cli/flag-mapper', () => {
    it('maps kebab-case flags onto snake_case properties', () => {
        const { args, warnings } = mapFlagsToArgs(['--item-id', 'milk'], schema);

        expect(args).toEqual({ item_id: 'milk' });
        expect(warnings).toEqual([]);
    });

    it('maps snake_case flags onto snake_case properties', () => {
        const { args } = mapFlagsToArgs(['--item_id', 'milk'], schema);

        expect(args).toEqual({ item_id: 'milk' });
    });

    it('maps repeated array flags onto array properties', () => {
        const { args } = mapFlagsToArgs(['--block-ids', 'block-a', '--block-ids', 'block-b'], schema);

        expect(args).toEqual({ blockIDs: ['block-a', 'block-b'] });
    });

    it('maps comma-separated array flags onto array properties', () => {
        const { args } = mapFlagsToArgs(['--src-ids', 'row-a,row-b'], schema);

        expect(args).toEqual({ srcIDs: ['row-a', 'row-b'] });
    });

    it('accepts JSON sidecars for array fields', () => {
        const { args } = mapFlagsToArgs(['--block-ids-json', '["block-a","block-b"]'], schema);

        expect(args).toEqual({ blockIDs: ['block-a', 'block-b'] });
    });

    it('lets JSON sidecars override plain array flags', () => {
        const { args } = mapFlagsToArgs([
            '--block-ids', 'block-a',
            '--block-ids-json', '["block-b","block-c"]',
        ], schema);

        expect(args).toEqual({ blockIDs: ['block-b', 'block-c'] });
    });

    it('accepts JSON sidecars for complex array payloads', () => {
        const { args } = mapFlagsToArgs([
            '--assets-json',
            '[{"type":"image","content":"/assets/a.png"}]',
        ], schema);

        expect(args).toEqual({
            assets: [{ type: 'image', content: '/assets/a.png' }],
        });
    });

    it('does not inject implicit false booleans when a flag is absent', () => {
        const { args } = mapFlagsToArgs(['--item-id', 'milk'], schema);

        expect(args).toEqual({ item_id: 'milk' });
        expect(args).not.toHaveProperty('checked');
    });

    it('maps flags from oneOf action branches', () => {
        const oneOfSchema = {
            type: 'object',
            properties: {
                action: { type: 'string', enum: ['create', 'set_open_state', 'help'] },
                topic: { type: 'string' },
            },
            oneOf: [
                {
                    type: 'object',
                    properties: {
                        action: { type: 'string', const: 'create' },
                        name: { type: 'string' },
                    },
                    required: ['action', 'name'],
                },
                {
                    type: 'object',
                    properties: {
                        action: { type: 'string', const: 'set_open_state' },
                        notebook: { type: 'string' },
                        opened: { type: 'boolean' },
                    },
                    required: ['action', 'notebook', 'opened'],
                },
            ],
        };

        const { args, warnings } = mapFlagsToArgs(['--notebook', 'nb-1', '--opened'], oneOfSchema);

        expect(args).toEqual({ notebook: 'nb-1', opened: true });
        expect(warnings).toEqual([]);
    });
});

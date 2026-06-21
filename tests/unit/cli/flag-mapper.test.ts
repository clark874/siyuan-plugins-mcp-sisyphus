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

const blockSchema = {
    type: 'object',
    properties: {
        action: { type: 'string' },
        parentID: { type: 'string' },
        id: { type: 'string' },
        dataType: { type: 'string' },
        data: { type: 'string' },
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

    it.each([
        '- [ ] 收拾行李',
        '- [X] 已完成',
        '- 列表项',
    ])('preserves block append data that starts with a markdown list marker: %s', (data) => {
        const { args, warnings } = mapFlagsToArgs([
            '--parent-id', 'doc-1',
            '--data-type', 'markdown',
            '--data', data,
        ], blockSchema, { category: 'block', action: 'append' });

        expect(args).toEqual({
            parentID: 'doc-1',
            dataType: 'markdown',
            data,
        });
        expect(warnings).toEqual([]);
    });

    it('preserves block update data that starts with a markdown list marker', () => {
        const { args, warnings } = mapFlagsToArgs([
            '--id', 'block-1',
            '--data-type', 'markdown',
            '--data', '- [ ] 收拾行李',
        ], blockSchema, { category: 'block', action: 'update' });

        expect(args).toEqual({
            id: 'block-1',
            dataType: 'markdown',
            data: '- [ ] 收拾行李',
        });
        expect(warnings).toEqual([]);
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

    it('accepts action-specific fs replace shorthand flags', () => {
        const fsSchema = {
            type: 'object',
            properties: {
                action: { type: 'string' },
                path: { type: 'string' },
                edit: { type: 'object' },
            },
        };

        const { args, warnings } = mapFlagsToArgs([
            '--path', '/Notebook/Doc',
            '--old', 'A',
            '--new', 'B',
            '--replace-all',
        ], fsSchema, { category: 'fs', action: 'replace' });

        expect(args).toEqual({
            path: '/Notebook/Doc',
            old: 'A',
            new: 'B',
            replace_all: true,
        });
        expect(warnings).toEqual([]);
    });

    it('maps avID and single block id aliases to canonical fields', () => {
        const avSchema = {
            type: 'object',
            properties: {
                action: { type: 'string' },
                id: { type: 'string' },
            },
        };
        const blockSchema = {
            type: 'object',
            properties: {
                action: { type: 'string' },
                ids: { type: 'array', items: { type: 'string' } },
            },
        };

        expect(mapFlagsToArgs(['--av-id', 'av-1'], avSchema, { category: 'av', action: 'render' }).args)
            .toEqual({ id: 'av-1' });
        expect(mapFlagsToArgs(['--id', 'block-1'], blockSchema, { category: 'block', action: 'word_count' }).args)
            .toEqual({ ids: ['block-1'] });
    });
});

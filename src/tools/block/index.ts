import type { BlockAction } from '../../core/config';
import { BLOCK_ACTION_HINTS, BLOCK_GUIDANCE } from '../../core/help';
import { BlockActionSchema } from '../../core/types';
import { defineTool } from '../define-tool';
import { createActionSchema, type ActionVariant } from '../shared';
import { BLOCK_ACTION_HANDLERS } from './handlers';

export const BLOCK_TOOL_NAME = 'block';

export const BLOCK_VARIANTS: ActionVariant<BlockAction>[] = [
    {
        action: 'insert',
        schema: createActionSchema('insert', {
            dataType: { type: 'string', enum: ['markdown', 'dom'], description: 'Data format' },
            data: { type: 'string', description: 'Block content' },
            nextID: { type: 'string', description: 'Next block ID' },
            previousID: { type: 'string', description: 'Previous block ID' },
            parentID: { type: 'string', description: 'Parent block or document ID' },
            blocks: {
                type: 'array',
                description: 'Blocks to insert. Item-level anchors override top-level parentID/previousID/nextID.',
                items: {
                    type: 'object',
                    properties: {
                        dataType: { type: 'string', enum: ['markdown', 'dom'] },
                        data: { type: 'string' },
                        nextID: { type: 'string' },
                        previousID: { type: 'string' },
                        parentID: { type: 'string' },
                    },
                    required: ['dataType', 'data'],
                },
            },
        }, [], 'Insert one or more blocks at the specified position.'),
    },
    {
        action: 'prepend',
        schema: createActionSchema('prepend', {
            dataType: { type: 'string', enum: ['markdown', 'dom'], description: 'Data format' },
            data: { type: 'string', description: 'Block content' },
            parentID: { type: 'string', description: 'Parent block or document ID' },
        }, ['dataType', 'data', 'parentID'], 'Insert a block at the beginning of a parent.'),
    },
    {
        action: 'append',
        schema: createActionSchema('append', {
            dataType: { type: 'string', enum: ['markdown', 'dom'], description: 'Data format' },
            data: { type: 'string', description: 'Block content' },
            parentID: { type: 'string', description: 'Parent block or document ID' },
        }, ['dataType', 'data', 'parentID'], 'Insert a block at the end of a parent.'),
    },
    {
        action: 'update',
        schema: createActionSchema('update', {
            dataType: { type: 'string', enum: ['markdown', 'dom'], description: 'Data format' },
            data: { type: 'string', description: 'New block content' },
            id: { type: 'string', description: 'Block ID' },
            items: {
                type: 'array',
                description: 'Blocks to update',
                items: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        dataType: { type: 'string', enum: ['markdown', 'dom'] },
                        data: { type: 'string' },
                    },
                    required: ['id', 'dataType', 'data'],
                },
            },
        }, [], 'Update one or more blocks.'),
    },
    {
        action: 'delete',
        schema: createActionSchema('delete', {
            id: { type: 'string', description: 'Block ID' },
        }, ['id'], 'Delete a block by ID.'),
    },
    {
        action: 'move',
        schema: createActionSchema('move', {
            id: { type: 'string', description: 'Block ID' },
            previousID: { type: 'string', description: 'Previous block ID' },
            parentID: { type: 'string', description: 'New parent block ID' },
        }, ['id'], 'Move a block to a new position.'),
    },
    {
        action: 'set_fold_state',
        schema: createActionSchema('set_fold_state', {
            id: { type: 'string', description: 'Foldable block ID' },
            folded: { type: 'boolean', description: 'true to fold, false to unfold' },
        }, ['id', 'folded'], 'Set the fold state of a foldable block.'),
    },
    {
        action: 'get_kramdown',
        schema: createActionSchema('get_kramdown', {
            id: { type: 'string', description: 'Block ID or document ID' },
        }, ['id'], 'Get block content in kramdown format.'),
    },
    {
        action: 'get_children',
        schema: createActionSchema('get_children', {
            id: { type: 'string', description: 'Block ID or document ID' },
            page: { type: 'number', description: 'Page number (1-based), default 1' },
            pageSize: { type: 'number', description: 'Items per page, default 50' },
        }, ['id'], 'Get child blocks of a parent with pagination support.'),
    },
    {
        action: 'transfer_references',
        schema: createActionSchema('transfer_references', {
            fromID: { type: 'string', description: 'Source block ID' },
            toID: { type: 'string', description: 'Target block ID' },
            refIDs: { type: 'array', items: { type: 'string' }, description: 'Reference block IDs' },
        }, ['fromID', 'toID'], 'Transfer block references from one block to another.'),
    },
    {
        action: 'set_attrs',
        schema: createActionSchema('set_attrs', {
            id: { type: 'string', description: 'Block ID' },
            attrs: {
                type: 'object',
                description: 'Block attributes',
                additionalProperties: { type: 'string' },
            },
        }, ['id', 'attrs'], 'Set block attributes.'),
    },
    {
        action: 'get_attrs',
        schema: createActionSchema('get_attrs', {
            id: { type: 'string', description: 'Block ID' },
        }, ['id'], 'Get block attributes.'),
    },
    {
        action: 'info',
        schema: createActionSchema('info', {
            id: { type: 'string', description: 'Block ID' },
        }, ['id'], 'Get block position and root document metadata.'),
    },
    {
        action: 'breadcrumb',
        schema: createActionSchema('breadcrumb', {
            id: { type: 'string', description: 'Block ID' },
            excludeTypes: { type: 'array', items: { type: 'string' }, description: 'Optional block types to exclude' },
        }, ['id'], 'Get the breadcrumb path for a block.'),
    },
    {
        action: 'dom',
        schema: createActionSchema('dom', {
            id: { type: 'string', description: 'Block ID' },
        }, ['id'], 'Get rendered DOM for a block.'),
    },
    {
        action: 'recent_updated',
        schema: createActionSchema('recent_updated', {
            count: { type: 'number', description: 'Maximum number of recent blocks to return' },
        }, [], 'Get recently updated blocks.'),
    },
    {
        action: 'word_count',
        schema: createActionSchema('word_count', {
            ids: { type: 'array', items: { type: 'string' }, description: 'One or more block IDs' },
        }, ['ids'], 'Get word-count statistics for blocks.'),
    },
    {
        action: 'add_to_daily_note',
        schema: createActionSchema('add_to_daily_note', {
            notebook: { type: 'string', description: 'Notebook ID' },
            dataType: { type: 'string', enum: ['markdown', 'dom'], description: 'Data format' },
            data: { type: 'string', description: 'Block content' },
            position: { type: 'string', enum: ['append', 'prepend'], description: 'Where to add content in the daily note' },
        }, ['notebook', 'dataType', 'data', 'position'], 'Add a block to today\'s daily note, creating the note if needed.'),
    },
    {
        action: 'docs_info',
        schema: createActionSchema('docs_info', {
            ids: { type: 'array', items: { type: 'string' }, description: 'Document IDs' },
            id: { type: 'string', description: 'Single document or block ID' },
            refCount: { type: 'boolean', description: 'When true, include reference counts' },
            av: { type: 'boolean', description: 'When true, include AV metadata' },
        }, ['ids'], 'Get document info for multiple documents.'),
    },
];

const blockTool = defineTool<BlockAction>({
    name: 'block',
    description: '\ud83e\uddf1 Grouped block operations.',
    variants: BLOCK_VARIANTS,
    actionSchema: BlockActionSchema,
    aggregateOptions: {
        guidance: BLOCK_GUIDANCE,
        actionHints: BLOCK_ACTION_HINTS,
        propertyDescriptionOverrides: {
            parentID: 'Parent block or document ID. With prepend/append, a document ID targets the document head or tail; a block ID targets that block\'s child list.',
            previousID: 'Sibling block ID to position after. For block(action="move"), provide previousID, parentID, or both to describe the destination. Successful moves return a structured success object.',
        },
    },
    handlers: BLOCK_ACTION_HANDLERS,
});

export const listBlockTools = blockTool.listTools;
export const callBlockTool = blockTool.callTool;

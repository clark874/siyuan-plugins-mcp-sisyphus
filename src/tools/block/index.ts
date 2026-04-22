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
        }, ['dataType', 'data'], 'Insert a new block at the specified position.'),
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
        }, ['dataType', 'data', 'id'], 'Update block content.'),
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
        action: 'transfer_ref',
        schema: createActionSchema('transfer_ref', {
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
        action: 'exists',
        schema: createActionSchema('exists', {
            id: { type: 'string', description: 'Block ID' },
        }, ['id'], 'Check whether a block exists.'),
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
        action: 'batch_insert',
        schema: createActionSchema('batch_insert', {
            blocks: {
                type: 'array',
                description: 'Blocks to insert',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        dataType: { type: 'string', enum: ['markdown', 'dom'], description: 'Data format' },
                        data: { type: 'string', description: 'Block content' },
                        nextID: { type: 'string', description: 'Next block ID' },
                        previousID: { type: 'string', description: 'Previous block ID' },
                        parentID: { type: 'string', description: 'Parent block or document ID' },
                    },
                    required: ['dataType', 'data'],
                },
            },
        }, ['blocks'], 'Insert multiple blocks in one request.'),
    },
    {
        action: 'batch_update',
        schema: createActionSchema('batch_update', {
            blocks: {
                type: 'array',
                description: 'Blocks to update',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        id: { type: 'string', description: 'Block ID' },
                        dataType: { type: 'string', enum: ['markdown', 'dom'], description: 'Data format' },
                        data: { type: 'string', description: 'Replacement block content' },
                    },
                    required: ['id', 'dataType', 'data'],
                },
            },
        }, ['blocks'], 'Update multiple blocks in one request.'),
    },
    {
        action: 'append_daily_note',
        schema: createActionSchema('append_daily_note', {
            notebook: { type: 'string', description: 'Notebook ID' },
            dataType: { type: 'string', enum: ['markdown', 'dom'], description: 'Data format' },
            data: { type: 'string', description: 'Block content' },
        }, ['notebook', 'dataType', 'data'], 'Append a block to today\u2019s daily note, creating the note if needed.'),
    },
    {
        action: 'prepend_daily_note',
        schema: createActionSchema('prepend_daily_note', {
            notebook: { type: 'string', description: 'Notebook ID' },
            dataType: { type: 'string', enum: ['markdown', 'dom'], description: 'Data format' },
            data: { type: 'string', description: 'Block content' },
        }, ['notebook', 'dataType', 'data'], 'Prepend a block to today\u2019s daily note, creating the note if needed.'),
    },
    {
        action: 'doc_info',
        schema: createActionSchema('doc_info', {
            id: { type: 'string', description: 'Block ID or document ID' },
        }, ['id'], 'Get owning document info for a block or document ID.'),
    },
    {
        action: 'docs_info',
        schema: createActionSchema('docs_info', {
            ids: { type: 'array', items: { type: 'string' }, description: 'Document IDs' },
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

import * as tagApi from '../api/tag';
import * as searchApi from '../api/search';
import type { TagAction } from '../core/config';
import { TAG_ACTION_HINTS, TAG_GUIDANCE } from '../core/help';
import {
    TagActionSchema,
    TagListSchema,
    TagRemoveSchema,
    TagRenameSchema,
} from '../core/types';
import { defineTool } from './define-tool';
import { createActionSchema, createJsonResult, type ActionVariant } from './shared';
import { applyUiRefresh } from './ui-refresh';

export const TAG_TOOL_NAME = 'tag';

export const TAG_VARIANTS: ActionVariant<TagAction>[] = [
    {
        action: 'list',
        schema: createActionSchema('list', {
            sort: { type: 'number', description: 'Optional tag sort mode' },
            keyword: { type: 'string', description: 'Optional keyword used to search/filter tags' },
            query: { type: 'string', description: 'Alias for keyword' },
            ignoreMaxListHint: { type: 'boolean', description: 'Ignore SiYuan max list hint' },
            app: { type: 'string', description: 'Optional app identifier passed through to SiYuan' },
        }, [], 'List tags in the workspace.'),
    },
    {
        action: 'rename',
        schema: createActionSchema('rename', {
            oldLabel: { type: 'string', description: 'Existing tag label' },
            newLabel: { type: 'string', description: 'New tag label' },
        }, ['oldLabel', 'newLabel'], 'Rename a tag.'),
    },
    {
        action: 'remove',
        schema: createActionSchema('remove', {
            label: { type: 'string', description: 'Tag label to remove' },
        }, ['label'], 'Remove a tag.'),
    },
];

const tagTool = defineTool<TagAction>({
    name: 'tag',
    description: '🏷️ Grouped tag operations.',
    variants: TAG_VARIANTS,
    actionSchema: TagActionSchema,
    aggregateOptions: {
        guidance: TAG_GUIDANCE,
        actionHints: TAG_ACTION_HINTS,
    },
    handlers: {
        list: async ({ client, rawArgs }) => {
            const parsed = TagListSchema.parse(rawArgs);
            const keyword = parsed.query ?? parsed.keyword;
            if (keyword && keyword.trim().length > 0) {
                const result = await searchApi.searchTag(client, keyword);
                const typedResult = result && typeof result === 'object' ? result as Record<string, unknown> : {};
                const tags = Array.isArray(typedResult.tags) ? typedResult.tags : [];
                return createJsonResult({
                    ...typedResult,
                    resolvedArgs: { keyword },
                    ...(tags.length === 0 ? {
                        warning: 'No matching tags were found. If the tag was just created, SiYuan tag indexing may still be catching up; verify the markdown uses #tag# syntax and retry shortly.',
                    } : {}),
                });
            }
            const result = await tagApi.listTags(client, parsed);
            return createJsonResult(result);
        },
        rename: async ({ client, rawArgs }) => {
            const parsed = TagRenameSchema.parse(rawArgs);
            await tagApi.renameTag(client, parsed.oldLabel, parsed.newLabel);
            return applyUiRefresh(
                client,
                createJsonResult({ success: true, oldLabel: parsed.oldLabel, newLabel: parsed.newLabel }),
                [{ type: 'reloadTag' }],
            );
        },
        remove: async ({ client, rawArgs }) => {
            const parsed = TagRemoveSchema.parse(rawArgs);
            await tagApi.removeTag(client, parsed.label);
            return applyUiRefresh(
                client,
                createJsonResult({ success: true, label: parsed.label }),
                [{ type: 'reloadTag' }],
            );
        },
    },
});

export const listTagTools = tagTool.listTools;
export const callTagTool = tagTool.callTool;

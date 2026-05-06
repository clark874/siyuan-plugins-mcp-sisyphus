import { getActionTier, getEnabledActions, isDangerousAction, type CategoryToolConfig, type ToolCategory } from '../../core/config';
import { buildActionUsageSummary, buildParameterContract } from './help-render';
import {
    getSchemaProperties,
    getSchemaRequired,
    mergePropertySchemas,
    normalizeJsonSchema,
} from './schema-analyzer';
import type { ActionVariant, AggregatedToolOptions, JsonSchema } from './types';

export function createActionSchema(
    action: string,
    properties: JsonSchema,
    required: string[],
    description?: string,
): JsonSchema {
    return {
        type: 'object',
        additionalProperties: false,
        description,
        properties: {
            action: {
                type: 'string',
                const: action,
                description: 'Action to perform',
            },
            ...properties,
        },
        required: ['action', ...required],
    };
}

function buildEssentialGuidance<Action extends string>(
    category: ToolCategory,
    actionList: Action[],
    options: AggregatedToolOptions<Action>,
): string[] {
    const notes: string[] = [];

    const guidanceInlineLimit = options.guidanceInlineLimit ?? 2;

    // Only include the configured number of top guidance lines (most critical context)
    const guidance = options.guidance ?? [];
    notes.push(...guidance.slice(0, guidanceInlineLimit));

    const confirmationActions = actionList.filter((action) => isDangerousAction(category, action));
    if (confirmationActions.length > 0) {
        notes.push(`Requires user confirmation before: ${confirmationActions.join(', ')}.`);
    }

    // Action hints are no longer inlined — available via siyuan://help/action/{tool}/{action}

    return notes;
}

function buildTieredDescription<Action extends string>(
    category: ToolCategory,
    description: string,
    enabledActions: Action[],
    enabledVariants: ActionVariant<Action>[],
    options: AggregatedToolOptions<Action>,
): string {
    const basicActions = enabledActions.filter((a) => getActionTier(category, a) === 'basic');
    const advancedActions = enabledActions.filter((a) => getActionTier(category, a) === 'advanced');

    const basicVariants = enabledVariants.filter((v) => basicActions.includes(v.action));
    const basicUsageSummary = buildActionUsageSummary(basicVariants);

    const parts = [
        `${description} Use the "action" field to select the operation.`,
    ];

    if (basicActions.length > 0) {
        parts.push(`Common actions: ${basicActions.join(', ')}. Required fields: ${basicUsageSummary}.`);
    }

    if (advancedActions.length > 0) {
        parts.push(`Additional actions: ${advancedActions.join(', ')}. Read siyuan://help/action/${category}/{action} for details, or call action="help" if resources are unavailable.`);
    }

    const contract = buildParameterContract(category, enabledVariants);
    if (contract.length > 0) {
        parts.push(`Parameter contract per action (fields outside the action's optional list should not be sent):\n${contract}`);
    }

    const guidance = buildEssentialGuidance(category, enabledActions, options);
    if (guidance.length > 0) {
        parts.push(guidance.join(' '));
    }

    return parts.join('\n\n');
}

export function buildAggregatedTool<Action extends string>(
    category: ToolCategory,
    description: string,
    config: CategoryToolConfig<Action>,
    variants: ActionVariant<Action>[],
    options: AggregatedToolOptions<Action> = {},
) {
    if (!config.enabled) return [];

    const enabledActions = getEnabledActions(config) as Action[];
    const enabledActionSet = new Set(enabledActions);
    const enabledVariants = variants.filter((variant) => enabledActionSet.has(variant.action));
    if (enabledVariants.length === 0) return [];

    const fullDescription = buildTieredDescription(category, description, enabledActions, enabledVariants, options);
    const confirmationActions = enabledActions.filter((action) => isDangerousAction(category, action));

    const mergedProperties = mergePropertySchemas(enabledVariants, options.propertyDescriptionOverrides);
    // `topic` is a help-only selector; merge it in without clobbering any action-specific property.
    if (!('topic' in mergedProperties)) {
        mergedProperties.topic = {
            type: 'string',
            description: 'Optional. Only used when action="help". Pass an action name (e.g. "create") to get per-action help; omit or use "overview" for the action index.',
        };
    }

    return [{
        name: category,
        description: fullDescription,
        inputSchema: normalizeJsonSchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                action: {
                    type: 'string',
                    enum: [...enabledActions, 'help'],
                    description: `Action to perform. Supported values: ${enabledActions.join(', ')}. Use action="help" for the action index, or action="help" with topic="<actionName>" for per-action details.${confirmationActions.length > 0 ? ` User confirmation is required before calling: ${confirmationActions.join(', ')}.` : ''}`,
                },
                ...mergedProperties,
            },
            required: ['action'],
        }),
    }];
}

import type { CategoryToolConfig, ToolCategory } from '../core/config';
import { getEnabledActions } from '../core/config';
import { buildActionHelp, buildHelpIndex } from './help-render';
import { createJsonResult } from './result-factory';
import type { ActionVariant, ToolResult } from './types';

export function tryHandleHelpAction<Action extends string>(
    category: ToolCategory,
    rawArgs: Record<string, unknown>,
    config: CategoryToolConfig<Action>,
    variants: ActionVariant<Action>[],
): ToolResult | null {
    if (rawArgs.action !== 'help') return null;

    const enabledActions = getEnabledActions(config) as Action[];
    const enabledSet = new Set(enabledActions);
    const enabledVariants = variants.filter((v) => enabledSet.has(v.action));

    const rawTopic = typeof rawArgs.topic === 'string' ? rawArgs.topic.trim() : '';
    const topic = rawTopic && rawTopic !== 'overview' ? rawTopic : null;

    if (topic) {
        if (!enabledSet.has(topic as Action)) {
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        error: {
                            type: 'unknown_help_topic',
                            message: `Unknown help topic "${topic}" for tool "${category}".`,
                            tool: category,
                            topic,
                            validTopics: [...enabledActions],
                            hint: `Call ${category}(action="help") without topic to see the action index.`,
                        },
                    }, null, 2),
                }],
                isError: true,
            };
        }
        return createJsonResult(buildActionHelp(category, topic as Action, enabledVariants));
    }

    return createJsonResult(buildHelpIndex(category, enabledActions, enabledVariants));
}

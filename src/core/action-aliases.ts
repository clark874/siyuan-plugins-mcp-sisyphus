import { ACTIONS_BY_CATEGORY, type ToolCategory } from './config';

const COMMON_ACTION_ALIASES: Record<string, string[]> = {
    list: ['ls'],
    ls: ['list'],
    move: ['mv'],
    mv: ['move'],
    remove: ['rm', 'delete'],
    rm: ['remove', 'delete'],
    delete: ['rm', 'remove'],
    del: ['delete', 'rm', 'remove'],
};

export function normalizeActionAlias(category: ToolCategory, action: string): string {
    const normalized = action.replace(/-/g, '_');
    const actions = ACTIONS_BY_CATEGORY[category] as readonly string[];
    if (actions.includes(normalized)) return normalized;

    const candidates = COMMON_ACTION_ALIASES[normalized] ?? [];
    return candidates.find((candidate) => actions.includes(candidate)) ?? normalized;
}

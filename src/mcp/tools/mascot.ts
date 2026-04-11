import type { SiYuanClient } from '../../api/client';
import type { CategoryToolConfig, MascotAction } from '../config';
import { MASCOT_ACTION_HINTS, MASCOT_GUIDANCE } from '../help';
import type { PermissionManager } from '../permissions';
import { readPuppyStats, spendPuppyBalance } from '../puppy-state';
import {
    MascotActionSchema,
    MascotBuySchema,
    MascotGetBalanceSchema,
    MascotShopSchema,
} from '../types';
import { buildAggregatedTool, createActionSchema, createDisabledActionResult, createErrorResult, createJsonResult, tryHandleHelpAction, type ActionVariant, type ToolResult } from './shared';

export const MASCOT_TOOL_NAME = 'mascot';
export const SHOP_ITEMS = [
    { id: 'cat-food', label: 'Cat Food', cost: 5, type: 'food', emoji: '🍖' },
    { id: 'milk', label: 'Milk', cost: 3, type: 'drink', emoji: '🥛' },
    { id: 'dried-fish', label: 'Dried Fish', cost: 4, type: 'food', emoji: '🐟' },
    { id: 'can-food', label: 'Canned Food', cost: 6, type: 'food', emoji: '🥫' },
    { id: 'catnip', label: 'Catnip', cost: 5, type: 'snack', emoji: '🌿' },
    { id: 'chicken-leg', label: 'Chicken Leg', cost: 7, type: 'food', emoji: '🍗' },
    { id: 'cheese', label: 'Cheese', cost: 4, type: 'snack', emoji: '🧀' },
] as const;
export const FOOD_ITEM = SHOP_ITEMS[0];
export const DRINK_ITEM = SHOP_ITEMS[1];

function getShopItem(itemId: string) {
    return SHOP_ITEMS.find((item) => item.id === itemId) ?? null;
}

export const MASCOT_VARIANTS: ActionVariant<MascotAction>[] = [
    {
        action: 'get_balance',
        schema: createActionSchema('get_balance', {}, [], 'Get the mascot balance. Every successful MCP tool call earns 1 coin.'),
    },
    {
        action: 'shop',
        schema: createActionSchema('shop', {}, [], 'List the mascot shop inventory.'),
    },
    {
        action: 'buy',
        schema: createActionSchema('buy', {
            item_id: { type: 'string', description: 'Stable shop item ID returned by mascot(action="shop")' },
        }, ['item_id'], 'Buy one item from the mascot shop.'),
    },
];

export function listMascotTools(config: CategoryToolConfig<MascotAction>) {
    return buildAggregatedTool(
        MASCOT_TOOL_NAME,
        '🐾 Grouped mascot balance and care operations. Every successful MCP tool call earns 1 coin for the mascot.',
        config,
        MASCOT_VARIANTS,
        {
            guidance: MASCOT_GUIDANCE,
            actionHints: MASCOT_ACTION_HINTS,
        },
    );
}

export async function callMascotTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<MascotAction>,
    _permMgr: PermissionManager,
): Promise<ToolResult> {
    const rawArgs = args ?? {};
    const action = typeof rawArgs.action === 'string' ? rawArgs.action : undefined;

    const helpResult = tryHandleHelpAction(MASCOT_TOOL_NAME, rawArgs, config, MASCOT_VARIANTS);
    if (helpResult) return helpResult;

    try {
        const parsedAction = MascotActionSchema.parse(rawArgs.action);
        if (!config.enabled || !config.actions[parsedAction]) {
            return createDisabledActionResult(MASCOT_TOOL_NAME, parsedAction);
        }

        switch (parsedAction) {
            case 'get_balance': {
                MascotGetBalanceSchema.parse(rawArgs);
                const stats = await readPuppyStats(client);
                return createJsonResult({
                    action: parsedAction,
                    balance: stats.balance,
                    totalEarned: stats.totalCalls,
                });
            }
            case 'shop': {
                MascotShopSchema.parse(rawArgs);
                return createJsonResult({
                    action: parsedAction,
                    items: SHOP_ITEMS,
                });
            }
            case 'buy': {
                const parsed = MascotBuySchema.parse(rawArgs);
                const item = getShopItem(parsed.item_id);
                if (!item) {
                    throw new Error(`Unknown mascot shop item: ${parsed.item_id}.`);
                }

                const stats = await spendPuppyBalance(client, item.cost, `${parsedAction}:${item.id}`);
                return createJsonResult({
                    success: true,
                    action: parsedAction,
                    item_id: item.id,
                    item: item.label,
                    type: item.type,
                    emoji: item.emoji,
                    cost: item.cost,
                    balance: stats.balance,
                    totalEarned: stats.totalCalls,
                });
            }
            default: {
                const _exhaustive: never = parsedAction;
                return createErrorResult(new Error(`Unknown action: ${_exhaustive}`), { tool: MASCOT_TOOL_NAME, action, rawArgs });
            }
        }
    } catch (error) {
        return createErrorResult(error, { tool: MASCOT_TOOL_NAME, action, rawArgs });
    }
}

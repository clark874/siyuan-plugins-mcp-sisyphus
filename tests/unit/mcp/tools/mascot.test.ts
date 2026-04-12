import { describe, expect, it, vi } from 'vitest';

import { callMascotTool, DRINK_ITEM, FOOD_ITEM, SHOP_ITEMS } from '@/mcp/tools/mascot';

describe('mascot tool', () => {
    const config = {
        enabled: true,
        actions: {
            get_balance: true,
            shop: true,
            buy: true,
        },
    } as const;

    it('returns current balance for get_balance', async () => {
        const client = {
            readFile: vi.fn().mockResolvedValue(JSON.stringify({ totalCalls: 9, balance: 6, updatedAt: 1 })),
        };

        const result = await callMascotTool(client as any, { action: 'get_balance' }, config as any, {} as any);

        expect(result.isError).toBeUndefined();
        expect(JSON.parse(result.content[0].text)).toEqual({
            action: 'get_balance',
            balance: 6,
            totalEarned: 9,
        });
    });

    it('lists current shop items', async () => {
        const client = {
            readFile: vi.fn(),
            writeFile: vi.fn(),
        };

        const result = await callMascotTool(client as any, { action: 'shop' }, config as any, {} as any);

        expect(JSON.parse(result.content[0].text)).toEqual({
            action: 'shop',
            items: SHOP_ITEMS,
        });
        expect(SHOP_ITEMS).toHaveLength(7);
        expect(new Set(SHOP_ITEMS.map((item) => item.emoji)).size).toBe(7);
    });

    it('explains how mascot coins are earned in help output', async () => {
        const client = {
            readFile: vi.fn(),
            writeFile: vi.fn(),
        };

        const result = await callMascotTool(client as any, { action: 'help' }, config as any, {} as any);
        const payload = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(payload.guidance).toContain('Every successful MCP tool call earns 1 coin for the cat, so the fastest way to earn balance is simply to keep using SiYuan MCP tools.');
        expect(payload.actions.get_balance.hint).toContain('Each successful MCP tool call adds 1 coin');
    });

    it('spends balance for purchases and persists updated stats', async () => {
        const client = {
            readFile: vi.fn().mockResolvedValue(JSON.stringify({ totalCalls: 9, balance: 8, updatedAt: 1 })),
            writeFile: vi.fn().mockResolvedValue(undefined),
        };

        const foodResult = await callMascotTool(client as any, { action: 'buy', item_id: FOOD_ITEM.id }, config as any, {} as any);
        const drinkResult = await callMascotTool(client as any, { action: 'buy', item_id: DRINK_ITEM.id }, config as any, {} as any);

        expect(JSON.parse(foodResult.content[0].text)).toMatchObject({
            success: true,
            item_id: FOOD_ITEM.id,
            item: FOOD_ITEM.label,
            cost: FOOD_ITEM.cost,
            balance: 3,
        });
        expect(JSON.parse(drinkResult.content[0].text)).toMatchObject({
            success: true,
            item_id: DRINK_ITEM.id,
            item: DRINK_ITEM.label,
            cost: DRINK_ITEM.cost,
            balance: 5,
        });
        expect(client.writeFile).toHaveBeenCalledTimes(2);
    });

    it('returns an error when balance is insufficient', async () => {
        const client = {
            readFile: vi.fn().mockResolvedValue(JSON.stringify({ totalCalls: 2, balance: 1, updatedAt: 1 })),
            writeFile: vi.fn(),
        };

        const result = await callMascotTool(client as any, { action: 'buy', item_id: FOOD_ITEM.id }, config as any, {} as any);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Insufficient mascot balance');
        expect(client.writeFile).not.toHaveBeenCalled();
    });

    it('returns an error for unknown item ids', async () => {
        const client = {
            readFile: vi.fn().mockResolvedValue(JSON.stringify({ totalCalls: 2, balance: 10, updatedAt: 1 })),
            writeFile: vi.fn(),
        };

        const result = await callMascotTool(client as any, { action: 'buy', item_id: 'unknown-item' }, config as any, {} as any);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Unknown mascot shop item');
        expect(client.writeFile).not.toHaveBeenCalled();
    });
});

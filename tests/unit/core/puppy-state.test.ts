import { describe, expect, it, vi } from 'vitest';

import {
    PUPPY_EVENTS_PATH,
    PUPPY_STATS_PATH,
    earnPuppyBalance,
    parsePuppyStats,
    readPuppyStats,
    spendPuppyBalance,
    writePuppyEvent,
    writePuppyStats,
} from '@/core/puppy-state';

function createClient(content = '') {
    return {
        readFile: vi.fn(async () => content),
        writeFile: vi.fn(async () => undefined),
    } as any;
}

describe('core/puppy-state', () => {
    it('parses empty, invalid, legacy, and fractional stats defensively', () => {
        expect(parsePuppyStats('')).toEqual({ totalCalls: 0, balance: 0, updatedAt: 0 });
        expect(parsePuppyStats('not json')).toEqual({ totalCalls: 0, balance: 0, updatedAt: 0 });
        expect(parsePuppyStats(JSON.stringify({ totalCalls: 3, updatedAt: 9 }))).toEqual({
            totalCalls: 3,
            balance: 3,
            updatedAt: 9,
        });
        expect(parsePuppyStats(JSON.stringify({
            totalCalls: 2.9,
            balance: -1,
            updatedAt: Number.NaN,
            lastAction: 'system.get_version',
        }))).toEqual({
            totalCalls: 2,
            balance: 0,
            updatedAt: 0,
            lastAction: 'system.get_version',
        });
    });

    it('reads and writes normalized stats through SiYuan file APIs', async () => {
        const client = createClient(JSON.stringify({ totalCalls: 1, balance: 2, updatedAt: 3 }));

        await expect(readPuppyStats(client)).resolves.toEqual({ totalCalls: 1, balance: 2, updatedAt: 3 });
        await expect(writePuppyStats(client, {
            totalCalls: 4.8,
            balance: Number.POSITIVE_INFINITY,
            updatedAt: 7,
            lastAction: 'mascot.buy',
        })).resolves.toEqual({
            totalCalls: 4,
            balance: 0,
            updatedAt: 7,
            lastAction: 'mascot.buy',
        });

        expect(client.readFile).toHaveBeenCalledWith(PUPPY_STATS_PATH);
        expect(client.writeFile).toHaveBeenCalledWith(PUPPY_STATS_PATH, JSON.stringify({
            totalCalls: 4,
            balance: 0,
            updatedAt: 7,
            lastAction: 'mascot.buy',
        }));
    });

    it('increments balance but returns previous stats if persistence fails', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(99);
        const client = createClient(JSON.stringify({ totalCalls: 2, balance: 5, updatedAt: 1 }));

        await expect(earnPuppyBalance(client, 'notebook.list')).resolves.toEqual({
            totalCalls: 3,
            balance: 6,
            updatedAt: 99,
            lastAction: 'notebook.list',
        });

        client.writeFile.mockRejectedValueOnce(new Error('write failed'));
        await expect(earnPuppyBalance(client, 'system.conf')).resolves.toEqual({
            totalCalls: 2,
            balance: 5,
            updatedAt: 1,
        });
    });

    it('spends balance or throws a clear insufficient-balance error', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(100);
        const client = createClient(JSON.stringify({ totalCalls: 8, balance: 3, updatedAt: 1 }));

        await expect(spendPuppyBalance(client, 2.9, 'buy')).resolves.toEqual({
            totalCalls: 8,
            balance: 1,
            updatedAt: 100,
            lastAction: 'buy',
        });

        await expect(spendPuppyBalance(client, 4, 'buy')).rejects.toThrow('Insufficient mascot balance. Need 4, have 3.');
    });

    it('writes puppy events with sequence metadata and silently ignores failures', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(123);
        const client = createClient();

        await writePuppyEvent(client, {
            tool: 'system',
            action: 'get_version',
            status: 'success',
            totalCalls: 1,
            balance: 1,
        });

        expect(client.writeFile).toHaveBeenCalledWith(PUPPY_EVENTS_PATH, JSON.stringify({
            tool: 'system',
            action: 'get_version',
            status: 'success',
            totalCalls: 1,
            balance: 1,
            seq: 123,
            ts: 123,
        }));

        client.writeFile.mockRejectedValueOnce(new Error('ignored'));
        await expect(writePuppyEvent(client, {
            tool: 'system',
            action: 'conf',
            status: 'error',
            totalCalls: 1,
            balance: 1,
        })).resolves.toBeUndefined();
    });
});

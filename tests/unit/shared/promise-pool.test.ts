import { describe, expect, it } from 'vitest';

import PromiseLimitPool from '@/shared/promise-pool';

describe('shared/promise-pool', () => {
    it('limits concurrent execution and preserves result order', async () => {
        const pool = new PromiseLimitPool<number>(2);
        let running = 0;
        let maxRunning = 0;

        for (const value of [1, 2, 3]) {
            pool.add(async () => {
                running += 1;
                maxRunning = Math.max(maxRunning, running);
                await new Promise<void>((resolve) => setTimeout(resolve, 5));
                running -= 1;
                return value;
            });
        }

        await expect(pool.awaitAll()).resolves.toEqual([1, 2, 3]);
        expect(maxRunning).toBe(2);
    });

    it('rejects when any queued task rejects', async () => {
        const pool = new PromiseLimitPool<number>(1);
        pool.add(async () => 1);
        pool.add(async () => {
            throw new Error('failed');
        });

        await expect(pool.awaitAll()).rejects.toThrow('failed');
    });
});

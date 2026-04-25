import type { SiYuanClient } from '../api/client';

export const PUPPY_EVENTS_PATH = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/puppyEvents.json';
export const PUPPY_STATS_PATH = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/puppyStats.json';

export interface PuppyEvent {
    seq: number;
    tool: string;
    action: string;
    status: 'running' | 'success' | 'error';
    ts: number;
    totalCalls: number;
    balance: number;
    itemId?: string;
    itemLabel?: string;
    itemType?: string;
    itemEmoji?: string;
}

export interface PuppyStats {
    totalCalls: number;
    balance: number;
    updatedAt: number;
    lastAction?: string;
}

function normalizeCount(raw: unknown): number {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return 0;
    }

    return Math.max(0, Math.floor(raw));
}

export function parsePuppyStats(content: string): PuppyStats {
    if (!content) {
        return { totalCalls: 0, balance: 0, updatedAt: 0 };
    }

    try {
        const parsed = JSON.parse(content) as Partial<PuppyStats>;
        const totalCalls = normalizeCount(parsed.totalCalls);
        const balance = parsed.balance === undefined ? totalCalls : normalizeCount(parsed.balance);

        return {
            totalCalls,
            balance,
            updatedAt: typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : 0,
            lastAction: typeof parsed.lastAction === 'string' ? parsed.lastAction : undefined,
        };
    } catch {
        return { totalCalls: 0, balance: 0, updatedAt: 0 };
    }
}

export async function readPuppyStats(client: SiYuanClient): Promise<PuppyStats> {
    try {
        return parsePuppyStats(await client.readFile(PUPPY_STATS_PATH));
    } catch {
        return { totalCalls: 0, balance: 0, updatedAt: 0 };
    }
}

export async function writePuppyStats(client: SiYuanClient, stats: PuppyStats): Promise<PuppyStats> {
    const normalized = {
        totalCalls: normalizeCount(stats.totalCalls),
        balance: normalizeCount(stats.balance),
        updatedAt: typeof stats.updatedAt === 'number' && Number.isFinite(stats.updatedAt) ? stats.updatedAt : Date.now(),
        ...(stats.lastAction ? { lastAction: stats.lastAction } : {}),
    } satisfies PuppyStats;

    await client.writeFile(PUPPY_STATS_PATH, JSON.stringify(normalized));
    return normalized;
}

export async function earnPuppyBalance(client: SiYuanClient, action?: string): Promise<PuppyStats> {
    const current = await readPuppyStats(client);
    try {
        return await writePuppyStats(client, {
            totalCalls: current.totalCalls + 1,
            balance: current.balance + 1,
            updatedAt: Date.now(),
            lastAction: action,
        });
    } catch {
        return current;
    }
}

export async function spendPuppyBalance(client: SiYuanClient, cost: number, action?: string): Promise<PuppyStats> {
    const current = await readPuppyStats(client);
    const normalizedCost = normalizeCount(cost);
    if (current.balance < normalizedCost) {
        throw new Error(`Insufficient mascot balance. Need ${normalizedCost}, have ${current.balance}.`);
    }

    return writePuppyStats(client, {
        totalCalls: current.totalCalls,
        balance: current.balance - normalizedCost,
        updatedAt: Date.now(),
        lastAction: action,
    });
}

export async function writePuppyEvent(client: SiYuanClient, event: Omit<PuppyEvent, 'seq' | 'ts'>): Promise<void> {
    try {
        const data = JSON.stringify({ ...event, seq: Date.now(), ts: Date.now() } satisfies PuppyEvent);
        await client.writeFile(PUPPY_EVENTS_PATH, data);
    } catch {
        // Silent fail - never block tool calls for puppy events.
    }
}

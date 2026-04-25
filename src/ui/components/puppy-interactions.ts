export const PETTING_MOVE_THRESHOLD_PX = 6;
export const WAGE_CARD_TRIGGER_CHANCE = 0.1;

export interface PuppyEventPayload {
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

export function hasPointerMovedEnough(
    deltaX: number,
    deltaY: number,
    threshold = PETTING_MOVE_THRESHOLD_PX,
): boolean {
    return Math.hypot(deltaX, deltaY) > threshold;
}

export function normalizeTotalCalls(raw: unknown): number {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return 0;
    }

    return Math.max(0, Math.floor(raw));
}

export function shouldShowWageCard(
    randomValue = Math.random(),
    chance = WAGE_CARD_TRIGGER_CHANCE,
): boolean {
    const normalizedChance = Number.isFinite(chance)
        ? Math.min(1, Math.max(0, chance))
        : WAGE_CARD_TRIGGER_CHANCE;
    const normalizedRandom = Number.isFinite(randomValue)
        ? Math.min(0.999999, Math.max(0, randomValue))
        : 0;

    return normalizedRandom < normalizedChance;
}

export function parsePuppyEventPayload(raw: string): PuppyEventPayload | null {
    if (!raw) return null;

    try {
        const record = JSON.parse(raw) as Partial<PuppyEventPayload>;
        if (typeof record.seq !== 'number' || !Number.isFinite(record.seq)) {
            return null;
        }

        return {
            seq: record.seq,
            tool: typeof record.tool === 'string' ? record.tool : '',
            action: typeof record.action === 'string' ? record.action : 'unknown',
            status: record.status === 'success' || record.status === 'error' ? record.status : 'running',
            ts: typeof record.ts === 'number' && Number.isFinite(record.ts) ? record.ts : 0,
            totalCalls: normalizeTotalCalls(record.totalCalls),
            balance: normalizeTotalCalls(record.balance ?? record.totalCalls),
            itemId: typeof record.itemId === 'string' ? record.itemId : undefined,
            itemLabel: typeof record.itemLabel === 'string' ? record.itemLabel : undefined,
            itemType: typeof record.itemType === 'string' ? record.itemType : undefined,
            itemEmoji: typeof record.itemEmoji === 'string' ? record.itemEmoji : undefined,
        };
    } catch {
        return null;
    }
}

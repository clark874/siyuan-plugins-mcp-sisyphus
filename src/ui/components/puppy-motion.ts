export type IdleMotion = 'stand' | 'sit' | 'look' | 'groom' | 'lie' | 'sleep';

export const IDLE_MOTIONS: IdleMotion[] = ['stand', 'sit', 'look', 'groom', 'lie', 'sleep'];

export function pickNextIdleMotion(
    previous: IdleMotion,
    randomValue = Math.random(),
): IdleMotion {
    const candidates = IDLE_MOTIONS.filter((motion) => motion !== previous);
    const normalized = Number.isFinite(randomValue)
        ? Math.min(0.999999, Math.max(0, randomValue))
        : 0;
    return candidates[Math.floor(normalized * candidates.length)] ?? 'stand';
}

export function getIdleMotionDelayMs(
    motion: IdleMotion,
    randomValue = Math.random(),
): number {
    const normalized = Number.isFinite(randomValue)
        ? Math.min(1, Math.max(0, randomValue))
        : 0;

    if (motion === 'lie') {
        return 5200 + Math.floor(normalized * 2400);
    }

    if (motion === 'sleep') {
        return 7600 + Math.floor(normalized * 3200);
    }

    return 1800 + Math.floor(normalized * 2200);
}

export type IdleMotion =
    | 'stand'
    | 'sit'
    | 'look'
    | 'peek'
    | 'groom'
    | 'stretch'
    | 'yawn'
    | 'scratch'
    | 'tail-play'
    | 'lie'
    | 'sleep';

export const IDLE_MOTION_WEIGHTS: Readonly<Record<IdleMotion, number>> = {
    stand: 18,
    sit: 12,
    look: 14,
    peek: 11,
    groom: 9,
    stretch: 8,
    yawn: 7,
    scratch: 8,
    'tail-play': 5,
    lie: 5,
    sleep: 3,
};

export const IDLE_MOTIONS = Object.keys(IDLE_MOTION_WEIGHTS) as IdleMotion[];

const IDLE_MOTION_DELAYS: Readonly<Record<IdleMotion, readonly [number, number]>> = {
    stand: [1800, 4000],
    sit: [2200, 4200],
    look: [2000, 3800],
    peek: [2000, 3600],
    groom: [2600, 4200],
    stretch: [2800, 4400],
    yawn: [2400, 3800],
    scratch: [2600, 4200],
    'tail-play': [2600, 4000],
    lie: [5200, 7600],
    sleep: [7600, 10800],
};

function normalizeRandom(randomValue: number, upperBound: number): number {
    if (!Number.isFinite(randomValue)) return 0;
    return Math.min(upperBound, Math.max(0, randomValue));
}

export function pickNextIdleMotion(
    previous: IdleMotion,
    randomValue = Math.random(),
): IdleMotion {
    const candidates = IDLE_MOTIONS.filter((motion) => motion !== previous);
    const totalWeight = candidates.reduce((sum, motion) => sum + IDLE_MOTION_WEIGHTS[motion], 0);
    const target = normalizeRandom(randomValue, 0.999999) * totalWeight;
    let accumulatedWeight = 0;

    for (const motion of candidates) {
        accumulatedWeight += IDLE_MOTION_WEIGHTS[motion];
        if (target < accumulatedWeight) return motion;
    }

    return candidates[candidates.length - 1] ?? 'stand';
}

export function getIdleMotionDelayMs(
    motion: IdleMotion,
    randomValue = Math.random(),
): number {
    const normalized = normalizeRandom(randomValue, 1);
    const [minimum, maximum] = IDLE_MOTION_DELAYS[motion];
    return minimum + Math.floor(normalized * (maximum - minimum));
}

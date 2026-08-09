import { describe, expect, it } from 'vitest';

import {
    getIdleMotionDelayMs,
    IDLE_MOTIONS,
    IDLE_MOTION_WEIGHTS,
    pickNextIdleMotion,
} from '@/ui/components/puppy-motion';

describe('puppy motion helpers', () => {
    it('includes the original and richer idle motion set', () => {
        expect(IDLE_MOTIONS).toEqual([
            'stand',
            'sit',
            'look',
            'peek',
            'groom',
            'stretch',
            'yawn',
            'scratch',
            'tail-play',
            'lie',
            'sleep',
        ]);
    });

    it('rotates weighted idle motions without repeating the current one', () => {
        expect(pickNextIdleMotion('stand', 0)).toBe('sit');
        expect(pickNextIdleMotion('stand', 0.99)).toBe('sleep');
        expect(pickNextIdleMotion('groom', 0.5)).toBe('peek');

        for (const motion of IDLE_MOTIONS) {
            expect(pickNextIdleMotion(motion, 0)).not.toBe(motion);
            expect(pickNextIdleMotion(motion, 0.999999)).not.toBe(motion);
        }
    });

    it('uses the declared weights at deterministic boundaries', () => {
        const candidates = IDLE_MOTIONS.filter((motion) => motion !== 'sleep');
        const totalWeight = candidates.reduce((sum, motion) => sum + IDLE_MOTION_WEIGHTS[motion], 0);
        const standBoundary = IDLE_MOTION_WEIGHTS.stand / totalWeight;

        expect(pickNextIdleMotion('sleep', standBoundary - 0.000001)).toBe('stand');
        expect(pickNextIdleMotion('sleep', standBoundary)).toBe('sit');
    });

    it('normalizes invalid random values', () => {
        expect(pickNextIdleMotion('stand', Number.NaN)).toBe('sit');
        expect(pickNextIdleMotion('stand', Number.POSITIVE_INFINITY)).toBe('sit');
        expect(pickNextIdleMotion('stand', -1)).toBe('sit');
        expect(pickNextIdleMotion('stand', 99)).toBe('sleep');
    });

    it('clamps idle motion delay into the supported range', () => {
        expect(getIdleMotionDelayMs('stand', -1)).toBe(1800);
        expect(getIdleMotionDelayMs('stand', 0)).toBe(1800);
        expect(getIdleMotionDelayMs('stand', 1)).toBe(4000);
        expect(getIdleMotionDelayMs('stand', 99)).toBe(4000);
        expect(getIdleMotionDelayMs('peek', 0)).toBe(2000);
        expect(getIdleMotionDelayMs('peek', 1)).toBe(3600);
        expect(getIdleMotionDelayMs('groom', 0)).toBe(2600);
        expect(getIdleMotionDelayMs('stretch', 1)).toBe(4400);
        expect(getIdleMotionDelayMs('yawn', 0)).toBe(2400);
        expect(getIdleMotionDelayMs('scratch', 1)).toBe(4200);
        expect(getIdleMotionDelayMs('tail-play', 0)).toBe(2600);
        expect(getIdleMotionDelayMs('lie', 0)).toBe(5200);
        expect(getIdleMotionDelayMs('sleep', 1)).toBe(10800);

        for (const motion of IDLE_MOTIONS) {
            expect(getIdleMotionDelayMs(motion, Number.NaN)).toBeGreaterThanOrEqual(1800);
        }
    });
});

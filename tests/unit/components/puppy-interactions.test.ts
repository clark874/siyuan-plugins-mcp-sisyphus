import { describe, expect, it } from 'vitest';

import {
    hasPointerMovedEnough,
    normalizeTotalCalls,
    parsePuppyEventPayload,
    shouldShowWageCard,
} from '@/components/puppy-interactions';

describe('puppy interaction helpers', () => {
    it('treats tiny pointer movement as petting', () => {
        expect(hasPointerMovedEnough(2, 3)).toBe(false);
        expect(hasPointerMovedEnough(6, 0)).toBe(false);
        expect(hasPointerMovedEnough(7, 0)).toBe(true);
    });

    it('normalizes total calls into a safe integer', () => {
        expect(normalizeTotalCalls(3.8)).toBe(3);
        expect(normalizeTotalCalls(-5)).toBe(0);
        expect(normalizeTotalCalls('3')).toBe(0);
    });

    it('shows wage card only when random value falls under chance', () => {
        expect(shouldShowWageCard(0)).toBe(true);
        expect(shouldShowWageCard(0.09)).toBe(true);
        expect(shouldShowWageCard(0.1)).toBe(false);
        expect(shouldShowWageCard(0.4, 0.5)).toBe(true);
        expect(shouldShowWageCard(0.4, 0.3)).toBe(false);
    });

    it('parses puppy event payload with total call data', () => {
        expect(parsePuppyEventPayload(JSON.stringify({
            seq: 12,
            tool: 'mascot',
            action: 'buy',
            status: 'success',
            ts: 123456,
            totalCalls: 9.8,
            balance: 4.9,
            itemId: 'milk',
            itemLabel: '牛奶',
            itemType: 'drink',
            itemEmoji: '🥛',
        }))).toEqual({
            seq: 12,
            tool: 'mascot',
            action: 'buy',
            status: 'success',
            ts: 123456,
            totalCalls: 9,
            balance: 4,
            itemId: 'milk',
            itemLabel: '牛奶',
            itemType: 'drink',
            itemEmoji: '🥛',
        });
    });

    it('rejects malformed event payloads', () => {
        expect(parsePuppyEventPayload('')).toBeNull();
        expect(parsePuppyEventPayload('oops')).toBeNull();
        expect(parsePuppyEventPayload(JSON.stringify({ action: 'get_version' }))).toBeNull();
    });
});

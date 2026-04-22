import { describe, expect, it, vi } from 'vitest';

import { computeTestResultDelayMs, createTestModeRunner } from '@/ui/components/puppy-test-mode';

describe('puppy test mode', () => {
    it.each([
        { input: 0, expected: 480 },
        { input: 500, expected: 480 },
        { input: 1000, expected: 480 },
        { input: 4000, expected: 1200 },
    ])('computes phase delay', ({ input, expected }) => {
        expect(computeTestResultDelayMs(input)).toBe(expected);
    });

    it('schedules running then result then next cycle', () => {
        vi.useFakeTimers();
        const applyEvent = vi.fn();
        const pickAction = vi.fn(() => ({ tool: 'file', action: 'export_md' }));
        const intervalMs = 1000;
        const runner = createTestModeRunner({
            pickAction,
            applyEvent,
            getIntervalMs: () => intervalMs,
            successWeight: 1,
            randomFn: () => 0,
        });

        runner.start();
        expect(runner.isRunning()).toBe(true);

        vi.advanceTimersByTime(120);
        expect(applyEvent).toHaveBeenCalledWith('file', 'export_md', 'running');

        vi.advanceTimersByTime(computeTestResultDelayMs(intervalMs));
        expect(applyEvent).toHaveBeenCalledWith('file', 'export_md', 'success');

        vi.advanceTimersByTime(intervalMs);
        expect(applyEvent).toHaveBeenCalledTimes(3);
        expect(applyEvent).toHaveBeenLastCalledWith('file', 'export_md', 'running');

        vi.advanceTimersByTime(computeTestResultDelayMs(intervalMs));
        expect(applyEvent).toHaveBeenCalledTimes(4);
        expect(applyEvent).toHaveBeenLastCalledWith('file', 'export_md', 'success');

        runner.stop();
        expect(runner.isRunning()).toBe(false);
        vi.useRealTimers();
    });
});

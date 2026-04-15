export type TestActionEntry = { tool: string; action: string };

export type TestModeRunner = {
    start(): void;
    stop(): void;
    isRunning(): boolean;
};

export function computeTestResultDelayMs(intervalMs: number): number {
    return Math.max(480, Math.min(1200, Math.floor(intervalMs * 0.42)));
}

export function createTestModeRunner(opts: {
    pickAction: () => TestActionEntry;
    applyEvent: (tool: string, action: string, status: 'running' | 'success' | 'error') => void;
    getIntervalMs: () => number;
    successWeight: number;
    randomFn?: () => number;
    setTimeoutFn?: typeof setTimeout;
    clearTimeoutFn?: typeof clearTimeout;
}): TestModeRunner {
    const randomFn = opts.randomFn ?? Math.random;
    const setTimeoutFn = opts.setTimeoutFn ?? setTimeout;
    const clearTimeoutFn = opts.clearTimeoutFn ?? clearTimeout;
    let advanceTimer: ReturnType<typeof setTimeout> | undefined;
    let resultTimer: ReturnType<typeof setTimeout> | undefined;

    const stop = () => {
        if (advanceTimer) clearTimeoutFn(advanceTimer);
        if (resultTimer) clearTimeoutFn(resultTimer);
        advanceTimer = undefined;
        resultTimer = undefined;
    };

    const schedule = (delayMs: number) => {
        advanceTimer = setTimeoutFn(() => {
            const next = opts.pickAction();
            opts.applyEvent(next.tool, next.action, 'running');
            const intervalMs = opts.getIntervalMs();
            const phaseDelay = computeTestResultDelayMs(intervalMs);
            resultTimer = setTimeoutFn(() => {
                opts.applyEvent(
                    next.tool,
                    next.action,
                    randomFn() < opts.successWeight ? 'success' : 'error',
                );
                schedule(intervalMs);
            }, phaseDelay);
        }, delayMs);
    };

    const start = () => {
        if (advanceTimer || resultTimer) return;
        schedule(120);
    };

    return {
        start,
        stop,
        isRunning: () => Boolean(advanceTimer || resultTimer),
    };
}

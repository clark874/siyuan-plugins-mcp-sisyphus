export type Poller = {
    start(): void;
    stop(): void;
    pollOnce(): Promise<void>;
    isRunning(): boolean;
};

export type JsonFilePollerOptions<T> = {
    endpoint: string;
    path: string;
    intervalMs: number;
    parse: (raw: string) => T | null;
    onValue: (value: T) => void;
    fetchFn?: typeof fetch;
};

export function createJsonFilePoller<T>(opts: JsonFilePollerOptions<T>): Poller {
    const fetchFn = opts.fetchFn ?? fetch;
    let timer: ReturnType<typeof setInterval> | undefined;

    const pollOnce = async () => {
        try {
            const res = await fetchFn(opts.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: opts.path }),
            });
            if (!res.ok) return;
            const text = await res.text();
            if (!text) return;
            const value = opts.parse(text);
            if (!value) return;
            opts.onValue(value);
        } catch {
        }
    };

    const start = () => {
        if (timer) return;
        void pollOnce();
        timer = setInterval(pollOnce, opts.intervalMs);
    };

    const stop = () => {
        if (!timer) return;
        clearInterval(timer);
        timer = undefined;
    };

    return {
        start,
        stop,
        pollOnce,
        isRunning: () => Boolean(timer),
    };
}

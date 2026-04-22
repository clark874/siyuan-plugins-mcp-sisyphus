export type PuppyPosition = { x: number; y: number };

const STORAGE_KEY = 'sy-puppy-pos';

export function loadPuppyPosition(windowWidth: number, windowHeight: number): PuppyPosition {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved) as Partial<PuppyPosition>;
            if (typeof parsed.x === 'number' && Number.isFinite(parsed.x) && typeof parsed.y === 'number' && Number.isFinite(parsed.y)) {
                return { x: parsed.x, y: parsed.y };
            }
        }
    } catch {
    }

    return {
        x: windowWidth - 110,
        y: windowHeight - 148,
    };
}

export function savePuppyPosition(position: PuppyPosition): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
}

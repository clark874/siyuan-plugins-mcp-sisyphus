import { vi } from 'vitest';

/**
 * Create a minimal mock SiYuanClient for tool-level tests.
 */
export function createMockClient(overrides: Record<string, unknown> = {}) {
    return {
        request: vi.fn(async () => null),
        writeFile: vi.fn(async () => undefined),
        ...overrides,
    } as any;
}

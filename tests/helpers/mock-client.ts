import { vi } from 'vitest';

/**
 * Create a minimal mock SiYuanClient for tool-level tests.
 */
export function createMockClient(overrides: Record<string, unknown> = {}) {
    const request = typeof overrides.request === 'function'
        ? overrides.request
        : vi.fn(async () => null);
    const requestFormData = typeof overrides.requestFormData === 'function'
        ? overrides.requestFormData
        : vi.fn(async () => null);
    return {
        request,
        requestRead: request,
        requestWrite: request,
        requestFormData,
        requestFormDataRead: requestFormData,
        requestFormDataWrite: requestFormData,
        writeFile: vi.fn(async () => undefined),
        ...overrides,
    } as any;
}

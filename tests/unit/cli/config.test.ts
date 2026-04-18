import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
}));

const existsSyncMock = vi.mocked(existsSync);
const readFileSyncMock = vi.mocked(readFileSync);
const defaultPath = join(homedir(), '.siyuan-sisyphus', 'config.json');
const legacyPath = join(homedir(), '.siyuan-mcp', 'config.json');

describe('cli/config', () => {
    beforeEach(() => {
        existsSyncMock.mockReset();
        readFileSyncMock.mockReset();
    });

    it('prefers the new config path when present', async () => {
        existsSyncMock.mockImplementation((path) => path === defaultPath);
        readFileSyncMock.mockReturnValue('{"apiUrl":"http://new","token":"new-token"}' as never);

        const { getDefaultConfigPath, getLegacyConfigPath, loadFileConfig } = await import('@/cli/config');

        expect(getDefaultConfigPath()).toBe(defaultPath);
        expect(getLegacyConfigPath()).toBe(legacyPath);
        expect(loadFileConfig()).toEqual({ apiUrl: 'http://new', token: 'new-token' });
        expect(readFileSyncMock).toHaveBeenCalledWith(defaultPath, 'utf8');
    });

    it('falls back to the legacy config path when needed', async () => {
        existsSyncMock.mockImplementation((path) => path === legacyPath);
        readFileSyncMock.mockReturnValue('{"apiUrl":"http://legacy","token":"legacy-token"}' as never);

        const { loadFileConfig } = await import('@/cli/config');

        expect(loadFileConfig()).toEqual({ apiUrl: 'http://legacy', token: 'legacy-token' });
        expect(readFileSyncMock).toHaveBeenCalledWith(legacyPath, 'utf8');
    });

    it('honors an explicit config path without checking fallbacks', async () => {
        existsSyncMock.mockImplementation((path) => path === '/tmp/custom.json');
        readFileSyncMock.mockReturnValue('{"apiUrl":"http://custom","token":"custom-token"}' as never);

        const { loadFileConfig } = await import('@/cli/config');

        expect(loadFileConfig('/tmp/custom.json')).toEqual({ apiUrl: 'http://custom', token: 'custom-token' });
        expect(readFileSyncMock).toHaveBeenCalledWith('/tmp/custom.json', 'utf8');
    });
});

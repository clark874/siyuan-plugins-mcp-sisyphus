import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
}));

const existsSyncMock = vi.mocked(existsSync);
const readFileSyncMock = vi.mocked(readFileSync);
const defaultPath = join(homedir(), '.siyuan-sisyphus', 'config.json');
const legacyPath = join(homedir(), '.siyuan-mcp', 'config.json');

describe('cli/config', () => {
    beforeEach(() => {
        existsSyncMock.mockReset();
        readFileSyncMock.mockReset();
        delete process.env.SIYUAN_API_URL;
        delete process.env.SIYUAN_TOKEN;
    });

    it('prefers the new config path when present', async () => {
        existsSyncMock.mockImplementation((path) => path === defaultPath);
        readFileSyncMock.mockReturnValue('{"apiUrl":"http://new","token":"new-token"}' as never);

        const { getDefaultConfigPath, getLegacyConfigPath, loadFileConfig, normalizeFileConfig } = await import('@/cli/config');

        expect(getDefaultConfigPath()).toBe(defaultPath);
        expect(getLegacyConfigPath()).toBe(legacyPath);
        expect(loadFileConfig()).toEqual({ apiUrl: 'http://new', token: 'new-token', currentProfile: undefined, profiles: undefined });
        expect(normalizeFileConfig(loadFileConfig())).toEqual({
            currentProfile: 'default',
            profiles: {
                default: { apiUrl: 'http://new', token: 'new-token' },
            },
        });
        expect(readFileSyncMock).toHaveBeenCalledWith(defaultPath, 'utf8');
    });

    it('reads the new multi-profile shape', async () => {
        existsSyncMock.mockImplementation((path) => path === defaultPath);
        readFileSyncMock.mockReturnValue(JSON.stringify({
            currentProfile: 'work',
            profiles: {
                default: { apiUrl: 'http://127.0.0.1:6806', token: 'a' },
                work: { apiUrl: 'http://127.0.0.1:6900', token: 'b' },
            },
        }) as never);

        const { loadFileConfig, normalizeFileConfig } = await import('@/cli/config');

        expect(normalizeFileConfig(loadFileConfig())).toEqual({
            currentProfile: 'work',
            profiles: {
                default: { apiUrl: 'http://127.0.0.1:6806', token: 'a' },
                work: { apiUrl: 'http://127.0.0.1:6900', token: 'b' },
            },
        });
    });

    it('falls back to the legacy config path when needed', async () => {
        existsSyncMock.mockImplementation((path) => path === legacyPath);
        readFileSyncMock.mockReturnValue('{"apiUrl":"http://legacy","token":"legacy-token"}' as never);

        const { loadFileConfig, normalizeFileConfig } = await import('@/cli/config');

        expect(normalizeFileConfig(loadFileConfig())).toEqual({
            currentProfile: 'default',
            profiles: {
                default: { apiUrl: 'http://legacy', token: 'legacy-token' },
            },
        });
        expect(readFileSyncMock).toHaveBeenCalledWith(legacyPath, 'utf8');
    });

    it('honors an explicit config path without checking fallbacks', async () => {
        existsSyncMock.mockImplementation((path) => path === '/tmp/custom.json');
        readFileSyncMock.mockReturnValue('{"apiUrl":"http://custom","token":"custom-token"}' as never);

        const { loadFileConfig } = await import('@/cli/config');

        expect(loadFileConfig('/tmp/custom.json')).toEqual({
            apiUrl: 'http://custom',
            token: 'custom-token',
            currentProfile: undefined,
            profiles: undefined,
        });
        expect(readFileSyncMock).toHaveBeenCalledWith('/tmp/custom.json', 'utf8');
    });

    it('resolves a selected profile from the config file', async () => {
        const { resolveConfig } = await import('@/cli/config');

        const resolved = resolveConfig({
            currentProfile: 'default',
            profiles: {
                default: { apiUrl: 'http://default', token: 'default-token' },
                work: { apiUrl: 'http://work', token: 'work-token' },
            },
        }, { profile: 'work' });

        expect(resolved).toEqual({
            apiUrl: 'http://work',
            token: 'work-token',
            profileName: 'work',
        });
    });

    it('lets cli url and token override the selected profile', async () => {
        const { resolveConfig } = await import('@/cli/config');

        const resolved = resolveConfig({
            currentProfile: 'work',
            profiles: {
                work: { apiUrl: 'http://work', token: 'work-token' },
            },
        }, {
            profile: 'work',
            cliUrl: 'http://override',
            cliToken: 'override-token',
        });

        expect(resolved).toEqual({
            apiUrl: 'http://override',
            token: 'override-token',
            profileName: 'work',
        });
    });

    it('throws a clear error when the requested profile is missing', async () => {
        const { resolveConfig } = await import('@/cli/config');

        expect(() => resolveConfig({
            currentProfile: 'default',
            profiles: {
                default: { apiUrl: 'http://default', token: 'token' },
            },
        }, { profile: 'missing' })).toThrow('Unknown profile "missing"');
    });
});

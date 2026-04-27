import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { ParsedArgs } from '@/cli/args';
import { runConfigCommand, getConfigTargetPath } from '@/cli/config-command';

function captureStdout() {
    let stdout = '';
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
        stdout += String(chunk);
        return true;
    }) as typeof process.stdout.write);

    return {
        get stdout() { return stdout; },
        restore: () => spy.mockRestore(),
    };
}

function baseArgs(configPath: string): ParsedArgs {
    return {
        command: 'config',
        rest: [],
        configPath,
        json: false,
        debug: false,
    } as ParsedArgs;
}

describe('cli/config-command', () => {
    const tempDirs: string[] = [];

    afterEach(() => {
        vi.restoreAllMocks();
        for (const dir of tempDirs.splice(0)) {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    function createConfigPath(initial?: unknown) {
        const dir = mkdtempSync(join(tmpdir(), 'sisyphus-config-command-'));
        tempDirs.push(dir);
        const configPath = join(dir, 'config.json');
        if (initial !== undefined) {
            writeFileSync(configPath, JSON.stringify(initial, null, 2));
        }
        return configPath;
    }

    it('sets the first profile as current and preserves it when adding other profiles', () => {
        const io = captureStdout();
        const configPath = createConfigPath();

        expect(runConfigCommand({
            ...baseArgs(configPath),
            configAction: 'set',
            configName: 'work',
            url: 'http://work',
            token: 'work-token',
        })).toBe(0);

        expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual({
            currentProfile: 'work',
            profiles: {
                default: { apiUrl: 'http://127.0.0.1:6806', token: '' },
                work: { apiUrl: 'http://work', token: 'work-token' },
            },
        });

        expect(runConfigCommand({
            ...baseArgs(configPath),
            configAction: 'set',
            configName: 'home',
            url: 'http://home',
        })).toBe(0);

        expect(JSON.parse(readFileSync(configPath, 'utf8'))).toMatchObject({
            currentProfile: 'work',
            profiles: {
                work: { apiUrl: 'http://work', token: 'work-token' },
                home: { apiUrl: 'http://home', token: '' },
            },
        });
        expect(io.stdout).toContain('Profile saved.');
        io.restore();
    });

    it('switches and prints profiles without exposing stored tokens', () => {
        const io = captureStdout();
        const configPath = createConfigPath({
            currentProfile: 'default',
            profiles: {
                default: { apiUrl: 'http://default', token: 'secret-a' },
                work: { apiUrl: 'http://work', token: 'secret-b' },
            },
        });

        expect(runConfigCommand({ ...baseArgs(configPath), configAction: 'use', configName: 'work' })).toBe(0);
        expect(runConfigCommand({ ...baseArgs(configPath), configAction: 'get' })).toBe(0);
        expect(runConfigCommand({ ...baseArgs(configPath), configAction: 'list' })).toBe(0);

        const saved = JSON.parse(readFileSync(configPath, 'utf8'));
        expect(saved.currentProfile).toBe('work');
        expect(io.stdout).toContain('Profile work');
        expect(io.stdout).toContain('work (current)');
        expect(io.stdout).toContain('configured');
        expect(io.stdout).not.toContain('secret-a');
        expect(io.stdout).not.toContain('secret-b');
        io.restore();
    });

    it('throws clear errors for missing arguments and unknown profiles', () => {
        const configPath = createConfigPath({
            currentProfile: 'default',
            profiles: {
                default: { apiUrl: 'http://default', token: '' },
            },
        });

        expect(() => runConfigCommand({ ...baseArgs(configPath), configAction: 'set' })).toThrow('Missing profile name');
        expect(() => runConfigCommand({
            ...baseArgs(configPath),
            configAction: 'set',
            configName: 'work',
        })).toThrow('Missing --url');
        expect(() => runConfigCommand({
            ...baseArgs(configPath),
            configAction: 'use',
            configName: 'missing',
        })).toThrow('Unknown profile "missing"');
        expect(() => runConfigCommand({
            ...baseArgs(configPath),
            configAction: 'get',
            configName: 'missing',
        })).toThrow('Unknown profile "missing"');
        expect(getConfigTargetPath(configPath)).toBe(configPath);
    });
});

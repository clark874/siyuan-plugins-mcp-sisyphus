import { describe, expect, it } from 'vitest';

import { parseArgs } from '@/cli/args';

describe('cli/args', () => {
    it('parses profile as a global option for dispatch commands', () => {
        expect(parseArgs(['--profile', 'work', 'notebook', 'list'])).toMatchObject({
            command: 'dispatch',
            tool: 'notebook',
            action: 'list',
            profile: 'work',
        });
    });

    it('strips profile from tool-specific rest args', () => {
        expect(parseArgs(['--profile', 'work', 'block', 'append', '--parent-id', 'p1'])).toMatchObject({
            command: 'dispatch',
            rest: ['--parent-id', 'p1'],
        });
    });

    it('parses config list', () => {
        expect(parseArgs(['config', 'list'])).toMatchObject({
            command: 'config',
            configAction: 'list',
        });
    });

    it('parses config set with url and token', () => {
        expect(parseArgs(['config', 'set', 'work', '--url', 'http://work', '--token', 'secret'])).toMatchObject({
            command: 'config',
            configAction: 'set',
            configName: 'work',
            url: 'http://work',
            token: 'secret',
        });
    });

    it('parses config use', () => {
        expect(parseArgs(['config', 'use', 'work'])).toMatchObject({
            command: 'config',
            configAction: 'use',
            configName: 'work',
        });
    });
});

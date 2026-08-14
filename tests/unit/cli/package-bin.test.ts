import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('CLI package bin aliases', () => {
    it('uses sisyphus as the short alias instead of siyuan', () => {
        const raw = readFileSync(join(process.cwd(), 'cli', 'package.json'), 'utf8');
        const pkg = JSON.parse(raw) as { version: string; bin: Record<string, string> };

        expect(pkg.version).toBe('0.3.1-wiki.1');
        expect(pkg.bin).toEqual({
            'siyuan-sisyphus': 'dist/cli.cjs',
            sisyphus: 'dist/cli.cjs',
        });
        expect(pkg.bin).not.toHaveProperty('siyuan');
    });
});

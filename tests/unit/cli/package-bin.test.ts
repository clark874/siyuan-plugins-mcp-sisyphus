import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('CLI package bin aliases', () => {
    it('uses sisyphus as the short alias instead of siyuan', () => {
        const raw = readFileSync(join(process.cwd(), 'cli', 'package.json'), 'utf8');
        const pkg = JSON.parse(raw) as { version: string; bin: Record<string, string>; engines: { node: string } };

        expect(pkg.version).toBe('0.4.15');
        expect(pkg.bin).toEqual({
            'siyuan-sisyphus': 'dist/cli.cjs',
            sisyphus: 'dist/cli.cjs',
        });
        expect(pkg.bin).not.toHaveProperty('siyuan');
        expect(pkg.engines.node).toBe('>=20');
    });

    it('places a Node 20 guard in the bundle banner before bundled imports execute', () => {
        const config = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');
        const bannerIndex = config.indexOf('nodeVersionGuardBanner');
        const cliBannerIndex = config.indexOf('banner: nodeVersionGuardBanner');

        expect(bannerIndex).toBeGreaterThan(-1);
        expect(cliBannerIndex).toBeGreaterThan(bannerIndex);
        expect(config).toContain('process.versions.node');
        expect(config).toContain('requires Node.js 20 or newer');
    });

    it('keeps project-source Node dependencies external in server and CLI bundles', () => {
        const config = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');

        for (const dependency of ['node:child_process', 'node:crypto', 'node:fs', 'node:os', 'node:path', 'node:util']) {
            expect(config).toContain(`"${dependency}"`);
        }
    });
});

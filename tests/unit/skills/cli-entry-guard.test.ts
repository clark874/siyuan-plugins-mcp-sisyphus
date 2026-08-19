import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const CLI_SKILLS_ROOT = join(process.cwd(), 'skills', 'siyuan-sisyphus');

describe('CLI Skill 入口保护', () => {
    it('要求每个 CLI Skill 先解析本地命令且禁止隐式回退到 npx', () => {
        const skillFiles = readdirSync(CLI_SKILLS_ROOT)
            .map((name) => join(CLI_SKILLS_ROOT, name))
            .filter((path) => statSync(path).isDirectory())
            .map((path) => join(path, 'SKILL.md'));

        expect(skillFiles.length).toBeGreaterThan(0);
        for (const file of skillFiles) {
            const text = readFileSync(file, 'utf8');
            expect(text).toContain('command -v siyuan-sisyphus');
            expect(text).toContain('Do not use `npx` as an implicit fallback.');
            expect(text).toContain('siyuan-sisyphus --version');
            expect(text).toContain('siyuan-sisyphus system bootstrap --json');
        }
    });
});

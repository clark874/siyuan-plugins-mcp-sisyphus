import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { ParsedArgs } from '@/cli/args';
import {
    installSkills,
    listBundledSkills,
    normalizeSkillBundle,
    normalizeSkillTargetName,
    readBundledSkill,
    resolveBundledSkillsRoot,
    resolveSkillTargetRoot,
    runSkillCommand,
    uninstallSkills,
} from '@/cli/skill-command';

function baseArgs(): ParsedArgs {
    return {
        command: 'skill',
        rest: [],
        json: false,
        debug: false,
    } as ParsedArgs;
}

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

describe('cli/skill-command', () => {
    const tempDirs: string[] = [];

    afterEach(() => {
        vi.restoreAllMocks();
        for (const dir of tempDirs.splice(0)) {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    function createTempDir() {
        const dir = mkdtempSync(join(tmpdir(), 'sisyphus-skill-command-'));
        tempDirs.push(dir);
        return dir;
    }

    it('finds and reads bundled skills', () => {
        const root = resolveBundledSkillsRoot();
        const skills = listBundledSkills(root);

        expect(skills.map((skill) => skill.name)).toContain('siyuan-sisyphus');
        expect(skills.every((skill) => existsSync(join(skill.path, 'SKILL.md')))).toBe(true);
        expect(readBundledSkill('siyuan-sisyphus')).toContain('#');

        const mcpRoot = resolveBundledSkillsRoot(undefined, undefined, 'mcp');
        const mcpSkills = listBundledSkills(mcpRoot, 'mcp');
        expect(mcpSkills.map((skill) => skill.name)).toContain('siyuan-mcp-sisyphus');
        expect(readBundledSkill('siyuan-mcp-create-edit', 'mcp')).toContain('name: siyuan-mcp-create-edit');
    });

    it('normalizes target names and rejects unsafe paths', () => {
        expect(normalizeSkillTargetName()).toBe('agents');
        expect(normalizeSkillTargetName('claude')).toBe('claude');
        expect(normalizeSkillTargetName('codex')).toBe('.codex');
        expect(normalizeSkillTargetName('.codex')).toBe('.codex');
        expect(() => normalizeSkillTargetName('../bad')).toThrow('Invalid skill target');
        expect(normalizeSkillBundle()).toBe('cli');
        expect(normalizeSkillBundle('mcp')).toBe('mcp');
        expect(() => normalizeSkillBundle('unknown')).toThrow('Invalid skill bundle');
    });

    it('installs MCP or all bundles without changing the legacy default', () => {
        const dir = createTempDir();

        const mcp = installSkills({ target: '.codex', local: true, cwd: dir, bundle: 'mcp' });
        expect(mcp.bundle).toBe('mcp');
        expect(mcp.skills).toContain('siyuan-mcp-create-edit');
        expect(existsSync(join(dir, '.codex', 'skills', 'siyuan-mcp-create-edit', 'SKILL.md'))).toBe(true);
        expect(existsSync(join(dir, '.codex', 'skills', 'siyuan-sisyphus', 'SKILL.md'))).toBe(false);

        const all = installSkills({ target: '.codex', local: true, cwd: dir, bundle: 'all' });
        expect(all.skills).toContain('siyuan-sisyphus');
        expect(all.skills).toContain('siyuan-mcp-sisyphus');
    });

    it('resolves local targets under the current directory', () => {
        const dir = createTempDir();

        expect(resolveSkillTargetRoot({ target: '.codex', local: true, cwd: dir })).toBe(join(dir, '.codex', 'skills'));
        expect(() => resolveSkillTargetRoot({ target: 'agents', local: true })).toThrow('home directory shortcut');
    });

    it('installs and uninstalls all bundled skills into a local target', () => {
        const dir = createTempDir();

        const preview = installSkills({ target: '.codex', local: true, dryRun: true, cwd: dir });
        expect(preview.dryRun).toBe(true);
        expect(preview.operations.length).toBeGreaterThan(1);

        const installed = installSkills({ target: '.codex', local: true, cwd: dir });
        expect(installed.skills).toContain('siyuan-sisyphus');
        expect(existsSync(join(dir, '.codex', 'skills', 'siyuan-sisyphus', 'SKILL.md'))).toBe(true);
        expect(readFileSync(join(dir, '.codex', 'skills', 'siyuan-markup-guide', 'SKILL.md'), 'utf8')).toContain('#');

        const removed = uninstallSkills({ target: '.codex', local: true, cwd: dir });
        expect(removed.removed).toContain('siyuan-sisyphus');
        expect(existsSync(join(dir, '.codex', 'skills', 'siyuan-sisyphus'))).toBe(false);
    });

    it('runs list and dry-run install commands', () => {
        const io = captureStdout();

        expect(runSkillCommand({ ...baseArgs(), skillAction: 'list' })).toBe(0);
        expect(runSkillCommand({
            ...baseArgs(),
            skillAction: 'install',
            target: '.codex',
            local: true,
            dryRun: true,
        })).toBe(0);

        expect(io.stdout).toContain('siyuan-sisyphus');
        expect(io.stdout).toContain('"dryRun": true');
        io.restore();
    });
});

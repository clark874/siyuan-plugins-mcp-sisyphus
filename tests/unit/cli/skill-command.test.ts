import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

    it('仅发现并读取统一入口，显式技能包参数不增加入口', () => {
        const root = resolveBundledSkillsRoot();
        expect(listBundledSkills(root).map((skill) => skill.name)).toEqual(['siyuan']);
        expect(readBundledSkill()).toContain('name: siyuan');
        expect(listBundledSkills(undefined, 'mcp').map((skill) => skill.name)).toEqual(['siyuan']);
        expect(listBundledSkills(undefined, 'all').map((skill) => skill.name)).toEqual(['siyuan']);
        expect(readBundledSkill('siyuan', 'cli')).toContain('#');
    });

    it('normalizes target names and rejects unsafe paths', () => {
        expect(normalizeSkillTargetName()).toBe('agents');
        expect(normalizeSkillTargetName('claude')).toBe('claude');
        expect(normalizeSkillTargetName('codex')).toBe('.codex');
        expect(normalizeSkillTargetName('.codex')).toBe('.codex');
        expect(() => normalizeSkillTargetName('../bad')).toThrow('无效技能目标');
        expect(normalizeSkillBundle()).toBe('cli');
        expect(normalizeSkillBundle('mcp')).toBe('mcp');
        expect(() => normalizeSkillBundle('unknown')).toThrow('无效技能包');
    });

    it('resolves local targets under the current directory', () => {
        const dir = createTempDir();

        expect(resolveSkillTargetRoot({ target: '.codex', local: true, cwd: dir })).toBe(join(dir, '.codex', 'skills'));
        expect(() => resolveSkillTargetRoot({ target: 'agents', local: true })).toThrow('用户目录快捷方式');
    });

    it('可恢复迁移旧入口，保留其他技能，并只安装及卸载统一入口', () => {
        const dir = createTempDir();

        const legacy = join(dir, '.codex', 'skills', 'siyuan-mcp-sisyphus');
        mkdirSync(legacy, { recursive: true });
        writeFileSync(join(legacy, 'SKILL.md'), '---\nname: siyuan-mcp-sisyphus\n---\n# SiYuan Sisyphus with MCP\n');
        const oldBrowse = join(dir, '.codex', 'skills', 'siyuan-sisyphus-browse-read');
        mkdirSync(oldBrowse, { recursive: true });
        writeFileSync(join(oldBrowse, 'SKILL.md'), '---\nname: siyuan-sisyphus-browse-read\ncompatibility: Requires the maintained siyuan-sisyphus CLI to be installed and configured for the target SiYuan workspace.\n---\n旧浏览技能');
        const custom = join(dir, '.codex', 'skills', 'user-notes');
        mkdirSync(custom, { recursive: true });
        writeFileSync(join(custom, 'SKILL.md'), '用户自己的技能');
        const preview = installSkills({ target: '.codex', local: true, dryRun: true, cwd: dir });
        expect(preview.dryRun).toBe(true);
        expect(preview.operations).toHaveLength(1);
        expect(existsSync(legacy)).toBe(true);

        const installed = installSkills({ target: '.codex', local: true, cwd: dir });
        expect(installed.skills).toEqual(['siyuan']);
        expect(existsSync(legacy)).toBe(false);
        expect(existsSync(oldBrowse)).toBe(false);
        const backups = join(dir, '.codex', '.sisyphus-skill-backups');
        const backup = readdirSync(backups)[0];
        expect(readFileSync(join(backups, backup, 'siyuan-mcp-sisyphus', 'SKILL.md'), 'utf8')).toContain('name: siyuan-mcp-sisyphus');
        expect(readFileSync(join(backups, backup, 'siyuan-sisyphus-browse-read', 'SKILL.md'), 'utf8')).toContain('name: siyuan-sisyphus-browse-read');
        expect(existsSync(join(dir, '.codex', 'skills', 'siyuan', 'SKILL.md'))).toBe(true);
        expect(readFileSync(join(custom, 'SKILL.md'), 'utf8')).toBe('用户自己的技能');

        const removed = uninstallSkills({ target: '.codex', local: true, cwd: dir });
        expect(removed.removed).toEqual(['siyuan']);
        expect(readFileSync(join(custom, 'SKILL.md'), 'utf8')).toBe('用户自己的技能');
        expect(existsSync(join(dir, '.codex', 'skills', 'siyuan'))).toBe(false);
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

        expect(io.stdout).toContain('siyuan');
        expect(io.stdout).toContain('"dryRun": true');
        io.restore();
    });
});

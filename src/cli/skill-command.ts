import {
    cpSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ParsedArgs } from './args';
import { writeHeading, writeHint, writeKeyValueRows, writeStatus } from './render';

export interface SkillTargetOptions {
    target?: string;
    local?: boolean;
    dryRun?: boolean;
    cwd?: string;
}

export interface BundledSkill {
    name: string;
    path: string;
}

const BUILTIN_SKILLS_ROOT_NAME = 'siyuan-sisyphus';

export function runSkillCommand(cli: ParsedArgs): number {
    switch (cli.skillAction) {
        case 'list':
            return runSkillList(cli);
        case 'read':
            return runSkillRead(cli);
        case 'install':
            return runSkillInstall(cli);
        case 'uninstall':
            return runSkillUninstall(cli);
        default:
            throw new Error('Unknown skill action.');
    }
}

function runSkillList(cli: ParsedArgs): number {
    const skills = listBundledSkills();
    if (cli.json) {
        process.stdout.write(JSON.stringify({ skills }) + '\n');
        return 0;
    }

    writeHeading('Bundled SiYuan Sisyphus skills');
    for (const skill of skills) {
        process.stdout.write(`  ${skill.name}\n`);
    }
    writeHint('Next', 'Run `siyuan-sisyphus skill install` to install them.');
    return 0;
}

function runSkillRead(cli: ParsedArgs): number {
    const content = readBundledSkill(cli.skillName);
    process.stdout.write(content);
    if (!content.endsWith('\n')) process.stdout.write('\n');
    return 0;
}

function runSkillInstall(cli: ParsedArgs): number {
    const result = installSkills({
        target: cli.target,
        local: cli.local,
        dryRun: cli.dryRun,
    });

    if (cli.json || cli.dryRun) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        return 0;
    }

    writeStatus('success', 'Bundled skills installed.');
    writeKeyValueRows([
        { key: 'target', value: result.target },
        { key: 'count', value: result.skills.length },
    ]);
    return 0;
}

function runSkillUninstall(cli: ParsedArgs): number {
    const result = uninstallSkills({
        target: cli.target,
        local: cli.local,
    });

    if (cli.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        return 0;
    }

    writeStatus('success', 'Bundled skills removed.');
    writeKeyValueRows([
        { key: 'target', value: result.target },
        { key: 'count', value: result.removed.length },
    ]);
    return 0;
}

export function resolveBundledSkillsRoot(
    fromDir = dirname(fileURLToPath(import.meta.url)),
    exists: (path: string) => boolean = existsSync,
): string {
    const candidates = [
        resolve(fromDir, 'skills', BUILTIN_SKILLS_ROOT_NAME),
        resolve(fromDir, '../skills', BUILTIN_SKILLS_ROOT_NAME),
        resolve(fromDir, '../../skills', BUILTIN_SKILLS_ROOT_NAME),
        resolve(fromDir, '../../../skills', BUILTIN_SKILLS_ROOT_NAME),
    ];

    for (const candidate of candidates) {
        if (exists(join(candidate, 'siyuan-sisyphus', 'SKILL.md'))) {
            return candidate;
        }
    }

    for (const candidate of candidates) {
        if (exists(candidate)) return candidate;
    }

    return candidates[0];
}

export function listBundledSkills(root = resolveBundledSkillsRoot()): BundledSkill[] {
    return readdirSync(root)
        .map((name) => ({ name, path: join(root, name) }))
        .filter((skill) => {
            try {
                return statSync(skill.path).isDirectory() && existsSync(join(skill.path, 'SKILL.md'));
            } catch {
                return false;
            }
        })
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function readBundledSkill(name?: string): string {
    const normalizedName = name?.trim() || BUILTIN_SKILLS_ROOT_NAME;
    validateSkillName(normalizedName);
    const skill = listBundledSkills().find((item) => item.name === normalizedName);
    if (!skill) {
        throw new Error(`Unknown bundled skill "${normalizedName}". Run \`siyuan-sisyphus skill list\` to see available skills.`);
    }
    return readFileSync(join(skill.path, 'SKILL.md'), 'utf8');
}

export function normalizeSkillTargetName(target?: string): string {
    const name = (target ?? 'agents').trim();
    if (!name) return 'agents';
    validateSkillName(name);
    if (name === 'agents' || name === 'claude') return name;
    return name.startsWith('.') ? name : `.${name}`;
}

export function resolveSkillTargetRoot(opts: SkillTargetOptions = {}): string {
    const normalized = normalizeSkillTargetName(opts.target);
    if (normalized === 'agents') {
        if (opts.local) {
            throw new Error('Target "agents" uses the home directory shortcut. Use `--target .agents --local` for a project-local path.');
        }
        return join(homedir(), '.agents', 'skills');
    }
    if (normalized === 'claude') {
        if (opts.local) {
            throw new Error('Target "claude" uses the home directory shortcut. Use `--target .claude --local` for a project-local path.');
        }
        return join(homedir(), '.claude', 'skills');
    }

    const base = opts.local ? (opts.cwd ?? process.cwd()) : homedir();
    return join(base, normalized, 'skills');
}

export function installSkills(opts: SkillTargetOptions = {}) {
    const skills = listBundledSkills();
    const target = resolveSkillTargetRoot(opts);
    const operations = skills.map((skill) => ({
        op: existsSync(join(target, skill.name)) ? 'update' : 'install',
        from: skill.path,
        to: join(target, skill.name),
    }));

    if (opts.dryRun) {
        return { target, dryRun: true, skills: skills.map((skill) => skill.name), operations };
    }

    mkdirSync(target, { recursive: true });
    for (const operation of operations) {
        rmSync(operation.to, { recursive: true, force: true });
        cpSync(operation.from, operation.to, { recursive: true, force: true });
    }

    return { target, dryRun: false, skills: skills.map((skill) => skill.name) };
}

export function uninstallSkills(opts: Omit<SkillTargetOptions, 'dryRun'> = {}) {
    const skills = listBundledSkills();
    const target = resolveSkillTargetRoot(opts);
    const removed: string[] = [];

    for (const skill of skills) {
        const targetDir = join(target, skill.name);
        if (existsSync(targetDir)) {
            rmSync(targetDir, { recursive: true, force: true });
            removed.push(basename(targetDir));
        }
    }

    return { target, removed };
}

function validateSkillName(name: string): void {
    if (!name || name === '.' || name === '..') {
        throw new Error(`Invalid skill target: "${name || '(empty)'}".`);
    }
    if (/[\\/]/.test(name) || !/^[A-Za-z0-9._-]+$/.test(name)) {
        throw new Error(`Invalid skill target: "${name}". Use a simple name such as agents, claude, codex, or .codex.`);
    }
}

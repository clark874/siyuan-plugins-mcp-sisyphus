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

import type { ParsedArgs, SkillBundle } from './args';
import { writeHeading, writeHint, writeKeyValueRows, writeStatus } from './render';

export interface SkillTargetOptions {
    target?: string;
    local?: boolean;
    dryRun?: boolean;
    cwd?: string;
    bundle?: SkillBundle;
}

export interface BundledSkill {
    name: string;
    path: string;
}

const SKILL_BUNDLE_ROOTS = {
    cli: 'siyuan-sisyphus',
    mcp: 'siyuan-mcp',
} as const;

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
    const bundle = normalizeSkillBundle(cli.bundle);
    const skills = listBundledSkills(undefined, bundle);
    if (cli.json) {
        process.stdout.write(JSON.stringify({ bundle, skills }) + '\n');
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
    const content = readBundledSkill(cli.skillName, normalizeSkillBundle(cli.bundle));
    process.stdout.write(content);
    if (!content.endsWith('\n')) process.stdout.write('\n');
    return 0;
}

function runSkillInstall(cli: ParsedArgs): number {
    const result = installSkills({
        target: cli.target,
        local: cli.local,
        dryRun: cli.dryRun,
        bundle: cli.bundle,
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
        bundle: cli.bundle,
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
    bundle: Exclude<SkillBundle, 'all'> = 'cli',
): string {
    const rootName = SKILL_BUNDLE_ROOTS[bundle];
    const candidates = [
        resolve(fromDir, 'skills', rootName),
        resolve(fromDir, '../skills', rootName),
        resolve(fromDir, '../../skills', rootName),
        resolve(fromDir, '../../../skills', rootName),
    ];

    for (const candidate of candidates) {
        if (exists(join(candidate, defaultSkillName(bundle), 'SKILL.md'))) {
            return candidate;
        }
    }

    for (const candidate of candidates) {
        if (exists(candidate)) return candidate;
    }

    return candidates[0];
}

export function listBundledSkills(root?: string, bundle: SkillBundle = 'cli'): BundledSkill[] {
    if (bundle === 'all' && !root) {
        return [
            ...listBundledSkills(undefined, 'cli'),
            ...listBundledSkills(undefined, 'mcp'),
        ].sort((a, b) => a.name.localeCompare(b.name));
    }

    const resolvedRoot = root ?? resolveBundledSkillsRoot(undefined, existsSync, bundle === 'all' ? 'cli' : bundle);
    return readdirSync(resolvedRoot)
        .map((name) => ({ name, path: join(resolvedRoot, name) }))
        .filter((skill) => {
            try {
                return statSync(skill.path).isDirectory() && existsSync(join(skill.path, 'SKILL.md'));
            } catch {
                return false;
            }
        })
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function readBundledSkill(name?: string, bundle: SkillBundle = 'cli'): string {
    const normalizedName = name?.trim() || defaultSkillName(bundle === 'all' ? 'cli' : bundle);
    validateSkillName(normalizedName);
    const skill = listBundledSkills(undefined, bundle).find((item) => item.name === normalizedName);
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
    const bundle = normalizeSkillBundle(opts.bundle);
    const skills = listBundledSkills(undefined, bundle);
    const target = resolveSkillTargetRoot(opts);
    const operations = skills.map((skill) => ({
        op: existsSync(join(target, skill.name)) ? 'update' : 'install',
        from: skill.path,
        to: join(target, skill.name),
    }));

    if (opts.dryRun) {
        return { target, bundle, dryRun: true, skills: skills.map((skill) => skill.name), operations };
    }

    mkdirSync(target, { recursive: true });
    for (const operation of operations) {
        rmSync(operation.to, { recursive: true, force: true });
        cpSync(operation.from, operation.to, { recursive: true, force: true });
    }

    return { target, bundle, dryRun: false, skills: skills.map((skill) => skill.name) };
}

export function uninstallSkills(opts: Omit<SkillTargetOptions, 'dryRun'> = {}) {
    const bundle = normalizeSkillBundle(opts.bundle);
    const skills = listBundledSkills(undefined, bundle);
    const target = resolveSkillTargetRoot(opts);
    const removed: string[] = [];

    for (const skill of skills) {
        const targetDir = join(target, skill.name);
        if (existsSync(targetDir)) {
            rmSync(targetDir, { recursive: true, force: true });
            removed.push(basename(targetDir));
        }
    }

    return { target, bundle, removed };
}

export function normalizeSkillBundle(bundle?: string): SkillBundle {
    const normalized = (bundle ?? 'cli').trim().toLowerCase();
    if (normalized === 'cli' || normalized === 'mcp' || normalized === 'all') return normalized;
    throw new Error(`Invalid skill bundle "${bundle}". Use cli, mcp, or all.`);
}

function defaultSkillName(bundle: Exclude<SkillBundle, 'all'>): string {
    return bundle === 'mcp' ? 'siyuan-mcp-sisyphus' : 'siyuan-sisyphus';
}

function validateSkillName(name: string): void {
    if (!name || name === '.' || name === '..') {
        throw new Error(`Invalid skill target: "${name || '(empty)'}".`);
    }
    if (/[\\/]/.test(name) || !/^[A-Za-z0-9._-]+$/.test(name)) {
        throw new Error(`Invalid skill target: "${name}". Use a simple name such as agents, claude, codex, or .codex.`);
    }
}

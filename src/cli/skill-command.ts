import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    lstatSync,
    renameSync,
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

// 旧生成器已发布的精确名称；不得按前缀迁移用户自建技能。
const LEGACY_SKILL_NAMES = [
    'siyuan-sisyphus',
    'siyuan-mcp-sisyphus',
    'siyuan-sisyphus-literature-source',
    'siyuan-mcp-literature-source',
    'siyuan-sisyphus-browse-read',
    'siyuan-mcp-browse-read',
    'siyuan-sisyphus-create-edit',
    'siyuan-mcp-create-edit',
    'siyuan-sisyphus-knowledge-ingest',
    'siyuan-mcp-knowledge-ingest',
    'siyuan-sisyphus-project-knowledge-compile',
    'siyuan-mcp-project-knowledge-compile',
    'siyuan-sisyphus-project-coordinator',
    'siyuan-mcp-project-coordinator',
    'siyuan-sisyphus-knowledge-governance',
    'siyuan-mcp-knowledge-governance',
    'siyuan-sisyphus-search-query',
    'siyuan-mcp-search-query',
    'siyuan-sisyphus-cross-project-relation-closure',
    'siyuan-mcp-cross-project-relation-closure',
    'siyuan-sisyphus-database',
    'siyuan-mcp-database',
    'siyuan-sisyphus-project-source',
    'siyuan-mcp-project-source',
    'siyuan-sisyphus-timeline',
    'siyuan-mcp-timeline',
    'siyuan-sisyphus-system-cli',
    'siyuan-mcp-system-safety',
    'siyuan-markup-guide',
    'siyuan-mcp-markup-guide',
    'siyuan-mcp-read-discover',
    'siyuan-mcp-write-format',
    'siyuan-mcp-data-files',
    'siyuan-mcp-organize-safety',
];

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
            throw new Error('未知技能操作。');
    }
}

function runSkillList(cli: ParsedArgs): number {
    const bundle = normalizeSkillBundle(cli.bundle);
    const skills = listBundledSkills(undefined, bundle);
    if (cli.json) {
        process.stdout.write(JSON.stringify({ bundle, skills }) + '\n');
        return 0;
    }

    writeHeading('随包提供的思源技能');
    for (const skill of skills) {
        process.stdout.write(`  ${skill.name}\n`);
    }
    writeHint('下一步', '运行 `siyuan-sisyphus skill install` 安装唯一入口。');
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

    writeStatus('success', '思源技能已安装。');
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

    writeStatus('success', '思源技能已移出扫描目录。');
    writeKeyValueRows([
        { key: 'target', value: result.target },
        { key: 'count', value: result.removed.length },
    ]);
    return 0;
}

export function resolveBundledSkillsRoot(
    fromDir = dirname(fileURLToPath(import.meta.url)),
    exists: (path: string) => boolean = existsSync,
    _bundle: Exclude<SkillBundle, 'all'> = 'cli',
): string {
    const rootName = 'codex';
    const candidates = [
        resolve(fromDir, 'skills', rootName),
        resolve(fromDir, '../skills', rootName),
        resolve(fromDir, '../../skills', rootName),
        resolve(fromDir, '../../../skills', rootName),
    ];

    for (const candidate of candidates) {
        if (exists(join(candidate, 'siyuan', 'SKILL.md'))) {
            return candidate;
        }
    }

    for (const candidate of candidates) {
        if (exists(candidate)) return candidate;
    }

    return candidates[0];
}

export function listBundledSkills(root?: string, _bundle: SkillBundle = 'cli'): BundledSkill[] {
    const resolvedRoot = root ?? resolveBundledSkillsRoot();
    const skills = readdirSync(resolvedRoot)
        .filter((name) => existsSync(join(resolvedRoot, name, 'SKILL.md')));
    if (skills.length !== 1 || skills[0] !== 'siyuan') {
        throw new Error('技能发布目录必须仅包含 siyuan 入口。');
    }
    const directory = join(resolvedRoot, 'siyuan');
    assertSingleSkill(directory);
    return [{ name: 'siyuan', path: directory }];
}

function assertSingleSkill(directory: string, prefix = ''): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink()) throw new Error(`技能发布目录不得包含符号链接：${relative}`);
        if (entry.isDirectory()) assertSingleSkill(join(directory, entry.name), relative);
        else if (entry.name === 'SKILL.md' && relative !== 'SKILL.md') {
            throw new Error('技能发布目录不得包含嵌套 SKILL.md。');
        }
    }
}

export function readBundledSkill(name?: string, bundle: SkillBundle = 'cli'): string {
    const normalizedName = name?.trim() || 'siyuan';
    validateSkillName(normalizedName);
    const skill = listBundledSkills(undefined, bundle).find((item) => item.name === normalizedName);
    if (!skill) {
        throw new Error(`未知随包技能“${normalizedName}”。运行 \`siyuan-sisyphus skill list\` 查看唯一入口。`);
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
            throw new Error('目标“agents”使用用户目录快捷方式；项目内安装请使用 `--target .agents --local`。');
        }
        return join(homedir(), '.agents', 'skills');
    }
    if (normalized === 'claude') {
        if (opts.local) {
            throw new Error('目标“claude”使用用户目录快捷方式；项目内安装请使用 `--target .claude --local`。');
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

    const destination = join(target, 'siyuan');
    if (existsSync(destination) && !isProjectSkill(destination, 'siyuan')) {
        throw new Error(`目标目录不属于本项目，已保留：${destination}`);
    }
    mkdirSync(target, { recursive: true });
    const backupParent = join(dirname(target), '.sisyphus-skill-backups');
    mkdirSync(backupParent, { recursive: true });
    const backupRoot = mkdtempSync(join(backupParent, 'migration-'));
    const staged = join(backupRoot, '.staged-siyuan');
    cpSync(skills[0].path, staged, { recursive: true });
    const moved: { existing: string; backup: string }[] = [];
    try {
        for (const name of ['siyuan', ...LEGACY_SKILL_NAMES]) {
            const existing = join(target, name);
            if (!isProjectSkill(existing, name)) continue;
            const backup = join(backupRoot, name);
            renameSync(existing, backup);
            moved.push({ existing, backup });
        }
        renameSync(staged, destination);
    } catch (error) {
        for (const { existing, backup } of moved.reverse()) renameSync(backup, existing);
        throw error;
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
        if (isProjectSkill(targetDir, skill.name)) {
            const backupParent = join(dirname(target), '.sisyphus-skill-backups');
            mkdirSync(backupParent, { recursive: true });
            const backupRoot = mkdtempSync(join(backupParent, 'migration-'));
            renameSync(targetDir, join(backupRoot, skill.name));
            removed.push(basename(targetDir));
        }
    }

    return { target, bundle, removed };
}

export function normalizeSkillBundle(bundle?: string): SkillBundle {
    const normalized = (bundle ?? 'cli').trim().toLowerCase();
    if (normalized === 'cli' || normalized === 'mcp' || normalized === 'all') return normalized;
    throw new Error(`无效技能包 "${bundle}". 请使用 cli、mcp 或 all；三者均只提供 siyuan 入口。`);
}

function isProjectSkill(directory: string, name: string): boolean {
    try {
        if (!lstatSync(directory).isDirectory()) return false;
        const content = readFileSync(join(directory, 'SKILL.md'), 'utf8');
        return content.startsWith('---\n') && content.split('\n').includes(`name: ${name}`)
            && (content.includes('SiYuan Sisyphus') || content.includes('SiYuan Note through the Sisyphus')
            || content.includes('Requires the maintained siyuan-sisyphus CLI to be installed and configured for the target SiYuan workspace.'));
    } catch {
        return false;
    }
}

function validateSkillName(name: string): void {
    if (!name || name === '.' || name === '..') {
        throw new Error(`无效技能目标: "${name || '(empty)'}".`);
    }
    if (/[\\/]/.test(name) || !/^[A-Za-z0-9._-]+$/.test(name)) {
        throw new Error(`无效技能目标: "${name}". 请使用 agents、claude、codex 或 .codex 等简单名称。`);
    }
}

#!/usr/bin/env node

import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { scenarios } from '../skills/source/scenarios.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const knowledgeIngestScript = await readFile(path.join(root, 'skills/source/normalize-source.mjs'), 'utf8');
const projectCoordinatorOutputContract = await readFile(
    path.join(root, 'skills/source/project-coordinator-output-contract.md'),
    'utf8',
);
const projectCoordinatorInitialization = await readFile(
    path.join(root, 'skills/source/project-coordinator-initialization.md'),
    'utf8',
);
const entryReferences = await Promise.all(['recording-contract', 'recording-examples', 'paper-teaching', 'paper-teaching-examples'].map(async name => ({
    name, text: await readFile(path.join(root, `skills/source/${name}.md`), 'utf8'),
})));
const check = process.argv.includes('--check');
const validArgs = new Set(['--check']);
const unknownArgs = process.argv.slice(2).filter((arg) => !validArgs.has(arg));
if (unknownArgs.length) {
    throw new Error(`Unknown argument(s): ${unknownArgs.join(', ')}`);
}

const scenarioIds = new Set(scenarios.map((scenario) => scenario.id));
for (const scenario of scenarios) {
    for (const match of scenario.body.matchAll(/\{\{skill ([a-z0-9-]+)\}\}/g)) {
        if (!scenarioIds.has(match[1])) {
            throw new Error(`${scenario.id}: referenced scenario skill does not exist: ${match[1]}`);
        }
    }
}

const CLI_ENTRY_GUARD = `## Resolve the CLI entry first

Before the first SiYuan CLI call in every new session, verify that the local command is available:

\`\`\`bash
command -v siyuan-sisyphus
siyuan-sisyphus --version
\`\`\`

If the command is missing, resolve a locally installed or user-provided maintained CLI entry before continuing. Do not use \`npx\` as an implicit fallback. A public npm package may lag the locally maintained plugin and silently omit custom actions or safety contracts.

After resolving the entry, start with the read-only live bootstrap:

\`\`\`bash
siyuan-sisyphus system bootstrap --json
\`\`\``;

const kebab = (value) => value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replaceAll('_', '-')
    .toLowerCase();

function shellQuote(value) {
    const string = typeof value === 'string' ? value : JSON.stringify(value);
    return `'${string.replaceAll("'", `'\"'\"'`)}'`;
}

function renderMcpValue(value) {
    return JSON.stringify(value);
}

function renderCall(spec, runtime) {
    if (runtime === 'mcp') {
        const args = Object.entries(spec.args)
            .map(([key, value]) => `${key}=${renderMcpValue(value)}`);
        return `\`\`\`text\n${spec.tool}(action=${JSON.stringify(spec.action)}${args.length ? `, ${args.join(', ')}` : ''})\n\`\`\``;
    }

    const flags = Object.entries(spec.args).flatMap(([key, value]) => {
        if (value === false) return [`--no-${kebab(key)}`];
        if (value === true) return [`--${kebab(key)}`];
        if (Array.isArray(value) || (value && typeof value === 'object')) {
            return [`--${kebab(key)}-json`, shellQuote(value)];
        }
        return [`--${kebab(key)}`, shellQuote(value)];
    });
    return `\`\`\`bash\nsiyuan-sisyphus ${spec.tool} ${kebab(spec.action)}${flags.length ? ` ${flags.join(' ')}` : ''} --json\n\`\`\``;
}

function renderHelp(tool, action, runtime) {
    if (runtime === 'mcp') {
        if (tool === '*') return '`siyuan://help/tool-overview` and the relevant `siyuan://help/action/{tool}/{action}` resource';
        return `\`siyuan://help/action/${tool}/${action}\``;
    }
    if (tool === '*') return '`siyuan-sisyphus list` and `siyuan-sisyphus help <tool> <action>`';
    return `\`siyuan-sisyphus help ${tool} ${kebab(action)}\``;
}

function renderBody(scenario, runtime) {
    return scenario.body
        .replace(/\{\{call ([a-zA-Z0-9]+)\}\}/g, (_, key) => {
            const spec = scenario.calls[key];
            if (!spec) throw new Error(`${scenario.id}: unknown call ${key}`);
            return renderCall(spec, runtime);
        })
        .replace(/\{\{help ([a-zA-Z0-9*-]+) ([a-zA-Z0-9_*-]+)\}\}/g, (_, tool, action) => renderHelp(tool, action, runtime))
        .replace(/\{\{skill ([a-z0-9-]+)\}\}/g, (_, id) => `\`${runtime === 'mcp' ? `siyuan-mcp-${id}` : id === 'markup-guide' ? 'siyuan-markup-guide' : id === 'system-safety' ? 'siyuan-sisyphus-system-cli' : `siyuan-sisyphus-${id}`}\``)
        .replace(/\{\{runtime ([a-zA-Z0-9]+)\}\}/g, () => scenario.runtime?.[runtime] ?? '')
        .trim();
}

function yamlQuote(value) {
    return JSON.stringify(value);
}

function renderSkill(scenario, runtime, publicName) {
    const name = publicName ?? (runtime === 'mcp' ? scenario.mcpName : scenario.cliName);
    const description = runtime === 'mcp' ? scenario.mcpDescription : scenario.cliDescription;
    const compatibility = runtime === 'mcp'
        ? 'Requires a reachable SiYuan Sisyphus MCP server already registered in the client; installing this Skill alone does not configure the MCP endpoint or bearer token.'
        : 'Requires the maintained siyuan-sisyphus CLI to be installed and configured for the target SiYuan workspace.';
    const runtimeTitle = runtime === 'mcp' ? `${scenario.title} with MCP` : `${scenario.title} with the CLI`;
    const entryGuard = runtime === 'cli' ? `${CLI_ENTRY_GUARD}\n\n` : '';
    return `---\nname: ${name}\ndescription: ${description}\ncompatibility: ${yamlQuote(compatibility)}\n---\n\n# ${runtimeTitle}\n\n${entryGuard}${renderBody(scenario, runtime)}\n`;
}

function renderOpenAiYaml(scenario, runtime, publicName) {
    const name = publicName ?? (runtime === 'mcp' ? scenario.mcpName : scenario.cliName);
    const displayName = runtime === 'mcp'
        ? (scenario.mcpDisplayName ?? `${scenario.displayName} MCP`)
        : (scenario.cliDisplayName ?? `${scenario.displayName} CLI`);
    const policy = scenario.allowImplicitInvocation === false
        ? 'policy:\n  allow_implicit_invocation: false\n'
        : '';
    return `interface:\n  display_name: ${yamlQuote(displayName)}\n  short_description: ${yamlQuote(scenario.shortDescription)}\n  default_prompt: ${yamlQuote(scenario.defaultPrompt.replaceAll('$NAME', `$${name}`))}\n${policy}`;
}

async function syncFile(relativePath, expected) {
    const absolutePath = path.join(root, relativePath);
    if (check) {
        let actual;
        try {
            actual = await readFile(absolutePath, 'utf8');
        } catch {
            throw new Error(`Missing generated file: ${relativePath}`);
        }
        if (actual !== expected) throw new Error(`Generated file is stale: ${relativePath}`);
        return;
    }
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, expected, 'utf8');
}

for (const scenario of scenarios) {
    for (const runtime of ['cli', 'mcp']) {
        const bundle = runtime === 'mcp' ? 'siyuan-mcp' : 'siyuan-sisyphus';
        const name = runtime === 'mcp' ? scenario.mcpName : scenario.cliName;
        const base = `skills/${bundle}/${name}`;
        const skill = renderSkill(scenario, runtime);
        if (runtime === 'mcp' && /\bsiyuan-sisyphus\s+(fs|notebook|document|block|av|file|project|search|literature|provenance|tag|timeline|system|flashcard|mascot|feedback)\b/.test(skill)) {
            throw new Error(`MCP skill contains a CLI command: ${scenario.mcpName}`);
        }
        if (runtime === 'cli' && /\b[a-z]+\(action=/.test(skill)) {
            throw new Error(`CLI skill contains MCP call syntax: ${scenario.cliName}`);
        }
        await syncFile(`${base}/SKILL.md`, skill);
        await syncFile(`${base}/agents/openai.yaml`, renderOpenAiYaml(scenario, runtime));
        if (scenario.id === 'knowledge-ingest') {
            await syncFile(`${base}/scripts/normalize-source.mjs`, knowledgeIngestScript);
        }
        if (scenario.id === 'project-coordinator') {
            await syncFile(
                `${base}/references/project-panorama-output-contract.md`,
                projectCoordinatorOutputContract,
            );
            await syncFile(
                `${base}/references/project-progress-initialization.md`,
                projectCoordinatorInitialization,
            );
        }
    }
}

// 只发布一个可发现入口；场景按需读取，不在安装目录展开成多套技能。
const entry = scenarios.find(scenario => scenario.id === 'sisyphus');
const publicRoots = ['skills/codex/siyuan', 'agent-kit/skills/siyuan', 'agent-plugin/siyuan-sisyphus/skills/siyuan'];
for (const base of publicRoots) {
    await syncFile(`${base}/SKILL.md`, renderSkill(entry, 'mcp', 'siyuan'));
    await syncFile(`${base}/agents/openai.yaml`, renderOpenAiYaml(entry, 'mcp', 'siyuan'));
    for (const ref of entryReferences) await syncFile(`${base}/references/${ref.name}.md`, ref.text);
    await syncFile(`${base}/references/project-panorama-output-contract.md`, projectCoordinatorOutputContract);
    await syncFile(`${base}/references/project-progress-initialization.md`, projectCoordinatorInitialization);
    for (const scenario of scenarios) {
        let cli = renderBody(scenario, 'cli');
        for (const target of scenarios) cli = cli.replaceAll(`\`${target.cliName}\``, `[${target.title}](cli-${target.id}.md)`);
        await syncFile(`${base}/references/cli-${scenario.id}.md`, `${CLI_ENTRY_GUARD}\n\n${cli}\n`);
    }
    await syncFile(`${base}/references/cli.md`, `${CLI_ENTRY_GUARD}\n\n本机 CLI 后备入口：[操作规程](cli-sisyphus.md)。优先使用已连接 MCP，不重复注册连接或隐式下载旧版。\n`);
}

async function findSkillFiles(directory) {
    const entries = await readdir(path.join(root, directory), { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const relative = `${directory}/${entry.name}`;
        if (entry.isDirectory()) files.push(...await findSkillFiles(relative));
        else if (entry.name === 'SKILL.md') files.push(relative);
    }
    return files;
}
for (const directory of ['skills/codex', 'agent-kit/skills', 'agent-plugin/siyuan-sisyphus/skills']) {
    const files = await findSkillFiles(directory);
    if (files.length !== 1 || files[0] !== `${directory}/siyuan/SKILL.md`) {
        throw new Error(`公开技能目录只能包含 siyuan 入口，请先核对并迁移残留文件：${files.join(', ')}`);
    }
}

console.log(`已${check ? '核验' : '生成'} ${scenarios.length} 个内部场景的 MCP／CLI 规程；公开为 siyuan 一个入口，三个交付载体。`);

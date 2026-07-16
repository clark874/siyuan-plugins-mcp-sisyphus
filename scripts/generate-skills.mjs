#!/usr/bin/env node

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { scenarios } from '../skills/source/scenarios.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const validArgs = new Set(['--check']);
const unknownArgs = process.argv.slice(2).filter((arg) => !validArgs.has(arg));
if (unknownArgs.length) {
    throw new Error(`Unknown argument(s): ${unknownArgs.join(', ')}`);
}

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

function renderSkill(scenario, runtime) {
    const name = runtime === 'mcp' ? scenario.mcpName : scenario.cliName;
    const description = runtime === 'mcp' ? scenario.mcpDescription : scenario.cliDescription;
    const runtimeTitle = runtime === 'mcp' ? `${scenario.title} with MCP` : `${scenario.title} with the CLI`;
    return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${runtimeTitle}\n\n${renderBody(scenario, runtime)}\n`;
}

function renderOpenAiYaml(scenario, runtime) {
    const name = runtime === 'mcp' ? scenario.mcpName : scenario.cliName;
    const displayName = runtime === 'mcp' ? `${scenario.displayName} MCP` : `${scenario.displayName} CLI`;
    return `interface:\n  display_name: ${yamlQuote(displayName)}\n  short_description: ${yamlQuote(scenario.shortDescription)}\n  default_prompt: ${yamlQuote(scenario.defaultPrompt.replace('$NAME', `$${name}`))}\n`;
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
        if (runtime === 'mcp' && /\bsiyuan-sisyphus\s+(fs|notebook|document|block|av|file|search|tag|system|flashcard|mascot|feedback)\b/.test(skill)) {
            throw new Error(`MCP skill contains a CLI command: ${scenario.mcpName}`);
        }
        if (runtime === 'cli' && /\b[a-z]+\(action=/.test(skill)) {
            throw new Error(`CLI skill contains MCP call syntax: ${scenario.cliName}`);
        }
        await syncFile(`${base}/SKILL.md`, skill);
        await syncFile(`${base}/agents/openai.yaml`, renderOpenAiYaml(scenario, runtime));
    }
}

console.log(check
    ? `Verified ${scenarios.length} MCP skills, ${scenarios.length} CLI skills, and ${scenarios.length * 2} metadata files.`
    : `Generated ${scenarios.length} MCP skills, ${scenarios.length} CLI skills, and ${scenarios.length * 2} metadata files.`);

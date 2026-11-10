import { createHash } from 'node:crypto';

import indexSkill from '../../skills/siyuan-mcp/siyuan-mcp-sisyphus/SKILL.md?raw';
import browseReadSkill from '../../skills/siyuan-mcp/siyuan-mcp-browse-read/SKILL.md?raw';
import literatureSourceSkill from '../../skills/siyuan-mcp/siyuan-mcp-literature-source/SKILL.md?raw';
import createEditSkill from '../../skills/siyuan-mcp/siyuan-mcp-create-edit/SKILL.md?raw';
import knowledgeIngestSkill from '../../skills/siyuan-mcp/siyuan-mcp-knowledge-ingest/SKILL.md?raw';
import knowledgeIngestNormalizeScript from '../../skills/siyuan-mcp/siyuan-mcp-knowledge-ingest/scripts/normalize-source.mjs?raw';
import projectKnowledgeCompileSkill from '../../skills/siyuan-mcp/siyuan-mcp-project-knowledge-compile/SKILL.md?raw';
import projectCoordinatorSkill from '../../skills/siyuan-mcp/siyuan-mcp-project-coordinator/SKILL.md?raw';
import projectCoordinatorOutputContract from '../../skills/siyuan-mcp/siyuan-mcp-project-coordinator/references/project-panorama-output-contract.md?raw';
import projectCoordinatorInitialization from '../../skills/siyuan-mcp/siyuan-mcp-project-coordinator/references/project-progress-initialization.md?raw';
import knowledgeGovernanceSkill from '../../skills/siyuan-mcp/siyuan-mcp-knowledge-governance/SKILL.md?raw';
import crossProjectRelationClosureSkill from '../../skills/siyuan-mcp/siyuan-mcp-cross-project-relation-closure/SKILL.md?raw';
import searchQuerySkill from '../../skills/siyuan-mcp/siyuan-mcp-search-query/SKILL.md?raw';
import databaseSkill from '../../skills/siyuan-mcp/siyuan-mcp-database/SKILL.md?raw';
import projectSourceSkill from '../../skills/siyuan-mcp/siyuan-mcp-project-source/SKILL.md?raw';
import timelineSkill from '../../skills/siyuan-mcp/siyuan-mcp-timeline/SKILL.md?raw';
import systemSafetySkill from '../../skills/siyuan-mcp/siyuan-mcp-system-safety/SKILL.md?raw';
import markupGuideSkill from '../../skills/siyuan-mcp/siyuan-mcp-markup-guide/SKILL.md?raw';
import publicSkill from '../../skills/codex/siyuan/SKILL.md?raw';
import publicAgent from '../../skills/codex/siyuan/agents/openai.yaml?raw';
const cliReferences = import.meta.glob('../../skills/codex/siyuan/references/cli*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
import recordingContract from '../../skills/source/recording-contract.md?raw';
import recordingExamples from '../../skills/source/recording-examples.md?raw';
import paperTeaching from '../../skills/source/paper-teaching.md?raw';
import paperTeachingExamples from '../../skills/source/paper-teaching-examples.md?raw';

export const SKILL_INDEX_URI = 'siyuan://skills/index';
export const SKILL_RESOURCE_TEMPLATE_URI = 'siyuan://skills/{name}';

export interface McpSkillDefinition {
    name: string;
    title: string;
    description: string;
    promptName: string;
    text: string;
    files: Array<{ path: string; text: string; mimeType: string }>;
}

function createMcpSkill(
    text: string,
    additionalFiles: Array<{ path: string; text: string; mimeType: string }> = [],
): McpSkillDefinition {
    const frontmatter = text.match(/^---\nname: ([a-z0-9-]+)\ndescription: ([^\n]+)\n(?:[a-z][a-z0-9-]*: [^\n]*\n)*---/);
    const heading = text.match(/^# (.+)$/m);
    if (!frontmatter || !heading) {
        throw new Error('Generated MCP skill is missing canonical frontmatter or a title.');
    }

    const name = frontmatter[1];
    const promptSuffix = name === 'siyuan-mcp-sisyphus'
        ? 'mcp_sisyphus'
        : name.replace(/^siyuan-mcp-/, '').replace(/-/g, '_');

    return {
        name,
        title: heading[1].replace(/ with MCP$/, ''),
        description: frontmatter[2],
        promptName: name === 'siyuan' ? 'siyuan' : `siyuan_${promptSuffix}`,
        text,
        files: [
            { path: 'SKILL.md', text, mimeType: 'text/markdown' },
            ...additionalFiles,
        ],
    };
}

const recordingFiles = [
    { path: 'references/recording-contract.md', text: recordingContract, mimeType: 'text/markdown' },
    { path: 'references/recording-examples.md', text: recordingExamples, mimeType: 'text/markdown' },
    { path: 'references/paper-teaching.md', text: paperTeaching, mimeType: 'text/markdown' },
    { path: 'references/paper-teaching-examples.md', text: paperTeachingExamples, mimeType: 'text/markdown' },
];

export const PUBLIC_MCP_SKILLS: readonly McpSkillDefinition[] = [
    createMcpSkill(publicSkill, [
        { path: 'agents/openai.yaml', text: publicAgent, mimeType: 'application/yaml' },
        ...recordingFiles,
        ...Object.entries(cliReferences).map(([path, text]) => ({ path: `references/${path.split('/').pop()}`, text, mimeType: 'text/markdown' })),
    ]),
];

// 场景只供按需读取，不作为额外的用户入口列出。
export const MCP_SKILLS: readonly McpSkillDefinition[] = [
    createMcpSkill(indexSkill, recordingFiles),
    createMcpSkill(browseReadSkill),
    createMcpSkill(literatureSourceSkill),
    createMcpSkill(createEditSkill),
    createMcpSkill(knowledgeIngestSkill, [{
        path: 'scripts/normalize-source.mjs',
        text: knowledgeIngestNormalizeScript,
        mimeType: 'text/javascript',
    }]),
    createMcpSkill(projectKnowledgeCompileSkill),
    createMcpSkill(projectCoordinatorSkill, [
        {
            path: 'references/project-panorama-output-contract.md',
            text: projectCoordinatorOutputContract,
            mimeType: 'text/markdown',
        },
        {
            path: 'references/project-progress-initialization.md',
            text: projectCoordinatorInitialization,
            mimeType: 'text/markdown',
        },
    ]),
    createMcpSkill(knowledgeGovernanceSkill),
    createMcpSkill(crossProjectRelationClosureSkill),
    createMcpSkill(searchQuerySkill),
    createMcpSkill(databaseSkill),
    createMcpSkill(projectSourceSkill),
    createMcpSkill(timelineSkill),
    createMcpSkill(systemSafetySkill),
    createMcpSkill(markupGuideSkill),
];

export const SEP_MCP_SKILLS: readonly McpSkillDefinition[] = [
    ...PUBLIC_MCP_SKILLS,
    ...MCP_SKILLS,
];

export interface SepSkillEntry {
    uri: string;
    frontmatter: { name: string; description: string };
    resources: Array<{ uri: string; digest: string }>;
}

function skillFileUri(skill: McpSkillDefinition, path: string): string {
    return `skill://${skill.name}/${path}`;
}

function digest(text: string): string {
    return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

function toSepSkillEntry(skill: McpSkillDefinition): SepSkillEntry {
    return {
        uri: skillFileUri(skill, 'SKILL.md'),
        frontmatter: {
            name: skill.name,
            description: skill.description,
        },
        resources: skill.files.map((file) => ({
            uri: skillFileUri(skill, file.path),
            digest: digest(file.text),
        })),
    };
}

export function listSepSkills(): SepSkillEntry[] {
    return PUBLIC_MCP_SKILLS.map(toSepSkillEntry);
}

export function getSepSkill(uri: string): SepSkillEntry | undefined {
    const skill = SEP_MCP_SKILLS.find((candidate) => skillFileUri(candidate, 'SKILL.md') === uri);
    return skill ? toSepSkillEntry(skill) : undefined;
}

export function listSepSkillResources() {
    return PUBLIC_MCP_SKILLS.flatMap((skill) => skill.files.map((file) => ({
        uri: skillFileUri(skill, file.path),
        name: file.path === 'SKILL.md' ? skill.name : file.path.split('/').slice(-1)[0] ?? file.path,
        title: file.path === 'SKILL.md' ? skill.title : `${skill.title}: ${file.path}`,
        description: file.path === 'SKILL.md' ? skill.description : `Supporting file for ${skill.name}.`,
        mimeType: file.mimeType,
        })));
}

export function readSepSkillResource(uri: string) {
    for (const skill of SEP_MCP_SKILLS) {
        const file = skill.files.find((candidate) => skillFileUri(skill, candidate.path) === uri);
        if (file) {
            return { uri, mimeType: file.mimeType, text: file.text };
        }
    }
    return undefined;
}

export function getMcpSkill(name: string): McpSkillDefinition | undefined {
    return [...PUBLIC_MCP_SKILLS, ...MCP_SKILLS].find((skill) => skill.name === name);
}

export function getMcpSkillByPromptName(promptName: string): McpSkillDefinition | undefined {
    return [...PUBLIC_MCP_SKILLS, ...MCP_SKILLS].find((skill) => skill.promptName === promptName);
}

export function renderMcpSkillIndex(): string {
    const rows = PUBLIC_MCP_SKILLS.map((skill) =>
        `| \`${skill.name}\` | ${skill.description} | \`siyuan://skills/${skill.name}\` |`,
    );

    return [
        '# 思源笔记统一入口',
        '',
        '从唯一入口 `siyuan` 按自然任务选择规程；场景资源按需读取，不安装额外入口。参数以 `siyuan://help/action/{tool}/{action}` 为准。',
        '',
        '| 入口 | 用途 | 资源 |',
        '| --- | --- | --- |',
        ...rows,
        '',
        '客户端不能读取资源时，调用相应工具的 `action="help"`。',
    ].join('\n');
}

export function listMcpPrompts() {
    return PUBLIC_MCP_SKILLS.map((skill) => ({
        name: skill.promptName,
        title: skill.title,
        description: skill.description,
        arguments: [{
            name: 'task',
            description: 'Optional concrete SiYuan task to perform with this workflow.',
            required: false,
        }],
    }));
}

export function getMcpPrompt(name: string, task?: string) {
    const skill = getMcpSkillByPromptName(name);
    if (!skill) return null;

    const normalizedTask = typeof task === 'string' ? task.trim() : '';
    const taskSection = normalizedTask
        ? `\n\n## Requested task\n\n${normalizedTask}`
        : '';

    return {
        description: skill.description,
        messages: [{
            role: 'user' as const,
            content: {
                type: 'text' as const,
                text: `${skill.text.trim()}${taskSection}`,
            },
        }],
    };
}

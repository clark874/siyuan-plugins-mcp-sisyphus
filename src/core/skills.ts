import indexSkill from '../../skills/siyuan-mcp/siyuan-mcp-sisyphus/SKILL.md?raw';
import browseReadSkill from '../../skills/siyuan-mcp/siyuan-mcp-browse-read/SKILL.md?raw';
import createEditSkill from '../../skills/siyuan-mcp/siyuan-mcp-create-edit/SKILL.md?raw';
import searchQuerySkill from '../../skills/siyuan-mcp/siyuan-mcp-search-query/SKILL.md?raw';
import databaseSkill from '../../skills/siyuan-mcp/siyuan-mcp-database/SKILL.md?raw';
import fileExportSkill from '../../skills/siyuan-mcp/siyuan-mcp-file-export/SKILL.md?raw';
import tagFlashcardSkill from '../../skills/siyuan-mcp/siyuan-mcp-tag-flashcard/SKILL.md?raw';
import timelineSkill from '../../skills/siyuan-mcp/siyuan-mcp-timeline/SKILL.md?raw';
import systemSafetySkill from '../../skills/siyuan-mcp/siyuan-mcp-system-safety/SKILL.md?raw';
import markupGuideSkill from '../../skills/siyuan-mcp/siyuan-mcp-markup-guide/SKILL.md?raw';

export const SKILL_INDEX_URI = 'siyuan://skills/index';
export const SKILL_RESOURCE_TEMPLATE_URI = 'siyuan://skills/{name}';

export interface McpSkillDefinition {
    name: string;
    title: string;
    description: string;
    promptName: string;
    text: string;
}

function createMcpSkill(text: string): McpSkillDefinition {
    const frontmatter = text.match(/^---\nname: ([a-z0-9-]+)\ndescription: ([^\n]+)\n---/);
    const heading = text.match(/^# (.+)$/m);
    if (!frontmatter || !heading) {
        throw new Error('Generated MCP skill is missing canonical frontmatter or a title.');
    }

    const name = frontmatter[1];
    const promptSuffix = name === 'siyuan-mcp-sisyphus'
        ? 'mcp_sisyphus'
        : name.replace(/^siyuan-mcp-/, '').replaceAll('-', '_');

    return {
        name,
        title: heading[1].replace(/ with MCP$/, ''),
        description: frontmatter[2],
        promptName: `siyuan_${promptSuffix}`,
        text,
    };
}

export const MCP_SKILLS: readonly McpSkillDefinition[] = [
    indexSkill,
    browseReadSkill,
    createEditSkill,
    searchQuerySkill,
    databaseSkill,
    fileExportSkill,
    tagFlashcardSkill,
    timelineSkill,
    systemSafetySkill,
    markupGuideSkill,
].map(createMcpSkill);

export function getMcpSkill(name: string): McpSkillDefinition | undefined {
    return MCP_SKILLS.find((skill) => skill.name === name);
}

export function getMcpSkillByPromptName(promptName: string): McpSkillDefinition | undefined {
    return MCP_SKILLS.find((skill) => skill.promptName === promptName);
}

export function renderMcpSkillIndex(): string {
    const rows = MCP_SKILLS.map((skill) =>
        `| \`${skill.name}\` | ${skill.description} | \`siyuan://skills/${skill.name}\` |`,
    );

    return [
        '# SiYuan MCP Skill Index',
        '',
        'Use the narrowest scenario skill that matches the task. Skills define workflows, decisions, and safety rules; current parameter shapes remain in `siyuan://help/action/{tool}/{action}`.',
        '',
        '| Skill | Use for | Resource |',
        '| --- | --- | --- |',
        ...rows,
        '',
        'If the client cannot read MCP resources, call the relevant tool with `action="help"`.',
    ].join('\n');
}

export function listMcpPrompts() {
    return MCP_SKILLS.map((skill) => ({
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

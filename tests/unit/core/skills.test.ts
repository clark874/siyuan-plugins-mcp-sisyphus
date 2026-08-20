import { describe, expect, it } from 'vitest';

import {
    MCP_SKILLS,
    getMcpPrompt,
    listMcpPrompts,
    renderMcpSkillIndex,
} from '@/core/skills';
import {
    AV_VARIANTS,
    BLOCK_VARIANTS,
    DOCUMENT_VARIANTS,
    FILE_VARIANTS,
    FLASHCARD_VARIANTS,
    FS_VARIANTS,
    NOTEBOOK_VARIANTS,
    SEARCH_VARIANTS,
    SYSTEM_VARIANTS,
    TAG_VARIANTS,
    TIMELINE_VARIANTS,
} from '@/tools/index';
import { scenarios } from '../../../skills/source/scenarios.mjs';

const variantsByTool: Record<string, Array<{ action: string; schema: Record<string, any> }>> = {
    av: AV_VARIANTS,
    block: BLOCK_VARIANTS,
    document: DOCUMENT_VARIANTS,
    file: FILE_VARIANTS,
    flashcard: FLASHCARD_VARIANTS,
    fs: FS_VARIANTS,
    notebook: NOTEBOOK_VARIANTS,
    search: SEARCH_VARIANTS,
    system: SYSTEM_VARIANTS,
    tag: TAG_VARIANTS,
    timeline: TIMELINE_VARIANTS,
};

describe('core/skills', () => {
    it('embeds twelve valid MCP skills without CLI invocation examples', () => {
        expect(MCP_SKILLS).toHaveLength(12);
        expect(new Set(MCP_SKILLS.map((skill) => skill.name)).size).toBe(12);
        expect(new Set(MCP_SKILLS.map((skill) => skill.promptName)).size).toBe(12);

        for (const skill of MCP_SKILLS) {
            expect(skill.text).toContain(`name: ${skill.name}`);
            expect(skill.text).not.toMatch(/\bsiyuan-sisyphus\s+(fs|notebook|document|block|av|file|search|tag|timeline|system|flashcard|mascot|feedback)\b/);
        }

        const ingest = MCP_SKILLS.find((skill) => skill.name === 'siyuan-mcp-knowledge-ingest');
        const governance = MCP_SKILLS.find((skill) => skill.name === 'siyuan-mcp-knowledge-governance');
        const index = MCP_SKILLS.find((skill) => skill.name === 'siyuan-mcp-sisyphus');
        expect(index?.text).toContain('system(action="bootstrap")');
        expect(index?.text).toContain('operation.readOnly');
        expect(index?.text).not.toContain('system(action="get_version")');
        expect(index?.text).not.toContain('notebook(action="list")');
        expect(ingest?.files).toEqual(expect.arrayContaining([
            expect.objectContaining({ path: 'scripts/normalize-source.mjs', mimeType: 'text/javascript' }),
        ]));
        expect(ingest?.files.find((file) => file.path === 'scripts/normalize-source.mjs')?.text).toContain(
            'canonicalizeUrl',
        );
        expect(ingest?.text).toContain('来源页面自称“官方”不构成身份核验');
        expect(ingest?.text).toContain('若 `set_attrs` 失败');
        expect(ingest?.text).toContain('- 正文哈希：<sha256>');
        expect(governance?.text).toContain('四层影响');
        expect(governance?.text).toContain('数量和冲突以实时 SQL 为准');
        expect(governance?.text).toContain('拆成单个词元');
        expect(governance?.text).toContain('每一个**受影响文档');
        expect(governance?.text).toContain('任一文档无法建立恢复点时停止整批写入');
        expect(governance?.text).toContain('逐个稳定块 ID 读取完整 Kramdown');
        expect(governance?.text).toContain('block(action="update"');
        expect(governance?.text).toContain('去重前 3 名');
        expect(governance?.text).toContain('只用于写入或修改');
        expect(governance?.text).toContain('validation_error');

        const searchQuery = MCP_SKILLS.find((skill) => skill.name === 'siyuan-mcp-search-query');
        expect(searchQuery?.text).toContain('first three deduplicated');
        expect(searchQuery?.text).toContain('write-time collision preflight');
        expect(searchQuery?.text).toContain('preflight did not run');

        const governanceScenario = scenarios.find((scenario) => scenario.id === 'knowledge-governance');
        const duplicateAliasSql = governanceScenario?.calls.duplicateAliases.args.stmt ?? '';
        const conflictName = governanceScenario?.calls.conflictName;
        const conflictAlias = governanceScenario?.calls.conflictAlias;
        const verifySql = governanceScenario?.calls.verify.args.stmt ?? '';
        expect(duplicateAliasSql).toContain('WITH RECURSIVE alias_parts');
        expect(duplicateAliasSql).toContain("replace(COALESCE(alias, ''), '，', ',')");
        expect(duplicateAliasSql).toContain('trim(substr(');
        expect(duplicateAliasSql).toContain('GROUP BY lower(alias_token)');
        expect(conflictName).toMatchObject({
            tool: 'search',
            action: 'check_anchor',
            args: { candidates: ['proposed-name'], candidateKind: 'name' },
        });
        expect(conflictAlias).toMatchObject({
            tool: 'search',
            action: 'check_anchor',
            args: {
                candidates: ['proposed-alias-1', 'proposed-alias-2'],
                candidateKind: 'alias',
                activeScopes: ['<current-topic-scope>'],
            },
        });
        expect(verifySql).toContain("b.id = '<block-id>'");
        expect(verifySql).toContain("lower(b.name) = lower('stable-topic-step')");
        expect(verifySql).toContain("lower(a.alias_token) = lower('中文同义词')");
        expect(verifySql).not.toContain('alias LIKE');
    });

    it('renders a discoverable index and scenario prompts', () => {
        const index = renderMcpSkillIndex();
        const prompts = listMcpPrompts();
        const prompt = getMcpPrompt('siyuan_create_edit', 'Append a summary.');

        expect(index).toContain('siyuan://help/action/{tool}/{action}');
        expect(prompts).toHaveLength(12);
        expect(index).toContain('siyuan-mcp-timeline');
        expect(index).toContain('siyuan-mcp-knowledge-ingest');
        expect(index).toContain('siyuan-mcp-knowledge-governance');
        expect(prompts).toContainEqual(expect.objectContaining({ name: 'siyuan_timeline' }));
        expect(prompts).toContainEqual(expect.objectContaining({ name: 'siyuan_knowledge_ingest' }));
        expect(prompts).toContainEqual(expect.objectContaining({ name: 'siyuan_knowledge_governance' }));
        expect(prompts.find((item) => item.name === 'siyuan_create_edit')?.arguments).toEqual([
            expect.objectContaining({ name: 'task', required: false }),
        ]);
        expect(prompt?.messages[0].content.text).toContain('Append a summary.');
        expect(prompt?.messages[0].content.text).toContain('name: siyuan-mcp-create-edit');
        expect(getMcpPrompt('unknown')).toBeNull();
    });

    it('keeps every structured example aligned with the live action schemas', () => {
        for (const scenario of scenarios) {
            for (const [callName, call] of Object.entries(scenario.calls) as Array<[string, { tool: string; action: string; args: Record<string, unknown> }]>) {
                const variant = variantsByTool[call.tool]?.find((item) => item.action === call.action);
                expect(variant, `${scenario.id}.${callName} action`).toBeDefined();

                const properties = variant?.schema.properties ?? {};
                for (const key of Object.keys(call.args)) {
                    expect(properties, `${scenario.id}.${callName} field ${key}`).toHaveProperty(key);
                }
                for (const required of variant?.schema.required ?? []) {
                    if (required === 'action') continue;
                    expect(call.args, `${scenario.id}.${callName} required ${required}`).toHaveProperty(required);
                }
            }
        }
    });
});

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
    PROJECT_VARIANTS,
    PROVENANCE_VARIANTS,
    SEARCH_VARIANTS,
    SYSTEM_VARIANTS,
    TAG_VARIANTS,
    TIMELINE_VARIANTS,
} from '@/tools/index';
import { scenarios } from '../../../skills/source/scenarios.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const variantsByTool: Record<string, Array<{ action: string; schema: Record<string, any> }>> = {
    av: AV_VARIANTS,
    block: BLOCK_VARIANTS,
    document: DOCUMENT_VARIANTS,
    file: FILE_VARIANTS,
    flashcard: FLASHCARD_VARIANTS,
    fs: FS_VARIANTS,
    notebook: NOTEBOOK_VARIANTS,
    provenance: PROVENANCE_VARIANTS,
    project: PROJECT_VARIANTS,
    search: SEARCH_VARIANTS,
    system: SYSTEM_VARIANTS,
    tag: TAG_VARIANTS,
    timeline: TIMELINE_VARIANTS,
};

describe('core/skills', () => {
    it('embeds fifteen valid MCP skills without CLI invocation examples', () => {
        expect(MCP_SKILLS).toHaveLength(15);
        expect(new Set(MCP_SKILLS.map((skill) => skill.name)).size).toBe(15);
        expect(new Set(MCP_SKILLS.map((skill) => skill.promptName)).size).toBe(15);

        for (const skill of MCP_SKILLS) {
            expect(skill.text).toContain(`name: ${skill.name}`);
            expect(skill.text).toContain('compatibility:');
            expect(skill.text).toContain('Requires a reachable SiYuan Sisyphus MCP server');
            expect(skill.text).not.toMatch(/\bsiyuan-sisyphus\s+(fs|notebook|document|block|av|file|search|tag|timeline|system|flashcard|mascot|feedback)\b/);
        }

        const ingest = MCP_SKILLS.find((skill) => skill.name === 'siyuan-mcp-knowledge-ingest');
        const projectCompile = MCP_SKILLS.find((skill) => skill.name === 'siyuan-mcp-project-knowledge-compile');
        const projectCoordinator = MCP_SKILLS.find((skill) => skill.name === 'siyuan-mcp-project-coordinator');
        const governance = MCP_SKILLS.find((skill) => skill.name === 'siyuan-mcp-knowledge-governance');
        const relationClosure = MCP_SKILLS.find((skill) => skill.name === 'siyuan-mcp-cross-project-relation-closure');
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
        expect(projectCompile?.text).toContain('项目内语义关系闭合');
        expect(projectCompile?.text).toContain('custom-reuse-scope=public-candidate');
        expect(projectCompile?.text).toContain('produced-by');
        expect(projectCompile?.text).toContain('不把所有文字提及变成引用');
        expect(projectCompile?.text).toContain('workstream=');
        expect(projectCompile?.text.indexOf('provenance(action="register_session"')).toBeLessThan(projectCompile?.text.indexOf('provenance(action="record_event"'));
        expect(projectCoordinator?.text).toContain('公开命令只有“启动”“交接”“知识化”“收尾”');
        expect(projectCoordinator?.text).toContain('知识化\`：只处理本轮可长期复用');
        expect(projectCoordinator?.text).toContain('references/project-panorama-output-contract.md');
        expect(projectCoordinator?.text).toContain('本轮工作差量');
        expect(projectCoordinator?.text).toContain('并发 Agent 更新');
        expect(projectCoordinator?.files).toEqual(expect.arrayContaining([
            expect.objectContaining({
                path: 'references/project-panorama-output-contract.md',
                mimeType: 'text/markdown',
            }),
        ]));
        const panoramaContract = projectCoordinator?.files.find(
            (file) => file.path === 'references/project-panorama-output-contract.md',
        )?.text ?? '';
        expect(panoramaContract).toContain('## 三、固定输出模板');
        expect(panoramaContract).toContain('## 1. 项目是什么');
        expect(panoramaContract).toContain('## 5. 当前权威文件');
        expect(panoramaContract).toContain('如果项目协调器、MCP 或验收环境不存在');
        expect(panoramaContract).toContain('不得截断 sessionId');
        expect(panoramaContract).toContain('项目进度页只保存相对路径');
        expect(projectCoordinator?.text).toContain('environment|client_context|explicit|inferred_latest_rollout');
        expect(projectCoordinator?.text).toContain('project(action="snapshot"');
        expect(projectCoordinator?.text).toContain('references/project-progress-initialization.md');
        expect(projectCoordinator?.text).not.toContain('search(action="query_sql"');
        expect(projectCoordinator?.text).toContain('不创建第二个检查点块');
        expect(projectCoordinator?.text).toContain('状态投影待重建');
        expect(projectCoordinator?.text).toContain('最多读取 5 个');
        expect(projectCoordinator?.text).toContain('本地权威文件 ↔ 项目源清单 ↔ 思源投影/知识');
        expect(projectCoordinator?.text).toContain('均直接使用 `snapshot.diagnostics`');
        expect(projectCoordinator?.text).toContain('先检查命令退出状态');
        expect(projectCoordinator?.text).toContain('宿主私有 memory、旧 rollout 和聊天记录不得用于补全项目事实');
        expect(projectCoordinator?.text).toContain('机器判断只以 snapshot 为准');
        expect(projectCoordinator?.text).toContain('workstream=');
        expect(projectCoordinator?.text.indexOf('provenance(action="register_session"')).toBeLessThan(projectCoordinator?.text.indexOf('provenance(action="record_event"'));
        expect(projectCoordinator?.text).not.toContain('800 token');
        expect(projectCoordinator?.text).not.toContain('LEFT JOIN attributes');
        expect(projectCoordinator?.text).not.toContain('COALESCE(t.value');
        const projectCoordinatorOpenAi = readFileSync(path.join(
            path.resolve(__dirname, '../../..'),
            'skills/siyuan-mcp/siyuan-mcp-project-coordinator/agents/openai.yaml',
        ), 'utf8');
        expect(projectCoordinatorOpenAi).toContain('allow_implicit_invocation: false');
        expect(projectCoordinatorOpenAi).toContain('display_name: "项目协同"');
        expect(projectCoordinatorOpenAi).not.toContain('$NAME');
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
        expect(relationClosure?.text).toContain('active-reuse');
        expect(relationClosure?.text).toContain('public-candidate');
        expect(relationClosure?.text).toContain('项目内语义边和跨项目复用必须分别统计');

        const searchQuery = MCP_SKILLS.find((skill) => skill.name === 'siyuan-mcp-search-query');
        expect(searchQuery?.text).toContain('first three deduplicated');
        expect(searchQuery?.text).toContain('write-time collision preflight');
        expect(searchQuery?.text).toContain('preflight did not run');

        expect(ingest?.text).toContain('只在外部来源需要写入思源知识库时使用');
        expect(governance?.text).toContain('普通检索应使用');
        expect(searchQuery?.text).toContain('Do not use check_anchor to retrieve existing content');

        const database = MCP_SKILLS.find((skill) => skill.name === 'siyuan-mcp-database');
        const markup = MCP_SKILLS.find((skill) => skill.name === 'siyuan-mcp-markup-guide');
        expect(database?.text).toContain('Do not use for read-only SQL analytics');
        expect(markup?.text).toContain('standard Markdown is assumed knowledge');

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

    it('ships a bounded routing evaluation set for the public MCP skill bundle', () => {
        const root = path.resolve(__dirname, '../../..');
        const evals = JSON.parse(readFileSync(path.join(root, 'skills/evals/mcp-routing.json'), 'utf8'));

        expect(evals.schemaVersion).toBe(1);
        expect(evals.cases).toHaveLength(29);
        expect(new Set(evals.cases.map((item: { id: string }) => item.id)).size).toBe(29);
        const routedSkills = evals.cases
            .map((item: { expectedSkill: string | null }) => item.expectedSkill)
            .filter(Boolean);
        expect(routedSkills).toEqual(expect.arrayContaining([
            'siyuan-mcp-search-query',
            'siyuan-mcp-knowledge-ingest',
            'siyuan-mcp-project-knowledge-compile',
            'siyuan-mcp-project-coordinator',
            'siyuan-mcp-knowledge-governance',
            'siyuan-mcp-cross-project-relation-closure',
            'siyuan-mcp-database',
            'siyuan-mcp-create-edit',
            'siyuan-mcp-markup-guide',
        ]));
        expect(evals.cases.filter((item: { expectedSkill: string | null }) => item.expectedSkill === null).length).toBeGreaterThanOrEqual(3);
        for (const item of evals.cases) {
            if (item.expectedSkill !== null) {
                expect(MCP_SKILLS.some((skill) => skill.name === item.expectedSkill), item.id).toBe(true);
            }
            expect(item.prompt.length, item.id).toBeGreaterThan(12);
            expect(item.reason.length, item.id).toBeGreaterThan(8);
        }
    });

    it('renders a discoverable index and scenario prompts', () => {
        const index = renderMcpSkillIndex();
        const prompts = listMcpPrompts();
        const prompt = getMcpPrompt('siyuan_create_edit', 'Append a summary.');

        expect(index).toContain('siyuan://help/action/{tool}/{action}');
        expect(prompts).toHaveLength(15);
        expect(index).toContain('siyuan-mcp-timeline');
        expect(index).toContain('siyuan-mcp-knowledge-ingest');
        expect(index).toContain('siyuan-mcp-project-knowledge-compile');
        expect(index).toContain('siyuan-mcp-project-coordinator');
        expect(index).toContain('siyuan-mcp-knowledge-governance');
        expect(index).toContain('siyuan-mcp-cross-project-relation-closure');
        expect(prompts).toContainEqual(expect.objectContaining({ name: 'siyuan_timeline' }));
        expect(prompts).toContainEqual(expect.objectContaining({ name: 'siyuan_knowledge_ingest' }));
        expect(prompts).toContainEqual(expect.objectContaining({ name: 'siyuan_project_knowledge_compile' }));
        expect(prompts).toContainEqual(expect.objectContaining({ name: 'siyuan_project_coordinator' }));
        expect(prompts).toContainEqual(expect.objectContaining({ name: 'siyuan_knowledge_governance' }));
        expect(prompts).toContainEqual(expect.objectContaining({ name: 'siyuan_cross_project_relation_closure' }));
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

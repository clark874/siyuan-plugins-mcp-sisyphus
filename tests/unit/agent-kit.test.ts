import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');

function read(relativePath: string): string {
    return readFileSync(path.join(root, relativePath), 'utf8');
}

describe('portable agent kit', () => {
    it('ships a client-neutral skill synchronized with the canonical MCP skill', () => {
        const canonical = read('skills/codex/siyuan/SKILL.md');
        const portable = read('agent-kit/skills/siyuan/SKILL.md');

        expect(portable).toBe(canonical);
        expect(portable).toContain('system(action="bootstrap")');
        expect(portable).not.toContain('mcp__siyuan__');
    });

    it('contains a parseable secret-free MCP template and accurate Kimi instructions', () => {
        const configText = read('agent-kit/mcp-config.example.json');
        const config = JSON.parse(configText);
        const manifest = JSON.parse(read('agent-kit/kimi.plugin.json'));
        const delivery = JSON.parse(read('agent-kit/delivery.json'));
        const releaseChannel = JSON.parse(read('release-channel.json'));
        const packageManifest = JSON.parse(read('package.json'));
        const codexManifest = JSON.parse(read('agent-plugin/siyuan-sisyphus/.codex-plugin/plugin.json'));
        const agent = read('agent-kit/AGENT.md');
        const kimi = read('agent-kit/KIMI.md');
        const start = read('agent-kit/START-HERE.md');

        expect(config.mcpServers.siyuan).toEqual({
            transport: 'http',
            url: 'http://127.0.0.1:36806/mcp',
            headers: {
                Authorization: 'Bearer <SIYUAN_MCP_TOKEN>',
            },
        });
        expect(manifest).toEqual(expect.objectContaining({
            name: 'siyuan-sisyphus-agent-kit',
            skills: './skills/',
            sessionStart: { skill: 'siyuan' },
        }));
        expect(codexManifest).toEqual(expect.objectContaining({
            name: 'siyuan-sisyphus',
            version: packageManifest.version,
            skills: './skills/',
            mcpServers: './.mcp.json',
        }));
        expect(delivery).toEqual(expect.objectContaining({
            packageVersion: packageManifest.version,
            distribution: {
                startHere: expect.stringContaining(`/v${packageManifest.version}/agent-kit/START-HERE.md`),
                archive: expect.stringContaining(`/v${packageManifest.version}/siyuan-agent-kit.zip`),
                stableChannel: expect.stringContaining('/main/release-channel.json'),
            },
            firstCall: { tool: 'system', action: 'bootstrap', expectedSchemaVersion: 3 },
            externalGateway: expect.objectContaining({
                url: 'http://127.0.0.1:36806/mcp',
                clientRegistration: 'required',
            }),
            officialMcp: expect.objectContaining({
                url: 'http://127.0.0.1:6806/mcp',
                clientRegistration: 'forbidden',
            }),
        }));
        expect(releaseChannel).toEqual(expect.objectContaining({
            schemaVersion: 1,
            channel: 'stable',
            version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
            package: expect.objectContaining({
                url: expect.stringContaining(`/v${releaseChannel.version}/package.zip`),
                sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            }),
            agentKit: expect.objectContaining({
                url: expect.stringContaining(`/v${releaseChannel.version}/siyuan-agent-kit.zip`),
                sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            }),
        }));
        expect(`${configText}\n${agent}\n${kimi}\n${start}\n${JSON.stringify(delivery)}`).not.toMatch(/Bearer\s+[a-f0-9]{64}\b/i);
        expect(agent).toContain('system(action="bootstrap")');
        expect(agent).toContain('operation.readOnly');
        expect(agent).toContain('`http://127.0.0.1:6806/mcp`');
        expect(agent).toContain('不要把它注册为第二个外部思源 MCP');
        expect(start).toContain('唯一外部 MCP');
        expect(start).toContain('scripts/install-agent-kit.mjs');
        expect(start).toContain('scripts/update-sisyphus.mjs --apply');
        expect(start).toContain('release-channel.json');
        expect(start).toContain('agentKit.url');
        expect(start).toContain('/releases/latest');
        expect(start).toContain('/main/agent-kit/START-HERE.md');
        expect(start).toContain('tree/main/skills/codex');
        expect(start).toContain('只安装 Skill');
        expect(start).toContain('不会注册');
        expect(start).not.toMatch(/github\.com\/clark874\/siyuan-plugins-mcp-sisyphus\/(?:releases\/download|releases\/tag)\/v\d/i);
        expect(start).not.toMatch(/raw\.githubusercontent\.com\/clark874\/siyuan-plugins-mcp-sisyphus\/v\d/i);
        expect(kimi).toContain('kimi mcp add --transport http');
        expect(kimi).toContain('kimi mcp test siyuan');
        expect(kimi).toContain('/skill:siyuan');
        expect(kimi).not.toContain('action="sql"');
        expect(kimi).not.toContain('action="diff"');

        for (const skillDirectory of readdirSync(path.join(root, 'agent-plugin/siyuan-sisyphus/skills'))) {
            const skill = read(`agent-plugin/siyuan-sisyphus/skills/${skillDirectory}/SKILL.md`);
            expect(skill).toContain('compatibility:');
            expect(skill).toContain('name: siyuan');
        }
    });

    it('迁移已确认旧入口到扫描根外，保留用户技能并安装唯一网关', () => {
        const temporaryHome = mkdtempSync(path.join(os.tmpdir(), 'sisyphus-agent-kit-'));
        const oldEntry = path.join(temporaryHome, '.agents/skills/siyuan-mcp-sisyphus');
        mkdirSync(oldEntry, { recursive: true });
        writeFileSync(path.join(oldEntry, 'SKILL.md'), '---\nname: siyuan-mcp-sisyphus\n---\n# SiYuan Sisyphus with MCP\n');
        const oldBrowse = path.join(temporaryHome, '.agents/skills/siyuan-mcp-browse-read');
        mkdirSync(oldBrowse, { recursive: true });
        writeFileSync(path.join(oldBrowse, 'SKILL.md'), '---\nname: siyuan-mcp-browse-read\ncompatibility: Requires a reachable SiYuan Sisyphus MCP server.\n---\n旧浏览技能');
        const customEntry = path.join(temporaryHome, '.agents/skills/siyuan-sisyphus-project-coordinator');
        mkdirSync(customEntry, { recursive: true });
        writeFileSync(path.join(customEntry, 'SKILL.md'), '用户自己的同名技能');
        const token = 'a'.repeat(64);
        const output = execFileSync(process.execPath, [
            path.join(root, 'agent-kit/scripts/install-agent-kit.mjs'),
            '--client', 'kimi',
            '--home', temporaryHome,
        ], {
            cwd: path.join(root, 'agent-kit'),
            env: { ...process.env, SIYUAN_MCP_TOKEN: token },
            encoding: 'utf8',
        });
        const configPath = path.join(temporaryHome, '.kimi-code/mcp.json');
        const configText = readFileSync(configPath, 'utf8');
        const config = JSON.parse(configText);
        const installedSkill = readFileSync(
            path.join(temporaryHome, '.agents/skills/siyuan/SKILL.md'),
            'utf8',
        );

        expect(config.mcpServers.siyuan).toEqual({
            transport: 'http',
            url: 'http://127.0.0.1:36806/mcp',
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(configText).not.toContain('127.0.0.1:6806/mcp');
        expect(statSync(configPath).mode & 0o777).toBe(0o600);
        expect(installedSkill).toBe(read('agent-kit/skills/siyuan/SKILL.md'));
        expect(readdirSync(path.join(temporaryHome, '.agents/skills')).sort()).toEqual(['siyuan', 'siyuan-sisyphus-project-coordinator']);
        expect(readFileSync(path.join(customEntry, 'SKILL.md'), 'utf8')).toBe('用户自己的同名技能');
        const backups = path.join(temporaryHome, '.agents/.sisyphus-skill-backups');
        const backup = readdirSync(backups)[0];
        expect(readFileSync(path.join(backups, backup, 'siyuan-mcp-sisyphus/SKILL.md'), 'utf8')).toContain('name: siyuan-mcp-sisyphus');
        expect(readFileSync(path.join(backups, backup, 'siyuan-mcp-browse-read/SKILL.md'), 'utf8')).toContain('name: siyuan-mcp-browse-read');
        expect(output).not.toContain(token);
        expect(output).toContain('system(action="bootstrap")');
        expect(output).toContain('installed_unverified');
    });

    it('遇到用户自有的 siyuan 目录时停止且不改配置', () => {
        const temporaryHome = mkdtempSync(path.join(os.tmpdir(), 'sisyphus-agent-kit-collision-'));
        const destination = path.join(temporaryHome, '.agents/skills/siyuan');
        mkdirSync(destination, { recursive: true });
        writeFileSync(path.join(destination, 'SKILL.md'), '用户自己的技能');
        const result = spawnSync(process.execPath, [path.join(root, 'agent-kit/scripts/install-agent-kit.mjs'),
            '--client', 'kimi', '--home', temporaryHome], {
            env: { ...process.env, SIYUAN_MCP_TOKEN: 'e'.repeat(64) }, encoding: 'utf8',
        });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('目标目录不属于本项目');
        expect(readFileSync(path.join(destination, 'SKILL.md'), 'utf8')).toBe('用户自己的技能');
        expect(readdirSync(temporaryHome)).toEqual(['.agents']);
    });

    it('checks only the configured Sisyphus gateway, reuses its token, and never prints the token', () => {
        const temporaryHome = mkdtempSync(path.join(os.tmpdir(), 'sisyphus-agent-kit-check-'));
        const configPath = path.join(temporaryHome, '.kimi-code/mcp.json');
        const token = 'd'.repeat(64);
        const failingFetchModule = `data:text/javascript,${encodeURIComponent(
            "globalThis.fetch = async () => { throw new TypeError('fetch failed'); };",
        )}`;
        mkdirSync(path.dirname(configPath), { recursive: true });
        writeFileSync(configPath, JSON.stringify({
            mcpServers: {
                siyuan: {
                    transport: 'http',
                    url: 'http://127.0.0.1:36806/mcp',
                    headers: { Authorization: `Bearer ${token}` },
                },
            },
        }));

        const result = spawnSync(process.execPath, [
            '--import', failingFetchModule,
            path.join(root, 'agent-kit/scripts/check-sisyphus.mjs'),
            '--client', 'kimi',
            '--home', temporaryHome,
            '--json',
            '--timeout', '100',
        ], {
            cwd: path.join(root, 'agent-kit'),
            encoding: 'utf8',
        });
        const combined = `${result.stdout}\n${result.stderr}`;

        expect(result.status).not.toBe(0);
        expect(combined).toMatch(/gateway_(?:not_running|unauthorized)/);
        expect(combined).not.toContain(token);
        expect(read('agent-kit/scripts/check-sisyphus.mjs')).not.toMatch(/(?:127\.0\.0\.1|localhost):6806\/mcp/);
    });

    it('preserves existing ZCode entries and keeps the built-in official endpoint visible for manual disablement', () => {
        const temporaryHome = mkdtempSync(path.join(os.tmpdir(), 'sisyphus-agent-kit-zcode-'));
        const configPath = path.join(temporaryHome, '.zcode/cli/config.json');
        mkdirSync(path.dirname(configPath), { recursive: true });
        writeFileSync(configPath, JSON.stringify({
            mcp: {
                servers: {
                    repoprompt: { type: 'stdio', command: 'repoprompt' },
                    siyuanOfficial: { type: 'http', url: 'http://localhost:6806/mcp/' },
                },
            },
        }));
        const token = 'b'.repeat(64);
        const result = execFileSync(process.execPath, [
            path.join(root, 'agent-kit/scripts/install-agent-kit.mjs'),
            '--client', 'zcode',
            '--home', temporaryHome,
        ], {
            cwd: path.join(root, 'agent-kit'),
            env: { ...process.env, SIYUAN_MCP_TOKEN: token },
            encoding: 'utf8',
        });
        const config = JSON.parse(readFileSync(configPath, 'utf8'));

        expect(config.mcp.servers.repoprompt).toEqual({ type: 'stdio', command: 'repoprompt' });
        expect(config.mcp.servers.siyuanOfficial.url).toBe('http://localhost:6806/mcp/');
        expect(config.mcp.servers.siyuan).toEqual(expect.objectContaining({
            type: 'http',
            url: 'http://127.0.0.1:36806/mcp',
            headers: { Authorization: `Bearer ${token}` },
        }));
        expect(result).not.toContain(token);
        expect(statSync(configPath).mode & 0o777).toBe(0o600);
        const backup = readdirSync(path.dirname(configPath)).find((name) => name.startsWith('config.json.backup-'));
        expect(backup).toBeDefined();
        expect(statSync(path.join(path.dirname(configPath), backup!)).mode & 0o777).toBe(0o600);
    });

    it('is idempotent and refuses to infer credentials from public package content', () => {
        const idempotentHome = mkdtempSync(path.join(os.tmpdir(), 'sisyphus-agent-kit-idempotent-'));
        const token = 'c'.repeat(64);
        const command = [
            path.join(root, 'agent-kit/scripts/install-agent-kit.mjs'),
            '--client', 'kimi',
            '--home', idempotentHome,
        ];
        execFileSync(process.execPath, command, {
            cwd: path.join(root, 'agent-kit'),
            env: { ...process.env, SIYUAN_MCP_TOKEN: token },
        });
        execFileSync(process.execPath, command, {
            cwd: path.join(root, 'agent-kit'),
            env: { ...process.env, SIYUAN_MCP_TOKEN: token },
        });
        expect(readdirSync(path.join(idempotentHome, '.kimi-code'))).toEqual(['mcp.json']);
        expect(readdirSync(path.join(idempotentHome, '.agents/skills'))).toEqual(['siyuan']);

        const temporaryHome = mkdtempSync(path.join(os.tmpdir(), 'sisyphus-agent-kit-no-secret-'));
        expect(() => execFileSync(process.execPath, [
            path.join(root, 'agent-kit/scripts/install-agent-kit.mjs'),
            '--client', 'zcode',
            '--home', temporaryHome,
        ], {
            cwd: path.join(root, 'agent-kit'),
            env: { ...process.env, SIYUAN_MCP_TOKEN: '' },
            stdio: 'pipe',
        })).toThrow();
    });

    it('states the two-layer MCP boundary in every portable and plugin entry point', () => {
        const entryPoints = [
            'agent-kit/START-HERE.md',
            'agent-kit/AGENT.md',
            'agent-kit/KIMI.md',
            'agent-kit/skills/siyuan/SKILL.md',
            'agent-plugin/siyuan-sisyphus/skills/siyuan/SKILL.md',
            'docs/思源-Agent-交接卡.md',
        ];
        for (const entryPoint of entryPoints) {
            const content = read(entryPoint);
            expect(content, entryPoint).toContain('36806/mcp');
            expect(content, entryPoint).toContain('6806/mcp');
        }
    });

    it('excludes operating-system metadata from the portable archive', () => {
        const builder = read('scripts/build-agent-kit.mjs');
        expect(builder).toContain("entry.name === '.DS_Store'");
        expect(builder).toContain("entry.name === '__MACOSX'");
        expect(builder).toContain('agent-plugin/siyuan-sisyphus/.codex-plugin/plugin.json');
    });
});

it('文献入库保留公式符号并识别补充材料与出版说明', async () => {
    const source = [
        'import importlib.util',
        'p="agent-kit/scripts/upload-notebooklm-literature.py"',
        's=importlib.util.spec_from_file_location("upload",p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)',
        'a=b"1. Effect $- Z$ equals 0.4.\\n\\n2. Next condition."',
        'b="Effect \\n- Z\\n equals 0.4.\\n\\nNext condition."',
        'assert m.check_fulltext(a,b)["exactNormalized"]',
        'assert m.check_fulltext(b"- First condition.\\n- Second condition.","First condition.\\nSecond condition.")["exactNormalized"]',
        'for changed in [b.replace("0.4","0.9"),b.replace("- Z","+ Z")]:',
        ' try: m.check_fulltext(a,changed)',
        ' except ValueError: pass',
        ' else: raise AssertionError("不得忽略数值或公式符号差异")',
        'try: m.check_fulltext(b"\\\\[\\n- Z = 0.4\\n\\\\]","Z = 0.4")',
        'except ValueError: pass',
        'else: raise AssertionError("不得删除显示公式减号")',
    ].join('\n');
    const checked = spawnSync('python3', ['-B', '-c', source], { cwd: root, encoding: 'utf8' });
    expect(checked.stderr).toBe('');
    expect(checked.status).toBe(0);
    const { classifyLiteratureRoles } = await import(path.join(root, 'agent-kit/scripts/tag-literature-roles.mjs'));
    const samples = ['Supplementary Materials: Code, Data, Materials', 'Figure 1', 'FE-SEM Framework',
        '[原文图像位置：；参见原始 PDF]', 'References', 'Smith, J. (2020). Evidence.',
        'Leibniz-Institut für Psychologie', 'PsychOpen GOLD is a publishing service provided by the institute.'];
    const roles = classifyLiteratureRoles(samples.map((sample, i) => ({ id: String(i), type: i === 4 ? 'h' : 'p', sample }))).roles;
    expect(roles.map((row: { role: string }) => row.role)).toEqual(['metadata', 'caption', 'caption', 'caption', 'references', 'references', 'metadata', 'metadata']);
});

it('入库复用书目对账，支持网址与正文版本并在预检后拦截并发修改', async () => {
    const { projectRecord, synchronizeCatalogCells } = await import(path.join(root, 'agent-kit/scripts/sync-literature-catalog.mjs'));
    const documentId = '20261101000000-aaaaaaa', rowID = '20261101000001-bbbbbbb', key = 'ABCD1234';
    const item = { key, version: 2, title: 'Sentence case', url: 'https://doi.org/10.1234/test' };
    const raw = { av: { keyValues: [{ key: { type: 'block', name: '主键' }, values: [{ blockID: rowID, block: { id: documentId } }] },
        ...Object.entries(projectRecord(item)).map(([name, value]) => ({ key: { id: name, name, type: name === '网址' ? 'url' : 'text' },
            values: [{ blockID: rowID, [name === '网址' ? 'url' : 'text']: { content: name === '题名' ? 'SENTENCE CASE' : value } }] }))] } };
    const readAv = async () => structuredClone(raw);
    const options = { avID: '20261101000002-ccccccc', records: [{ documentId, zoteroKey: key, sourceVersion: '2026-04-02 CVoR' }],
        readAv, readItems: async () => new Map([[key, item]]), report: {}, persist: async () => {} };
    const avWrite = async (args: any, verify: () => Promise<void>) => {
        await verify();
        for (const cell of args.cells) {
            const column = raw.av.keyValues.find((c: any) => c.key.id === cell.columnID) as any;
            column.values[0][cell.valueType].content = cell.text ?? cell.url;
        }
    };
    await synchronizeCatalogCells({ ...options, avWrite });
    expect((raw.av.keyValues.find((c: any) => c.key.name === '正文版本') as any).values[0].text.content).toBe('2026-04-02 CVoR');
    item.title = 'Another title';
    await expect(synchronizeCatalogCells({ ...options, avWrite: async (_args: any, verify: () => Promise<void>) => {
        (raw.av.keyValues.find((c: any) => c.key.name === '题名') as any).values[0].text.content = '用户并发编辑';
        await verify();
    } })).rejects.toThrow('并发编辑');
});

it('Antigravity 安装保留中央软链、其他服务与私密权限，预检不写入', () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'sisyphus-antigravity-'));
    const central = path.join(home, '.gemini/config'), client = path.join(home, '.gemini/antigravity');
    mkdirSync(path.join(central, 'skills'), { recursive: true });
    mkdirSync(client, { recursive: true });
    symlinkSync('../config/skills', path.join(client, 'skills'));
    const configPath = path.join(central, 'mcp_config.json');
    const original = { mcpServers: { RepoPrompt: { command: '/bin/repoprompt' }, thinking: { disabled: true, command: 'thinking' } } };
    writeFileSync(configPath, JSON.stringify(original));
    symlinkSync('../config/mcp_config.json', path.join(client, 'mcp_config.json'));
    const token = 'f'.repeat(64), command = [path.join(root, 'agent-kit/scripts/install-agent-kit.mjs'), '--client', 'antigravity', '--home', home];
    const options = { env: { ...process.env, SIYUAN_MCP_TOKEN: token }, encoding: 'utf8' as const };
    execFileSync(process.execPath, [...command, '--dry-run'], options);
    expect(readFileSync(configPath, 'utf8')).toBe(JSON.stringify(original));
    expect(existsSync(path.join(central, 'skills/siyuan'))).toBe(false);
    expect(existsSync(path.join(home, '.siyuan-sisyphus'))).toBe(false);
    const output = execFileSync(process.execPath, command, options);
    expect(lstatSync(path.join(client, 'mcp_config.json')).isSymbolicLink()).toBe(true);
    expect(lstatSync(path.join(client, 'skills')).isSymbolicLink()).toBe(true);
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual({ mcpServers: { ...original.mcpServers,
        siyuan: { serverUrl: 'http://127.0.0.1:36806/mcp', headers: { Authorization: `Bearer ${token}` } } } });
    expect(readFileSync(path.join(central, 'skills/siyuan/SKILL.md'), 'utf8')).toBe(read('agent-kit/skills/siyuan/SKILL.md'));
    expect(statSync(configPath).mode & 0o777).toBe(0o600);
    const files = readdirSync(central);
    expect(files.some(file => file.startsWith('mcp_config.json.backup-'))).toBe(true);
    execFileSync(process.execPath, command, options);
    expect(readdirSync(central)).toEqual(files);
    const failedFetch = `data:text/javascript,${encodeURIComponent("globalThis.fetch=async()=>{throw new TypeError('fetch failed')}")}`;
    const checked = spawnSync(process.execPath, ['--import', failedFetch, path.join(root, 'agent-kit/scripts/check-sisyphus.mjs'),
        '--client', 'antigravity', '--home', home, '--json'], { encoding: 'utf8' });
    expect(checked.stdout).toContain('gateway_not_running');
    expect(`${output}${checked.stdout}${checked.stderr}`).not.toContain(token);
});

it('Antigravity 遇到用户技能停止且不创建配置', () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'sisyphus-antigravity-conflict-'));
    const skill = path.join(home, '.gemini/antigravity/skills/siyuan/SKILL.md');
    mkdirSync(path.dirname(skill), { recursive: true });
    writeFileSync(skill, '用户自己的技能');
    const result = spawnSync(process.execPath, [path.join(root, 'agent-kit/scripts/install-agent-kit.mjs'), '--client', 'antigravity', '--home', home],
        { env: { ...process.env, SIYUAN_MCP_TOKEN: 'f'.repeat(64) }, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(readFileSync(skill, 'utf8')).toBe('用户自己的技能');
    expect(existsSync(path.join(home, '.gemini/antigravity/mcp_config.json'))).toBe(false);
});

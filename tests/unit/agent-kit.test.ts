import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');

function read(relativePath: string): string {
    return readFileSync(path.join(root, relativePath), 'utf8');
}

describe('portable agent kit', () => {
    it('ships a client-neutral skill synchronized with the canonical MCP skill', () => {
        const canonical = read('skills/siyuan-mcp/siyuan-mcp-sisyphus/SKILL.md');
        const portable = read('agent-kit/skills/siyuan-mcp-sisyphus/SKILL.md');

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
            sessionStart: { skill: 'siyuan-mcp-sisyphus' },
        }));
        expect(delivery).toEqual(expect.objectContaining({
            distribution: {
                startHere: expect.stringContaining('/v0.8.9-wiki.2/agent-kit/START-HERE.md'),
                archive: expect.stringContaining('/v0.8.9-wiki.2/siyuan-agent-kit.zip'),
                stableChannel: expect.stringContaining('/codex/local-maintenance/release-channel.json'),
            },
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
            version: '0.8.9-wiki.2',
            package: expect.objectContaining({
                url: expect.stringContaining('/v0.8.9-wiki.2/package.zip'),
                sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            }),
            agentKit: expect.objectContaining({
                url: expect.stringContaining('/v0.8.9-wiki.2/siyuan-agent-kit.zip'),
                sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            }),
        }));
        expect(`${configText}\n${agent}\n${kimi}\n${start}\n${JSON.stringify(delivery)}`).not.toMatch(/Bearer\s+[a-f0-9]{64}\b/i);
        expect(agent).toContain('system(action="bootstrap")');
        expect(agent).toContain('operation.readOnly');
        expect(agent).toContain('不要把 `http://127.0.0.1:6806/mcp`');
        expect(start).toContain('唯一外部 MCP');
        expect(start).toContain('scripts/install-agent-kit.mjs');
        expect(start).toContain('scripts/update-sisyphus.mjs --apply');
        expect(kimi).toContain('kimi mcp add --transport http');
        expect(kimi).toContain('kimi mcp test siyuan');
        expect(kimi).toContain('/skill:siyuan-mcp-sisyphus');
        expect(kimi).not.toContain('action="sql"');
        expect(kimi).not.toContain('action="diff"');
    });

    it('installs the canonical skill and the single Sisyphus gateway without printing the token', () => {
        const temporaryHome = mkdtempSync(path.join(os.tmpdir(), 'sisyphus-agent-kit-'));
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
            path.join(temporaryHome, '.agents/skills/siyuan-mcp-sisyphus/SKILL.md'),
            'utf8',
        );

        expect(config.mcpServers.siyuan).toEqual({
            transport: 'http',
            url: 'http://127.0.0.1:36806/mcp',
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(configText).not.toContain('127.0.0.1:6806/mcp');
        expect(statSync(configPath).mode & 0o777).toBe(0o600);
        expect(installedSkill).toBe(read('agent-kit/skills/siyuan-mcp-sisyphus/SKILL.md'));
        expect(output).not.toContain(token);
        expect(output).toContain('system(action="bootstrap")');
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
        expect(readdirSync(path.join(idempotentHome, '.agents/skills'))).toEqual(['siyuan-mcp-sisyphus']);

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
            'agent-kit/skills/siyuan-mcp-sisyphus/SKILL.md',
            'agent-plugin/siyuan-sisyphus/skills/siyuan-mcp-sisyphus/SKILL.md',
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
    });
});

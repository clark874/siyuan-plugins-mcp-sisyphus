import { readFileSync } from 'node:fs';
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
        const agent = read('agent-kit/AGENT.md');
        const kimi = read('agent-kit/KIMI.md');

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
        expect(`${configText}\n${agent}\n${kimi}`).not.toMatch(/Bearer\s+[a-f0-9]{64}\b/i);
        expect(agent).toContain('system(action="bootstrap")');
        expect(agent).toContain('operation.readOnly');
        expect(kimi).toContain('kimi mcp add --transport http');
        expect(kimi).toContain('kimi mcp test siyuan');
        expect(kimi).toContain('/skill:siyuan-mcp-sisyphus');
        expect(kimi).not.toContain('action="sql"');
        expect(kimi).not.toContain('action="diff"');
    });
});

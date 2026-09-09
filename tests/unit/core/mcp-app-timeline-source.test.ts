import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('时间线 MCP App 源码契约', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/mcp-apps/index.ts'), 'utf8');

    it('只调用三个保留动作', () => {
        expect(source).toContain("'list_nodes' | 'create_node' | 'compare_node'");
        expect(source).not.toContain('rollback_document');
        expect(source).not.toContain('rollback_block');
        expect(source).not.toContain('delete_node');
    });

    it('不包含旧商店与闪卡界面', () => {
        expect(source).not.toContain('mascot');
        expect(source).not.toContain('shop');
        expect(source).not.toContain('flashcard');
    });
});

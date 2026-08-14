import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const updater = path.join(root, 'agent-kit/scripts/update-sisyphus.mjs');
const pluginName = 'siyuan-plugins-mcp-sisyphus';

async function prepareFixture(options: { hash?: string; unsafeEntry?: string } = {}) {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'sisyphus-updater-'));
    const pluginDirectory = path.join(directory, 'plugins', pluginName);
    mkdirSync(pluginDirectory, { recursive: true });
    writeFileSync(path.join(pluginDirectory, 'plugin.json'), JSON.stringify({
        name: pluginName,
        version: '0.8.0-wiki.1',
    }));
    writeFileSync(path.join(pluginDirectory, 'mcp-server.cjs'), 'old-server');

    const zip = new JSZip();
    zip.folder('assets');
    zip.file('assets/icon.txt', 'icon');
    zip.file('plugin.json', JSON.stringify({ name: pluginName, version: '0.8.1-wiki.1' }));
    zip.file('mcp-server.cjs', 'new-server');
    if (options.unsafeEntry) zip.file(options.unsafeEntry, 'unsafe');
    const archive = await zip.generateAsync({ type: 'nodebuffer' });
    const packageFile = path.join(directory, 'package.zip');
    writeFileSync(packageFile, archive);
    const channelFile = path.join(directory, 'release-channel.json');
    writeFileSync(channelFile, JSON.stringify({
        schemaVersion: 1,
        channel: 'stable',
        version: '0.8.1-wiki.1',
        package: {
            url: 'https://example.invalid/package.zip',
            sha256: options.hash ?? createHash('sha256').update(archive).digest('hex'),
        },
    }));
    return { directory, pluginDirectory, packageFile, channelFile };
}

function run(fixture: Awaited<ReturnType<typeof prepareFixture>>, extraArgs: string[] = []) {
    return execFileSync(process.execPath, [
        updater,
        '--plugin-dir', fixture.pluginDirectory,
        '--channel-file', fixture.channelFile,
        '--package-file', fixture.packageFile,
        ...extraArgs,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

describe('Sisyphus 中央更新器', () => {
    it('默认只检查版本，不修改插件或客户端配置', async () => {
        const fixture = await prepareFixture();
        const output = run(fixture);

        expect(output).toContain('可更新：0.8.0-wiki.1 → 0.8.1-wiki.1');
        expect(JSON.parse(readFileSync(path.join(fixture.pluginDirectory, 'plugin.json'), 'utf8')).version)
            .toBe('0.8.0-wiki.1');
        expect(readdirSync(path.join(fixture.directory, 'plugins'))).toEqual([pluginName]);
    });

    it('校验哈希后备份并原子替换唯一插件实例', async () => {
        const fixture = await prepareFixture();
        const output = run(fixture, ['--apply']);

        expect(output).toContain('更新完成：0.8.1-wiki.1');
        expect(output).toContain('重启思源');
        expect(JSON.parse(readFileSync(path.join(fixture.pluginDirectory, 'plugin.json'), 'utf8')).version)
            .toBe('0.8.1-wiki.1');
        expect(readFileSync(path.join(fixture.pluginDirectory, 'mcp-server.cjs'), 'utf8')).toBe('new-server');
        const backups = readdirSync(path.join(fixture.directory, 'plugins', '.sisyphus-backups'));
        expect(backups).toHaveLength(1);
        expect(readFileSync(path.join(
            fixture.directory,
            'plugins',
            '.sisyphus-backups',
            backups[0],
            'mcp-server.cjs',
        ), 'utf8')).toBe('old-server');
    });

    it('哈希不符时失败关闭且不触碰现有插件', async () => {
        const fixture = await prepareFixture({ hash: '0'.repeat(64) });

        expect(() => run(fixture, ['--apply'])).toThrow();
        expect(readFileSync(path.join(fixture.pluginDirectory, 'mcp-server.cjs'), 'utf8')).toBe('old-server');
        expect(readdirSync(path.join(fixture.directory, 'plugins'))).toEqual([pluginName]);
    });

    it('拒绝包含路径穿越条目的安装包', async () => {
        const fixture = await prepareFixture({ unsafeEntry: '../escape.txt' });

        expect(() => run(fixture, ['--apply'])).toThrow();
        expect(readFileSync(path.join(fixture.pluginDirectory, 'mcp-server.cjs'), 'utf8')).toBe('old-server');
    });
});

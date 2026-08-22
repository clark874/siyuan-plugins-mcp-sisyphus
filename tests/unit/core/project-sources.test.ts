import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    PROJECT_SOURCE_REGISTRY_PATH,
    listProjectSources,
    readProjectSourceState,
    registerProjectSource,
    resolveProjectSource,
    scanProjectManifest,
} from '@/core/project-sources';

function createStorageClient() {
    const files = new Map<string, string>();
    return {
        files,
        client: {
            async readFile(filePath: string) {
                const value = files.get(filePath);
                if (value === undefined) throw new Error(`File not found: ${filePath}`);
                return value;
            },
            async writeFile(filePath: string, content: string) {
                files.set(filePath, content);
            },
        } as never,
    };
}

function createDirectoryProject() {
    const root = mkdtempSync(path.join(os.tmpdir(), 'sisyphus-project-source-'));
    mkdirSync(path.join(root, 'src'));
    mkdirSync(path.join(root, 'data'));
    mkdirSync(path.join(root, 'node_modules'));
    writeFileSync(path.join(root, 'src/index.ts'), 'export const answer = 42;\n');
    writeFileSync(path.join(root, 'data/input.csv'), 'id,value\n1,42\n');
    writeFileSync(path.join(root, 'README.md'), '# Demo\n');
    writeFileSync(path.join(root, 'node_modules/cache.js'), 'generated');
    return root;
}

describe('project source registry', () => {
    it('initializes when SiYuan returns a missing-file JSON envelope', async () => {
        const root = createDirectoryProject();
        const files = new Map<string, string>();
        const client = {
            async readFile(filePath: string) {
                return files.get(filePath) ?? JSON.stringify({ code: 404, msg: 'file not found', data: null });
            },
            async writeFile(filePath: string, content: string) {
                files.set(filePath, content);
            },
        } as never;

        const registered = await registerProjectSource(client, {
            projectId: 'envelope-project',
            workspaceRoot: root,
            sourceKind: 'directory',
        }, { hostId: 'host-test' });

        expect(registered).toMatchObject({ projectId: 'envelope-project', manifestStatus: 'missing' });
        expect(JSON.parse(files.get(PROJECT_SOURCE_REGISTRY_PATH)!).projects).toHaveLength(1);
    });

    it('registers a portable identity separately from the host binding', async () => {
        const root = createDirectoryProject();
        const realRoot = realpathSync(root);
        const { client, files } = createStorageClient();

        const result = await registerProjectSource(client, {
            projectId: 'demo-project',
            workspaceRoot: root,
            sourceKind: 'directory',
            hubBlockId: '20260822100000-hub0001',
            manifestBlockId: '20260822100001-man0001',
            coverage: 'complete',
            access: 'read-only',
            coreFiles: [
                { relativePath: 'src/index.ts', role: 'source' },
                { relativePath: 'data/input.csv', role: 'data' },
            ],
        }, { hostId: 'host-test' });

        expect(result).toMatchObject({
            projectId: 'demo-project',
            sourceKind: 'directory',
            coverage: 'complete',
            binding: {
                hostId: 'host-test',
                workspaceRoot: realRoot,
                checkoutKind: 'plain-directory',
                access: 'read-only',
                status: 'available',
            },
        });
        const stored = JSON.parse(files.get(PROJECT_SOURCE_REGISTRY_PATH)!);
        expect(stored.projects[0].workspaceRoot).toBeUndefined();
        expect(stored.projects[0].bindings['host-test'].workspaceRoot).toBe(realRoot);
    });

    it('builds an A/B/C manifest without reading excluded cache trees', async () => {
        const root = createDirectoryProject();
        const { client } = createStorageClient();
        await registerProjectSource(client, {
            projectId: 'demo-project',
            workspaceRoot: root,
            sourceKind: 'directory',
            coverage: 'complete',
            coreFiles: [
                { relativePath: 'src/index.ts', role: 'source' },
                { relativePath: 'data/input.csv', role: 'data' },
            ],
        }, { hostId: 'host-test' });

        const manifest = await scanProjectManifest(client, {
            projectId: 'demo-project',
            maxEntries: 100,
        }, { hostId: 'host-test' });

        expect(manifest.counts).toEqual({ a: 2, b: 1, c: 1 });
        expect(manifest.coreFiles).toEqual(expect.arrayContaining([
            expect.objectContaining({ relativePath: 'src/index.ts', tier: 'A', role: 'source', hash: expect.stringMatching(/^sha256:/) }),
            expect.objectContaining({ relativePath: 'data/input.csv', tier: 'A', role: 'data', hash: expect.stringMatching(/^sha256:/) }),
        ]));
        expect(manifest.exclusions).toEqual(expect.arrayContaining([
            expect.objectContaining({ relativePath: 'node_modules', reason: 'dependency_cache' }),
        ]));
        expect(JSON.stringify(manifest)).not.toContain('cache.js');
        expect(manifest.manifestHash).toMatch(/^sha256:v1:[a-f0-9]{64}$/);

        const rescanned = await scanProjectManifest(client, {
            projectId: 'demo-project',
            maxEntries: 100,
        }, { hostId: 'host-test' });
        expect(rescanned.manifestHash).toBe(manifest.manifestHash);
    });

    it('accepts a curated include path that identifies one file', async () => {
        const root = createDirectoryProject();
        const { client } = createStorageClient();
        await registerProjectSource(client, {
            projectId: 'curated-project',
            workspaceRoot: root,
            sourceKind: 'directory',
            coverage: 'curated',
            includePaths: ['README.md'],
            coreFiles: [{ relativePath: 'README.md', role: 'source' }],
        }, { hostId: 'host-test' });

        const manifest = await scanProjectManifest(client, {
            projectId: 'curated-project',
        }, { hostId: 'host-test' });

        expect(manifest.counts).toEqual({ a: 1, b: 0, c: 0 });
        expect(manifest.coreFiles[0]).toMatchObject({ relativePath: 'README.md', role: 'source' });
    });

    it('fails closed when filesystem traversal exceeds the configured ceiling', async () => {
        const root = createDirectoryProject();
        const { client } = createStorageClient();
        await registerProjectSource(client, {
            projectId: 'bounded-project',
            workspaceRoot: root,
            sourceKind: 'directory',
            coverage: 'complete',
        }, { hostId: 'host-test' });

        await expect(scanProjectManifest(client, {
            projectId: 'bounded-project',
            maxEntries: 2,
        }, { hostId: 'host-test' })).rejects.toThrow(/maxEntries=2/);
    });

    it('keeps A-tier metadata when the total hash-read budget is exhausted', async () => {
        const root = createDirectoryProject();
        const { client } = createStorageClient();
        await registerProjectSource(client, {
            projectId: 'hash-budget-project',
            workspaceRoot: root,
            sourceKind: 'directory',
            coverage: 'complete',
            coreFiles: [
                { relativePath: 'data/input.csv', role: 'data' },
                { relativePath: 'src/index.ts', role: 'source' },
            ],
        }, { hostId: 'host-test' });

        const manifest = await scanProjectManifest(client, {
            projectId: 'hash-budget-project',
            maxTotalHashBytes: 20,
        }, { hostId: 'host-test' });

        expect(manifest.coreFiles).toEqual(expect.arrayContaining([
            expect.objectContaining({ relativePath: 'data/input.csv', hash: expect.stringMatching(/^sha256:/) }),
            expect.objectContaining({ relativePath: 'src/index.ts', hashStatus: 'skipped_total_budget' }),
        ]));
        expect(manifest.hashBytesRead).toBeLessThanOrEqual(20);
        expect(manifest.hashCoverageComplete).toBe(false);
    });

    it('resolves only registered relative paths and never returns file content', async () => {
        const root = createDirectoryProject();
        const { client } = createStorageClient();
        await registerProjectSource(client, {
            projectId: 'demo-project',
            workspaceRoot: root,
            sourceKind: 'directory',
            coverage: 'complete',
            coreFiles: [{ relativePath: 'src/index.ts', role: 'source' }],
        }, { hostId: 'host-test' });
        await scanProjectManifest(client, { projectId: 'demo-project' }, { hostId: 'host-test' });

        const resolved = await resolveProjectSource(client, {
            projectId: 'demo-project',
            relativePath: 'src/index.ts',
        }, { hostId: 'host-test' });

        expect(resolved).toMatchObject({
            projectId: 'demo-project',
            relativePath: 'src/index.ts',
            resolvedPath: path.join(realpathSync(root), 'src/index.ts'),
            listed: true,
            exists: true,
            contentRead: false,
            entry: { tier: 'A', role: 'source' },
        });
        expect(JSON.stringify(resolved)).not.toContain(readFileSync(path.join(root, 'src/index.ts'), 'utf8'));
        await expect(resolveProjectSource(client, {
            projectId: 'demo-project',
            relativePath: '../secret.txt',
        }, { hostId: 'host-test' })).rejects.toThrow(/relativePath/i);
        await expect(resolveProjectSource(client, {
            projectId: 'demo-project',
            relativePath: 'C:\\secret.txt',
        }, { hostId: 'host-test' })).rejects.toThrow(/relativePath/i);
    });

    it('rejects a symlink that resolves outside the registered root', async () => {
        const root = createDirectoryProject();
        const outside = mkdtempSync(path.join(os.tmpdir(), 'sisyphus-project-outside-'));
        writeFileSync(path.join(outside, 'secret.txt'), 'secret');
        symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'outside-link'));
        const { client } = createStorageClient();
        await registerProjectSource(client, {
            projectId: 'demo-project',
            workspaceRoot: root,
            sourceKind: 'directory',
            coverage: 'complete',
        }, { hostId: 'host-test' });

        await expect(resolveProjectSource(client, {
            projectId: 'demo-project',
            relativePath: 'outside-link',
        }, { hostId: 'host-test' })).rejects.toThrow(/outside|symlink|root/i);
    });

    it('detects a stale git binding after the checkout revision changes', async () => {
        const root = mkdtempSync(path.join(os.tmpdir(), 'sisyphus-project-git-'));
        execFileSync('git', ['init', '-q', root]);
        execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
        execFileSync('git', ['-C', root, 'config', 'user.name', 'Sisyphus Test']);
        writeFileSync(path.join(root, 'README.md'), '# one\n');
        execFileSync('git', ['-C', root, 'add', 'README.md']);
        execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'one']);
        const { client } = createStorageClient();
        await registerProjectSource(client, {
            projectId: 'git-project',
            workspaceRoot: root,
            sourceKind: 'git',
            coverage: 'tracked',
            coreFiles: [{ relativePath: 'README.md', role: 'source' }],
        }, { hostId: 'host-test' });
        await scanProjectManifest(client, { projectId: 'git-project' }, { hostId: 'host-test' });

        writeFileSync(path.join(root, 'README.md'), '# two\n');
        execFileSync('git', ['-C', root, 'add', 'README.md']);
        execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'two']);

        await registerProjectSource(client, {
            projectId: 'git-project',
            workspaceRoot: root,
            sourceKind: 'git',
            coverage: 'tracked',
        }, { hostId: 'host-test' });

        const [listed] = (await listProjectSources(client, {}, { hostId: 'host-test' })).data;
        expect(listed.binding.status).toBe('stale');
        expect(listed.revision).toBe(listed.manifest.revision);
        expect(listed.binding.workspaceRoot).toBeUndefined();
        const state = await readProjectSourceState(client, 'git-project', { hostId: 'host-test' });
        expect(state.bindingStatus).toBe('stale');
    });
});
